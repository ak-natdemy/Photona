import os
import io
import logging
import numpy as np
import faiss
from PIL import Image, ImageOps
from scipy.spatial.distance import squareform
from scipy.cluster.hierarchy import linkage, fcluster
from django.core.files.base import ContentFile

from core.database import load_face_records
from events.models import Event, EventPerson, EventPhoto

logger = logging.getLogger(__name__)

_face_app_singleton = None


def get_cached_face_app():
    global _face_app_singleton
    if _face_app_singleton is None:
        try:
            from core.detector import load_face_model
            _face_app_singleton = load_face_model()
        except Exception as e:
            logger.warning("Could not initialize face model: %s", e)
    return _face_app_singleton


def get_photo_faces_cached(photo, app, cache):
    """
    Get detected faces and RGB image array for a photo with in-memory caching.
    Uses thumbnail when available for blazing-fast 30ms detection.
    """
    if photo.id in cache:
        return cache[photo.id]

    import cv2

    img_path = None
    if photo.thumbnail and os.path.exists(photo.thumbnail.path):
        img_path = photo.thumbnail.path
    elif photo.image and os.path.exists(photo.image.path):
        img_path = photo.image.path

    if not img_path:
        cache[photo.id] = (None, [])
        return cache[photo.id]

    img = cv2.imread(img_path)
    if img is None:
        cache[photo.id] = (None, [])
        return cache[photo.id]

    h, w = img.shape[:2]
    max_d = max(h, w)
    if max_d > 1280:
        scale = 1280.0 / float(max_d)
        nw = max(1, int(round(w * scale)))
        nh = max(1, int(round(h * scale)))
        img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    faces = app.get(img_rgb)
    cache[photo.id] = (img_rgb, faces)
    return cache[photo.id]


def crop_hd_face_avatar(photo, target_embedding, app, cache):
    """
    Generate a crystal-clear, high-definition square face avatar.
    Fast face matching is performed using the cached detection, but the avatar
    is cropped directly from the FULL-RESOLUTION original master file before
    any resizing, preserving razor-sharp studio quality.
    """
    if not photo or not photo.image or not os.path.exists(photo.image.path):
        return None

    img_rgb, faces = get_photo_faces_cached(photo, app, cache)
    if img_rgb is None or not faces:
        return None

    try:
        norm_target = target_embedding / (np.linalg.norm(target_embedding) + 1e-7)

        # Match the face having highest cosine similarity to target_embedding
        best_face = max(
            faces,
            key=lambda f: float(np.dot(f.embedding / (np.linalg.norm(f.embedding) + 1e-7), norm_target))
        )

        detect_h, detect_w, _ = img_rgb.shape

        # Normalized coordinates (0.0 to 1.0)
        nx1 = max(0.0, float(best_face.bbox[0]) / detect_w)
        ny1 = max(0.0, float(best_face.bbox[1]) / detect_h)
        nx2 = min(1.0, float(best_face.bbox[2]) / detect_w)
        ny2 = min(1.0, float(best_face.bbox[3]) / detect_h)

        # Open the ORIGINAL FULL-RESOLUTION uncompressed master image
        full_pil = Image.open(photo.image.path)
        try:
            full_pil = ImageOps.exif_transpose(full_pil)
        except Exception:
            pass

        ow, oh = full_pil.size

        fx1 = int(nx1 * ow)
        fy1 = int(ny1 * oh)
        fx2 = int(nx2 * ow)
        fy2 = int(ny2 * oh)

        bw = fx2 - fx1
        bh = fy2 - fy1
        margin_x = int(bw * 0.38)
        margin_y = int(bh * 0.38)

        cx1 = max(0, fx1 - margin_x)
        cy1 = max(0, fy1 - margin_y)
        cx2 = min(ow, fx2 + margin_x)
        cy2 = min(oh, fy2 + margin_y)

        crop = full_pil.crop((cx1, cy1, cx2, cy2))
        cw, ch = crop.size
        min_dim = min(cw, ch)
        left = (cw - min_dim) // 2
        top = (ch - min_dim) // 2
        crop = crop.crop((left, top, left + min_dim, top + min_dim))

        # Output high-definition 360x360 avatar with lanczos resampling and high quality
        crop = crop.resize((360, 360), Image.Resampling.LANCZOS)
        if crop.mode not in ("RGB", "L"):
            crop = crop.convert("RGB")

        out = io.BytesIO()
        crop.save(out, format="JPEG", quality=95, optimize=True)
        return ContentFile(out.getvalue())
    except Exception as e:
        logger.warning("Failed to crop HD avatar for photo %s: %s", photo.id, e)
        return None


def cluster_event_people(event, threshold=0.52, merge_threshold=0.44):
    """
    Cluster face records for an event and create/update EventPerson groups.
    Ensures:
    1. One distinct cluster per person without duplicate classes.
    2. Centroid-merging so different photos of the same person are unified.
    3. Crystal-clear HD avatars cropped directly from original full-res images.
    4. Caches photo detections so clustering runs in seconds.
    """
    try:
        face_records = load_face_records(event.id)
    except FileNotFoundError:
        logger.warning("No face records found for event %s", event.id)
        return 0

    if not face_records:
        return 0

    embeddings = np.array([r["embedding"] for r in face_records], dtype=np.float32)
    faiss.normalize_L2(embeddings)

    sims = np.dot(embeddings, embeddings.T)
    distances = np.clip(1.0 - sims, 0, 2.0)
    condensed_dist = squareform(distances, checks=False)

    # Stage 1: Initial hierarchical average linkage
    Z = linkage(condensed_dist, method="average")
    labels = fcluster(Z, t=threshold, criterion="distance")

    clusters_dict = {}
    for idx, label in enumerate(labels):
        clusters_dict.setdefault(label, []).append(idx)

    cluster_list = list(clusters_dict.values())

    # Stage 2: Iterative centroid merging to combine split angles/lighting of the same person
    merged = True
    while merged:
        merged = False
        centroids = []
        for c in cluster_list:
            cent = np.mean(embeddings[c], axis=0)
            cent /= np.linalg.norm(cent) + 1e-7
            centroids.append(cent)
        centroids = np.array(centroids)

        sim_matrix = np.dot(centroids, centroids.T)
        np.fill_diagonal(sim_matrix, 0)

        best_i, best_j = np.unravel_index(np.argmax(sim_matrix), sim_matrix.shape)
        best_sim = sim_matrix[best_i, best_j]

        if best_sim >= merge_threshold:
            cluster_list[best_i].extend(cluster_list[best_j])
            cluster_list.pop(best_j)
            merged = True

    # Count faces per photo in the event to prefer portrait/solo photos for avatar
    photo_face_counts = {}
    for r in face_records:
        photo_face_counts[r["image_id"]] = photo_face_counts.get(r["image_id"], 0) + 1

    # Sort clusters descending by number of photos/faces
    sorted_clusters = sorted(cluster_list, key=len, reverse=True)

    # Existing people records
    existing_people = list(event.people.all())
    assigned_existing = set()

    face_app = get_cached_face_app()
    photo_cache = {}
    created_or_updated_people = []

    for person_num, cluster_indices in enumerate(sorted_clusters, start=1):
        cluster_recs = [face_records[i] for i in cluster_indices]
        image_ids = list(dict.fromkeys(r["image_id"] for r in cluster_recs))
        matching_photos = list(event.photos.filter(id__in=image_ids))
        if not matching_photos:
            continue

        # Compute cluster centroid
        cluster_centroid = np.mean(embeddings[cluster_indices], axis=0)
        cluster_centroid /= np.linalg.norm(cluster_centroid) + 1e-7

        # Find best matching photo for avatar:
        # Prefer photos with FEWER faces (portraits/solos are clearer and sharper)
        best_rec = min(cluster_recs, key=lambda r: photo_face_counts.get(r["image_id"], 999))
        best_photo = next((p for p in matching_photos if p.id == best_rec["image_id"]), matching_photos[0])

        # Preserve custom names if user already renamed an existing person
        matched_existing = None
        for ep in existing_people:
            if ep.id in assigned_existing:
                continue
            if not ep.name.startswith("Person "):
                ep_photo_ids = set(ep.photos.values_list("id", flat=True))
                overlap = len(set(image_ids) & ep_photo_ids) / len(set(image_ids) | ep_photo_ids) if ep_photo_ids else 0
                if overlap > 0.4:
                    matched_existing = ep
                    break

        if matched_existing:
            person = matched_existing
            assigned_existing.add(person.id)
        elif person_num <= len(existing_people):
            person = existing_people[person_num - 1]
            assigned_existing.add(person.id)
            if person.name.startswith("Person "):
                person.name = f"Person {person_num}"
        else:
            person = EventPerson.objects.create(
                event=event,
                name=f"Person {person_num}"
            )

        person.photos.set(matching_photos)
        person.face_count = len(cluster_recs)

        # Generate / refresh crystal-clear HD avatar cropped from full original master file
        avatar_content = crop_hd_face_avatar(
            best_photo,
            cluster_centroid,
            app=face_app,
            cache=photo_cache
        )
        if avatar_content:
            avatar_name = f"hd_avatar_p{person.id}_{best_photo.id}.jpg"
            person.avatar.save(avatar_name, avatar_content, save=False)

        person.save()
        created_or_updated_people.append(person)

    # Clean up redundant old person records
    for ep in existing_people:
        if ep not in created_or_updated_people:
            try:
                if ep.avatar and os.path.exists(ep.avatar.path):
                    os.remove(ep.avatar.path)
            except Exception:
                pass
            ep.delete()

    photo_cache.clear()
    logger.info("Clustered %d people for event %s with HD avatars", len(created_or_updated_people), event.id)
    return len(created_or_updated_people)
