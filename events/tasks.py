import logging

from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist

from events.models import Event
from events.services import process_pending_event_photos


logger = logging.getLogger(__name__)


@shared_task
def test_celery_task():

    logger.info(
        "Photona Celery task executed successfully."
    )

    return "success"


@shared_task(
    bind=True,
    autoretry_for=(ConnectionError, TimeoutError),
    retry_backoff=True,
    retry_backoff_max=60,
    max_retries=3,
)
def process_event_photos_task(
    self,
    event_id
):
    """
    Process pending photos for an event
    in the background.

    Parameters
    ----------
    event_id : int
        ID of the event whose pending photos
        should be processed.
    """

    try:

        event = Event.objects.get(
            id=event_id
        )

    except Event.DoesNotExist:

        logger.warning(
            "Event %s no longer exists. "
            "Skipping photo processing.",
            event_id
        )

        return {
            "success": False,
            "event_id": event_id,
            "status": "event_not_found",
        }


    logger.info(
        "Starting photo processing for event %s.",
        event_id
    )


    try:

        result = process_pending_event_photos(
            event
        )

        logger.info(
            "Photo processing completed for event %s.",
            event_id
        )

        return result


    except Exception:

        logger.exception(
            "Photo processing failed for event %s.",
            event_id
        )

        raise
# ==============================================================================
# PHASE 1: PARALLEL CELERY CHORD PIPELINE
# ==============================================================================
import os
import pickle
import numpy as np
import faiss
from celery import chord
from django.db import transaction
from config import (
    AI_BATCH_SIZE,
    FAISS_INDEX_FILE,
    FACE_RECORDS_FILE,
    IMAGE_RECORDS_FILE,
    get_event_database_dir,
    get_event_batches_dir,
)
from core.detector import get_worker_face_app, process_image
from core.faiss_index import (
    build_faiss_index,
    load_faiss_index,
    save_faiss_index,
)
from core.database import (
    load_face_records,
    load_image_records,
    save_face_records,
    save_image_records,
)
from events.models import EventPhoto


@shared_task
def cluster_event_people_task(event_id):
    """
    Background task to execute face clustering without blocking HTTP requests.
    """
    try:
        event = Event.objects.get(id=event_id)
        from .services.person_clustering import cluster_event_people
        count = cluster_event_people(event)
        logger.info("Background face clustering completed for event %s: %d people found", event_id, count)
        return {"event_id": event_id, "clustered_people": count}
    except Exception:
        logger.exception("Background face clustering failed for event %s", event_id)
        return {"event_id": event_id, "error": "clustering_failed"}


@shared_task(bind=True)
def orchestrate_event_processing(self, event_id, batch_size=None):
    """
    Orchestrator task:
    1. Identifies all pending photos for the event.
    2. Partitions them into micro-batches of size AI_BATCH_SIZE (default: 100).
    3. Launches a Celery Chord to distribute batches across all available workers.
    4. Triggers finalize_event_processing when all worker batches finish.
    """
    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        logger.warning("Event %s not found. Skipping orchestration.", event_id)
        return {"status": "event_not_found", "event_id": event_id}

    pending_photo_ids = list(
        EventPhoto.objects.filter(
            event=event,
            processing_status="pending"
        ).order_by("id").values_list("id", flat=True)
    )

    if not pending_photo_ids:
        logger.info("No pending photos for event %s.", event_id)
        if event.ai_status == "processing":
            event.ai_status = "ready" if event.photos.exists() else "pending"
            event.save(update_fields=["ai_status", "updated_at"])
        return {"status": "no_pending_photos", "event_id": event_id}

    batch_size = batch_size or AI_BATCH_SIZE or 100

    batches = [
        pending_photo_ids[i:i + batch_size]
        for i in range(0, len(pending_photo_ids), batch_size)
    ]

    event.ai_status = "processing"
    event.save(update_fields=["ai_status", "updated_at"])

    # Clean previous temporary batch outputs for this event
    batches_dir = get_event_batches_dir(event_id)
    for old_file in batches_dir.glob("batch_*.pkl"):
        try:
            old_file.unlink()
        except Exception:
            pass

    logger.info(
        "Orchestrating event %s: %d pending photos split into %d batches (batch_size=%d).",
        event_id, len(pending_photo_ids), len(batches), batch_size
    )

    batch_tasks = [
        process_photo_batch.s(batch, event_id, idx)
        for idx, batch in enumerate(batches)
    ]

    callback = finalize_event_processing.s(event_id)
    return chord(batch_tasks)(callback)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    retry_backoff=True,
    retry_backoff_max=60,
    autoretry_for=(Exception,),
)
def process_photo_batch(self, photo_ids, event_id, batch_idx):
    """
    Independent worker batch task:
    1. Reuses the loaded InsightFace model singleton in this worker process.
    2. Generates thumbnails and extracts face embeddings for assigned photos.
    3. Handles corrupted individual photos without crashing the whole batch.
    4. Writes isolated batch output to database/event_<id>/batches/batch_<idx>.pkl.
    5. Updates photo status to 'completed' or 'failed'.
    """
    logger.info("Worker processing batch %d for event %s (%d photos).", batch_idx, event_id, len(photo_ids))
    app = get_worker_face_app()

    photos_qs = EventPhoto.objects.filter(id__in=photo_ids)
    photos_map = {p.id: p for p in photos_qs}
    # Preserve strict ordered sequence matching photo_ids
    ordered_photos = [photos_map[pid] for pid in photo_ids if pid in photos_map]

    batch_image_records = []
    batch_face_records = []
    completed_ids = []
    failed_ids = []

    for photo in ordered_photos:
        try:
            # Mark photo as actively processing in DB
            photo.processing_status = "processing"
            photo.save(update_fields=["processing_status"])

            # Generate thumbnail if missing
            if not photo.thumbnail:
                try:
                    photo.generate_thumbnail()
                except Exception:
                    pass

            image_path = photo.image.path
            if not os.path.exists(image_path):
                raise FileNotFoundError(f"Image path not found: {image_path}")

            image_record, face_record_list = process_image(
                image_path=image_path,
                app=app,
                image_id=photo.id
            )

            if image_record is None:
                logger.warning("Photo %s is unreadable / corrupt. Marking as failed.", photo.id)
                photo.processing_status = "failed"
                photo.error_message = "Image file could not be read or is corrupted"
                photo.save(update_fields=["processing_status", "error_message"])
                failed_ids.append(photo.id)
                continue

            batch_image_records.append(image_record)
            batch_face_records.extend(face_record_list)
            completed_ids.append(photo.id)

            # Immediately update status to completed so it becomes visible to users
            photo.processing_status = "completed"
            photo.error_message = ""
            photo.save(update_fields=["processing_status", "error_message"])

        except Exception as exc:
            logger.warning("Photo %s failed in batch %d: %s", photo.id, batch_idx, exc)
            photo.processing_status = "failed"
            photo.error_message = str(exc)[:500]
            photo.save(update_fields=["processing_status", "error_message"])
            failed_ids.append(photo.id)

    # Write isolated batch output file atomically
    batches_dir = get_event_batches_dir(event_id)
    batch_file = batches_dir / f"batch_{batch_idx}.pkl"
    tmp_file = batches_dir / f"batch_{batch_idx}.tmp"

    batch_data = {
        "batch_idx": batch_idx,
        "event_id": event_id,
        "image_records": batch_image_records,
        "face_records": batch_face_records,
        "completed_ids": completed_ids,
        "failed_ids": failed_ids,
    }

    with open(tmp_file, "wb") as f:
        pickle.dump(batch_data, f)
    os.replace(str(tmp_file), str(batch_file))

    logger.info(
        "Batch %d for event %s finished: %d completed, %d failed, %d faces detected.",
        batch_idx, event_id, len(completed_ids), len(failed_ids), len(batch_face_records)
    )

    return {
        "batch_idx": batch_idx,
        "completed_count": len(completed_ids),
        "failed_count": len(failed_ids),
        "face_count": len(batch_face_records),
    }


@shared_task(bind=True)
def finalize_event_processing(self, batch_results, event_id):
    """
    Finalizer task:
    Executes as the SINGLE WRITER once all batch worker tasks complete.
    1. Gathers all batch_*.pkl files.
    2. Merges face and image records safely.
    3. Updates FAISS index atomically (writes to temp file -> rename).
    4. Triggers background face clustering.
    5. Marks event as ready.
    """
    logger.info("Starting finalization for event %s with %d batch results.", event_id, len(batch_results or []))
    try:
        event = Event.objects.get(id=event_id)
    except Event.DoesNotExist:
        logger.error("Event %s not found during finalization.", event_id)
        return {"status": "event_not_found"}

    batches_dir = get_event_batches_dir(event_id)
    batch_files = sorted(batches_dir.glob("batch_*.pkl"))

    new_image_records = []
    new_face_records = []

    for bf in batch_files:
        try:
            with open(bf, "rb") as f:
                bdata = pickle.load(f)
                new_image_records.extend(bdata.get("image_records", []))
                new_face_records.extend(bdata.get("face_records", []))
        except Exception as e:
            logger.warning("Could not read batch file %s: %s", bf, e)

    # Load existing database records
    try:
        index = load_faiss_index(event_id)
        existing_face_records = load_face_records(event_id)
        existing_image_records = load_image_records(event_id)
    except FileNotFoundError:
        index = None
        existing_face_records = []
        existing_image_records = []

    # Deduplicate against existing image_ids
    existing_img_ids = {r["image_id"] for r in existing_image_records}
    filtered_new_img_records = [r for r in new_image_records if r["image_id"] not in existing_img_ids]
    filtered_new_face_records = [r for r in new_face_records if r["image_id"] not in existing_img_ids]

    new_embeddings = [r["embedding"] for r in filtered_new_face_records]

    # Update or create FAISS index
    if index is None:
        if new_embeddings:
            index = build_faiss_index(filtered_new_face_records)
        else:
            index = None
    else:
        if new_embeddings:
            new_embeddings_arr = np.array(new_embeddings, dtype=np.float32)
            faiss.normalize_L2(new_embeddings_arr)
            index.add(new_embeddings_arr)

    updated_face_records = existing_face_records + filtered_new_face_records
    updated_image_records = existing_image_records + filtered_new_img_records

    # Atomic write for FAISS index (single-writer guaranteed)
    if index is not None:
        event_dir = get_event_database_dir(event_id)
        index_file = event_dir / FAISS_INDEX_FILE
        tmp_index_file = event_dir / f"{FAISS_INDEX_FILE}.tmp"
        faiss.write_index(index, str(tmp_index_file))
        os.replace(str(tmp_index_file), str(index_file))

    # Atomically save updated pickle databases
    save_face_records(updated_face_records, event_id)
    save_image_records(updated_image_records, event_id)

    # Clean up temporary batch files
    for bf in batch_files:
        try:
            bf.unlink()
        except Exception:
            pass

    # Update event AI status
    event.ai_status = "ready"
    event.save(update_fields=["ai_status", "updated_at"])

    # Trigger background person clustering
    try:
        from .services.person_clustering import cluster_event_people
        cluster_event_people(event)
    except Exception:
        logger.exception("Face clustering failed during finalization for event %s", event_id)

    logger.info(
        "Finalization complete for event %s: +%d images, +%d faces. Total faces: %d.",
        event_id, len(filtered_new_img_records), len(filtered_new_face_records), len(updated_face_records)
    )

    return {
        "status": "success",
        "event_id": event_id,
        "new_images": len(filtered_new_img_records),
        "new_faces": len(filtered_new_face_records),
        "total_faces": len(updated_face_records),
    }
