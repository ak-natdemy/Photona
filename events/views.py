from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.files.base import ContentFile
from django.http import JsonResponse, HttpResponse, FileResponse, HttpResponseForbidden, Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.http import require_POST
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Event, EventPhoto, EventShareLink, EventPerson
from .forms import (
    EventCreateForm,
    EventUpdateForm,
    EventPhotoUploadForm,
    SelfieSearchForm,
)

from .tasks import (
    process_event_photos_task,
    orchestrate_event_processing,
    cluster_event_people_task,
)
from config import USE_PARALLEL_ORCHESTRATOR
from services.search_service import search_event

import logging
import os
import hashlib
import io
import json
import shutil
import tempfile
import zipfile
import gdown
from django.utils.text import slugify

from django.conf import settings
from core.qr import generate_qr_code

logger = logging.getLogger(__name__)


def resolve_event_and_link(public_token):
    """
    Resolve both the Event and EventShareLink from a public token.
    Supports new EventShareLink tokens as well as legacy Event.public_token.
    """
    link = EventShareLink.objects.filter(
        token=public_token,
        is_active=True
    ).select_related("event", "event__tenant").first()

    if link:
        return link.event, link

    event = Event.objects.filter(
        public_token=public_token,
        is_active=True
    ).select_related("tenant").first()

    if event:
        link, _ = EventShareLink.objects.get_or_create(
            event=event,
            token=event.public_token,
            defaults={"is_all_photos_accessible": False}
        )
        return event, link

    return None, None


@login_required
def event_detail(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    # Descending order: ALL photos displayed immediately upon upload (latest first)
    photos = event.photos.all().order_by("-uploaded_at", "-id")

    share_links = event.share_links.filter(is_active=True).order_by("-created_at")
    if not share_links.exists():
        EventShareLink.objects.get_or_create(
            event=event,
            token=event.public_token,
            defaults={"is_all_photos_accessible": False}
        )
        share_links = event.share_links.filter(is_active=True).order_by("-created_at")

    share_links_data = []
    for sl in share_links:
        sl_url = f"{settings.SITE_URL}/e/{sl.token}/"
        try:
            sl_qr = generate_qr_code(sl_url)
        except Exception:
            sl_qr = ""

        share_links_data.append({
            "id": sl.id,
            "token": str(sl.token),
            "url": sl_url,
            "is_all_photos_accessible": sl.is_all_photos_accessible,
            "share_type_label": sl.share_type_label,
            "share_btn_text": "Share the event album" if sl.is_all_photos_accessible else "Share the AI face find link",
            "password": sl.password or "",
            "has_password": bool(sl.password),
            "expires_at": sl.expires_at.strftime("%Y-%m-%dT%H:%M") if sl.expires_at else "",
            "expires_at_formatted": sl.expires_at.strftime("%b %d, %Y, %I:%M %p") if sl.expires_at else "Never",
            "created_at_formatted": sl.created_at.strftime("%b %d, %Y, %I:%M %p"),
            "is_expired": sl.is_expired,
            "qr_code": sl_qr,
        })

    primary_link = share_links_data[0] if share_links_data else None
    public_event_url = primary_link["url"] if primary_link else f"{settings.SITE_URL}/e/{event.public_token}/"
    qr_code = primary_link["qr_code"] if primary_link else generate_qr_code(public_event_url)

    upload_form = EventPhotoUploadForm()
    edit_form = EventUpdateForm(instance=event)

    people = event.people.prefetch_related("photos").all()
    if not people.exists() and event.ai_status == "ready" and photos.exists():
        try:
            cluster_event_people_task.delay(event.id)
        except Exception as e:
            logger.warning("Initial face clustering dispatch failed on event_detail: %s", e)

    all_event_photos = photos
    total_photos_count = all_event_photos.count()
    processing_photos_count = all_event_photos.filter(processing_status="processing").count()
    pending_photos_count = all_event_photos.filter(processing_status="pending").count()
    completed_photos_count = all_event_photos.filter(processing_status__in=["completed", "ready"]).count()
    has_processing_photos = (processing_photos_count + pending_photos_count) > 0

    return render(
        request,
        "events/event_detail.html",
        {
            "event": event,
            "photos": photos,
            "people": people,
            "public_event_url": public_event_url,
            "qr_code": qr_code,
            "share_links": share_links_data,
            "primary_link": primary_link,
            "upload_form": upload_form,
            "edit_form": edit_form,
            "total_photos_count": total_photos_count,
            "processing_photos_count": processing_photos_count,
            "pending_photos_count": pending_photos_count,
            "completed_photos_count": completed_photos_count,
            "has_processing_photos": has_processing_photos,
        }
    )


@login_required
def list_event_links(request, event_id):
    """
    Return JSON list of all active share links for the specified event.
    """
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    share_links = event.share_links.filter(is_active=True).order_by("-created_at")
    links_data = []

    for sl in share_links:
        sl_url = f"{settings.SITE_URL}/e/{sl.token}/"
        try:
            sl_qr = generate_qr_code(sl_url)
        except Exception:
            sl_qr = ""

        links_data.append({
            "id": sl.id,
            "token": str(sl.token),
            "url": sl_url,
            "is_all_photos_accessible": sl.is_all_photos_accessible,
            "share_type_label": sl.share_type_label,
            "share_btn_text": "Share the event album" if sl.is_all_photos_accessible else "Share the AI face find link",
            "password": sl.password or "",
            "has_password": bool(sl.password),
            "expires_at": sl.expires_at.strftime("%Y-%m-%dT%H:%M") if sl.expires_at else "",
            "expires_at_formatted": sl.expires_at.strftime("%b %d, %Y, %I:%M %p") if sl.expires_at else "Never",
            "created_at_formatted": sl.created_at.strftime("%b %d, %Y, %I:%M %p"),
            "is_expired": sl.is_expired,
            "qr_code": sl_qr,
        })

    return JsonResponse({
        "success": True,
        "links": links_data
    })


@login_required
@require_POST
def create_event_link(request, event_id):
    """
    Generate a new share link for the event with optional password, expiry, and full-album access.
    """
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        data = request.POST

    is_all_photos = str(data.get("is_all_photos_accessible", "")).lower() in ("true", "1", "on")
    password = (data.get("password") or "").strip() or None

    expires_at_raw = (data.get("expires_at") or "").strip()
    expires_at = None
    if expires_at_raw:
        dt = parse_datetime(expires_at_raw)
        if dt:
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt)
            expires_at = dt

    link = EventShareLink.objects.create(
        event=event,
        is_all_photos_accessible=is_all_photos,
        password=password,
        expires_at=expires_at,
    )

    link_url = f"{settings.SITE_URL}/e/{link.token}/"
    try:
        link_qr = generate_qr_code(link_url)
    except Exception:
        link_qr = ""

    return JsonResponse({
        "success": True,
        "link": {
            "id": link.id,
            "token": str(link.token),
            "url": link_url,
            "is_all_photos_accessible": link.is_all_photos_accessible,
            "share_type_label": link.share_type_label,
            "share_btn_text": "Share the event album" if link.is_all_photos_accessible else "Share the AI face find link",
            "password": link.password or "",
            "has_password": bool(link.password),
            "expires_at": link.expires_at.strftime("%Y-%m-%dT%H:%M") if link.expires_at else "",
            "expires_at_formatted": link.expires_at.strftime("%b %d, %Y, %I:%M %p") if link.expires_at else "Never",
            "created_at_formatted": link.created_at.strftime("%b %d, %Y, %I:%M %p"),
            "is_expired": link.is_expired,
            "qr_code": link_qr,
        }
    })


@login_required
@require_POST
def update_event_link(request, event_id, link_id):
    """
    Update settings (password, expiry, full album toggle) for an existing share link.
    """
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )
    link = get_object_or_404(
        EventShareLink,
        id=link_id,
        event=event
    )

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else request.POST
    except Exception:
        data = request.POST

    if "is_all_photos_accessible" in data:
        link.is_all_photos_accessible = str(data.get("is_all_photos_accessible", "")).lower() in ("true", "1", "on")

    if "password" in data:
        pw = (data.get("password") or "").strip()
        link.password = pw if pw else None

    if "expires_at" in data:
        exp_raw = (data.get("expires_at") or "").strip()
        if exp_raw:
            dt = parse_datetime(exp_raw)
            if dt and timezone.is_naive(dt):
                dt = timezone.make_aware(dt)
            link.expires_at = dt
        else:
            link.expires_at = None

    link.save()

    link_url = f"{settings.SITE_URL}/e/{link.token}/"
    try:
        link_qr = generate_qr_code(link_url)
    except Exception:
        link_qr = ""

    return JsonResponse({
        "success": True,
        "link": {
            "id": link.id,
            "token": str(link.token),
            "url": link_url,
            "is_all_photos_accessible": link.is_all_photos_accessible,
            "share_type_label": link.share_type_label,
            "share_btn_text": "Share the event album" if link.is_all_photos_accessible else "Share the AI face find link",
            "password": link.password or "",
            "has_password": bool(link.password),
            "expires_at": link.expires_at.strftime("%Y-%m-%dT%H:%M") if link.expires_at else "",
            "expires_at_formatted": link.expires_at.strftime("%b %d, %Y, %I:%M %p") if link.expires_at else "Never",
            "created_at_formatted": link.created_at.strftime("%b %d, %Y, %I:%M %p"),
            "is_expired": link.is_expired,
            "qr_code": link_qr,
        }
    })


@login_required
@require_POST
def delete_event_link(request, event_id, link_id):
    """
    Delete a share link for an event.
    """
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )
    link = get_object_or_404(
        EventShareLink,
        id=link_id,
        event=event
    )

    link.delete()
    return JsonResponse({"success": True})


@login_required
def create_event(request):
    user = request.user
    tenant = user.tenant

    if request.method == "POST":
        form = EventCreateForm(request.POST, request.FILES)

        if form.is_valid():
            event = form.save(commit=False)
            event.tenant = tenant
            event.save()

            # Ensure default share link exists
            EventShareLink.objects.get_or_create(
                event=event,
                token=event.public_token,
                defaults={"is_all_photos_accessible": False}
            )

            # Process photos if uploaded during event creation
            files = form.cleaned_data.get("photos") or request.FILES.getlist("photos") or request.FILES.getlist("images")
            if files:
                created_photos = []
                with transaction.atomic():
                    for file in files:
                        photo = EventPhoto(
                            event=event,
                            image=file,
                            processing_status="pending"
                        )
                        photo.save()
                        created_photos.append(photo)

                    event.ai_status = "processing"
                    event.save(update_fields=["ai_status"])

                if USE_PARALLEL_ORCHESTRATOR:
                    orchestrate_event_processing.delay(event.id)
                else:
                    process_event_photos_task.delay(event.id)
                messages.success(request, f"Event created with {len(created_photos)} photo(s). Facial recognition is processing in the background.")

            return redirect(
                "events:detail",
                event_id=event.id
            )

    else:
        form = EventCreateForm()

    return render(
        request,
        "events/create_event.html",
        {
            "form": form
        }
    )


@login_required
@require_POST
def edit_event(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    form = EventUpdateForm(
        request.POST,
        request.FILES,
        instance=event
    )

    if form.is_valid():
        form.save()

    return redirect(
        "events:detail",
        event_id=event.id
    )


@login_required
@require_POST
def delete_event(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    event.delete()

    return redirect("dashboard")


def enforce_photo_size_ceiling(uploaded_file, target_mb: float):
    """
    Ensures an uploaded image does not exceed target_mb.
    If the image is already <= target_mb, it is left completely untouched.
    If greater, it is compressed to fit right within the ceiling while maximizing quality.
    """
    if not target_mb or target_mb <= 0:
        return uploaded_file

    target_bytes = int(target_mb * 1024 * 1024)
    if uploaded_file.size <= target_bytes:
        return uploaded_file

    try:
        from PIL import Image
        import io
        from django.core.files.uploadedfile import InMemoryUploadedFile

        uploaded_file.seek(0)
        img = Image.open(uploaded_file)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        # Binary search quality between 50 and 98 to get AS CLOSE TO target_bytes as possible
        low_q = 50
        high_q = 98
        best_io = None

        for _ in range(7):
            mid_q = (low_q + high_q) // 2
            out_io = io.BytesIO()
            img.save(out_io, format="JPEG", quality=mid_q)
            if out_io.tell() <= target_bytes:
                best_io = out_io
                low_q = mid_q + 1 # Try higher quality to fill up to target_bytes
            else:
                high_q = mid_q - 1

        # If even at lowest quality it exceeds target, gently downscale
        curr_img = img
        while (not best_io or best_io.tell() > target_bytes) and (curr_img.width > 1200 or curr_img.height > 1200):
            new_w = int(curr_img.width * 0.88)
            new_h = int(curr_img.height * 0.88)
            curr_img = curr_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            
            s_low = 60
            s_high = 96
            for _ in range(5):
                mid_q = (s_low + s_high) // 2
                out_io = io.BytesIO()
                curr_img.save(out_io, format="JPEG", quality=mid_q)
                if out_io.tell() <= target_bytes:
                    best_io = out_io
                    s_low = mid_q + 1
                else:
                    s_high = mid_q - 1
            if best_io and best_io.tell() <= target_bytes:
                break

        if not best_io:
            uploaded_file.seek(0)
            return uploaded_file

        out_io = best_io
        out_io.seek(0)
        compressed = InMemoryUploadedFile(
            file=out_io,
            field_name=getattr(uploaded_file, "field_name", "images"),
            name=uploaded_file.name,
            content_type="image/jpeg",
            size=out_io.getbuffer().nbytes,
            charset=None,
        )
        return compressed
    except Exception as exc:
        logger.warning("Backend photo compression fallback skipped for %s: %s", getattr(uploaded_file, "name", "file"), exc)
        uploaded_file.seek(0)
        return uploaded_file


@login_required
def upload_photos(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    if request.method == "POST":
        form = EventPhotoUploadForm(
            request.POST,
            request.FILES
        )

        files = []
        if form.is_valid():
            files = form.cleaned_data.get("cleaned_photos") or []
        else:
            files = request.FILES.getlist("images") or request.FILES.getlist("photos")

        is_ajax = (
            request.headers.get("x-requested-with") == "XMLHttpRequest"
            or request.GET.get("ajax") == "1"
            or "application/json" in request.headers.get("accept", "")
        )

        compress_target_mb = None
        target_mb_val = request.POST.get("compress_target_mb")
        if target_mb_val:
            try:
                compress_target_mb = float(target_mb_val)
            except (ValueError, TypeError):
                compress_target_mb = None

        if compress_target_mb and compress_target_mb > 0:
            files = [enforce_photo_size_ceiling(f, compress_target_mb) for f in files]

        if not files:
            if is_ajax:
                return JsonResponse({
                    "success": False,
                    "message": "Please select at least one photo to upload."
                }, status=400)
            messages.error(request, "Please select at least one photo to upload.")
            return redirect(
                "events:detail",
                event_id=event.id
            )

        # Ingest all uploaded files without artificial truncation
        capped_notice = False

        # Existing photos deduplication lookups for this event
        existing_records = list(
            event.photos.values("id", "file_hash", "original_filename", "file_size")
        )
        existing_hashes = {p["file_hash"] for p in existing_records if p["file_hash"]}
        existing_name_sizes = {
            (p["original_filename"].lower(), p["file_size"])
            for p in existing_records
            if p["original_filename"] and p["file_size"] > 0
        }

        files_to_save = []
        batch_hashes = set()
        batch_name_sizes = set()
        skipped_duplicates = 0

        for f in files:
            orig_name = getattr(f, "name", "")
            clean_name = os.path.basename(orig_name).lower()
            file_size = getattr(f, "size", 0)

            # Compute fast MD5 content hash
            hasher = hashlib.md5()
            for chunk in f.chunks():
                hasher.update(chunk)
            f.seek(0)
            f_hash = hasher.hexdigest()

            # Check if duplicate in event DB or within this batch
            if (
                (f_hash and (f_hash in existing_hashes or f_hash in batch_hashes))
                or ((clean_name, file_size) in existing_name_sizes)
                or ((clean_name, file_size) in batch_name_sizes)
            ):
                skipped_duplicates += 1
                continue

            if f_hash:
                batch_hashes.add(f_hash)
            if clean_name and file_size:
                batch_name_sizes.add((clean_name, file_size))

            files_to_save.append((f, orig_name, file_size, f_hash))

        if not files_to_save:
            dup_msg = (
                f"All {skipped_duplicates} photo(s) selected have already been uploaded to this event. "
                "No duplicate photos were added."
            )
            if is_ajax:
                return JsonResponse({
                    "success": False,
                    "all_duplicates": True,
                    "message": dup_msg,
                    "count": 0,
                    "skipped_duplicates": skipped_duplicates,
                    "redirect_url": reverse("events:detail", kwargs={"event_id": event.id})
                })
            messages.warning(request, dup_msg)
            return redirect("events:detail", event_id=event.id)

        created_photos = []
        with transaction.atomic():
            for f, orig_name, file_size, f_hash in files_to_save:
                photo = EventPhoto(
                    event=event,
                    image=f,
                    original_filename=orig_name,
                    file_size=file_size,
                    file_hash=f_hash,
                    processing_status="pending"
                )
                photo.save(generate_thumb=False)
                created_photos.append(photo)

            event.ai_status = "processing"
            event.save(update_fields=["ai_status"])

        if USE_PARALLEL_ORCHESTRATOR:
            orchestrate_event_processing.delay(event.id)
        else:
            process_event_photos_task.delay(event.id)

        if skipped_duplicates > 0:
            msg = (
                f"Successfully uploaded {len(created_photos)} photo(s) "
                f"({skipped_duplicates} duplicate photo(s) were detected and skipped)."
            )
        else:
            msg = f"Successfully uploaded {len(created_photos)} photo(s). Facial recognition is processing in the background."

        if capped_notice:
            msg += f" (Note: Upload was capped at the maximum batch limit of {MAX_BATCH_SIZE} photos)."

        if is_ajax:
            return JsonResponse({
                "success": True,
                "message": msg,
                "count": len(created_photos),
                "skipped_duplicates": skipped_duplicates,
                "redirect_url": reverse("events:detail", kwargs={"event_id": event.id})
            })

        messages.success(request, msg)
        return redirect("events:detail", event_id=event.id)

    else:
        form = EventPhotoUploadForm()

    return render(
        request,
        "events/upload_photos.html",
        {
            "event": event,
            "form": form,
            "use_chunked_upload": USE_CHUNKED_UPLOAD,
            "upload_chunk_size": UPLOAD_CHUNK_SIZE,
            "upload_concurrency": UPLOAD_CONCURRENCY,
            "max_upload_retries": MAX_UPLOAD_RETRIES,
        }
    )


@login_required
@require_POST
def delete_photo(request, event_id, photo_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    photo = get_object_or_404(
        EventPhoto,
        id=photo_id,
        event=event
    )

    try:
        if photo.image and os.path.exists(photo.image.path):
            os.remove(photo.image.path)
    except Exception:
        pass

    try:
        if photo.thumbnail and os.path.exists(photo.thumbnail.path):
            os.remove(photo.thumbnail.path)
    except Exception:
        pass

    photo.delete()

    if not event.photos.exists():
        event.ai_status = "ready"
        event.save(update_fields=["ai_status", "updated_at"])
        event.people.all().delete()
    else:
        try:
            cluster_event_people_task.delay(event.id)
        except Exception:
            pass

    messages.success(request, "Photo deleted successfully.")
    return redirect(
        "events:detail",
        event_id=event.id
    )


@login_required
@require_POST
@login_required
@require_POST
def bulk_delete_photos(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    # Bulletproof parsing of all possible ID formats (list, comma-delimited strings, or all=true)
    raw_inputs = request.POST.getlist("photo_ids") + request.POST.getlist("ids")
    if request.POST.get("photo_ids"):
        raw_inputs.append(request.POST.get("photo_ids"))
    if request.POST.get("ids"):
        raw_inputs.append(request.POST.get("ids"))

    clean_ids = set()
    for item in raw_inputs:
        if isinstance(item, str):
            for part in item.split(","):
                part = part.strip()
                if part.isdigit():
                    clean_ids.add(int(part))
        elif isinstance(item, int):
            clean_ids.add(item)

    if not clean_ids and request.POST.get("all") in ("true", "1", "all"):
        clean_ids = set(event.photos.values_list("id", flat=True))

    if not clean_ids:
        messages.warning(request, "No photos were selected for deletion.")
        return redirect("events:detail", event_id=event.id)

    photos = EventPhoto.objects.filter(event=event, id__in=clean_ids)
    count = 0
    for photo in photos:
        try:
            if photo.image and os.path.exists(photo.image.path):
                os.remove(photo.image.path)
        except Exception:
            pass
        try:
            if photo.thumbnail and os.path.exists(photo.thumbnail.path):
                os.remove(photo.thumbnail.path)
        except Exception:
            pass
        photo.delete()
        count += 1

    if not event.photos.exists():
        event.ai_status = "ready"
        event.save(update_fields=["ai_status", "updated_at"])
        event.people.all().delete()
    else:
        try:
            cluster_event_people_task.delay(event.id)
        except Exception:
            pass

    messages.success(request, f"Successfully deleted {count} photo{'s' if count != 1 else ''}.")
    return redirect("events:detail", event_id=event.id)


@login_required
def manager_download_photos_zip(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    photo_ids = request.POST.getlist("photo_ids")
    if not photo_ids and request.GET.getlist("ids"):
        photo_ids = request.GET.getlist("ids")
    elif not photo_ids and request.GET.get("ids"):
        photo_ids = [i.strip() for i in request.GET.get("ids", "").split(",") if i.strip()]

    if photo_ids:
        photos = event.photos.filter(id__in=photo_ids)
    else:
        photos = event.photos.all()

    if not photos.exists():
        return HttpResponse("No photos available for download.", status=404)

    safe_event_name = slugify(event.name) or "event"
    zip_filename = f"{safe_event_name}_photos.zip"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, photo in enumerate(photos, 1):
            if photo.image and os.path.exists(photo.image.path):
                ext = os.path.splitext(photo.image.name)[1] or ".jpg"
                arcname = f"{safe_event_name}_{idx:03d}_{photo.id}{ext}"
                zf.write(photo.image.path, arcname=arcname)

    buffer.seek(0)
    response = HttpResponse(buffer.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{zip_filename}"'
    return response


@login_required
@require_POST
def import_drive_photos(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    drive_url = request.POST.get("drive_url", "").strip()

    if not drive_url:
        return JsonResponse({"success": False, "error": "Google Drive folder URL is required."}, status=400)

    temp_dir = tempfile.mkdtemp(prefix="photona_drive_")

    try:
        try:
            downloaded = gdown.download_folder(url=drive_url, output=temp_dir, quiet=True, use_cookies=False)
        except Exception as down_err:
            logger.warning("Standard gdown download failed, attempting with fuzzy extraction: %s", down_err)
            downloaded = gdown.download_folder(url=drive_url, output=temp_dir, quiet=True)

        valid_extensions = {".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG", ".WEBP"}
        imported_files = []

        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                ext = os.path.splitext(file)[1]
                if ext in valid_extensions:
                    imported_files.append(os.path.join(root, file))

        if not imported_files:
            return JsonResponse({
                "success": False,
                "error": "No valid image files (JPG, PNG, WebP) were found in the provided Drive link. Ensure the link has sharing set to 'Anyone with the link can view'."
            }, status=400)

        created_photos = []
        with transaction.atomic():
            for file_path in imported_files:
                file_name = os.path.basename(file_path)
                with open(file_path, "rb") as f:
                    content = f.read()

                photo = EventPhoto(
                    event=event,
                    processing_status="pending"
                )
                photo.image.save(file_name, ContentFile(content), save=False)
                photo.save()
                created_photos.append(photo)

            event.ai_status = "processing"
            event.save(update_fields=["ai_status"])

        if USE_PARALLEL_ORCHESTRATOR:
            orchestrate_event_processing.delay(event.id)
        else:
            process_event_photos_task.delay(event.id)

        return JsonResponse({
            "success": True,
            "count": len(created_photos),
            "message": f"Successfully imported {len(created_photos)} photos. AI processing has started in the background."
        })

    except Exception as e:
        logger.exception("Google Drive import error for event %s", event.id)
        return JsonResponse({
            "success": False,
            "error": f"Failed to import from Google Drive: {str(e)}"
        }, status=500)

    finally:
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass


@login_required
def event_ai_status(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    all_photos = event.photos.all().order_by("-uploaded_at", "-id")

    photo_statuses = []
    ready_photos_data = []
    all_photos_data = []
    completed_count = 0
    processing_count = 0
    pending_count = 0
    failed_count = 0

    for photo in all_photos:
        st = (photo.processing_status or "pending").lower()
        thumb = photo.thumbnail_url or (photo.image.url if photo.image else "")
        img_url = photo.image.url if photo.image else ""
        fname = os.path.basename(photo.image.name) if photo.image else ""
        upl_at = photo.uploaded_at.strftime("%b %d, %Y · %I:%M %p") if photo.uploaded_at else ""

        p_info = {
            "id": photo.id,
            "thumbnail_url": thumb,
            "image_url": img_url,
            "filename": fname,
            "uploaded_at": upl_at,
            "processing_status": st,
        }
        all_photos_data.append(p_info)

        if st in ("completed", "ready"):
            completed_count += 1
            ready_photos_data.append(p_info)
        elif st == "processing":
            processing_count += 1
        elif st == "failed":
            failed_count += 1
        else:
            pending_count += 1

        photo_statuses.append({
            "id": photo.id,
            "processing_status": st,
        })

    total_count = len(photo_statuses)
    progress_percent = round((completed_count + failed_count) / total_count * 100, 1) if total_count > 0 else 100.0

    people_data = []
    for pe in event.people.all():
        people_data.append({
            "id": pe.id,
            "name": pe.name,
            "avatar_url": pe.avatar_url,
            "photo_count": pe.photo_count,
            "face_count": pe.face_count,
        })

    return JsonResponse({
        "ai_status": event.ai_status,
        "photos": photo_statuses,
        "ready_photos": ready_photos_data,
        "all_photos": all_photos_data,
        "people": people_data,
        "total_count": total_count,
        "completed_count": completed_count,
        "processing_count": processing_count,
        "pending_count": pending_count,
        "failed_count": failed_count,
        "percent": progress_percent,
        "has_processing_photos": (processing_count + pending_count) > 0,
        "people_count": len(people_data),
    })


def public_event(request, public_token):
    event, link = resolve_event_and_link(public_token)

    if not event or not event.is_active:
        raise Http404("Event not found or inactive")

    # Check if this specific link has expired
    if link and link.is_expired:
        return render(
            request,
            "events/public_event_expired.html",
            {
                "event": event,
                "link": link,
            }
        )

    # Check password protection for this link
    if link and link.password:
        session_key = f"link_auth_{link.id}"
        if not request.session.get(session_key):
            if request.method == "POST" and "access_password" in request.POST:
                entered = request.POST.get("access_password", "").strip()
                if entered == link.password:
                    request.session[session_key] = True
                    return redirect(request.path)
                else:
                    return render(
                        request,
                        "events/public_event_password.html",
                        {
                            "event": event,
                            "link": link,
                            "error_message": "Incorrect password. Please try again."
                        }
                    )
            return render(
                request,
                "events/public_event_password.html",
                {
                    "event": event,
                    "link": link,
                }
            )

    # Check if AI processing is ready (only required for selfie search)
    is_all_photos_accessible = link.is_all_photos_accessible if link else False

    if event.ai_status != "ready" and not is_all_photos_accessible:
        return render(
            request,
            "events/public_event_unavailable.html",
            {
                "event": event,
            }
        )

    form = SelfieSearchForm()
    matching_photos = []

    # If full album access is enabled and this is a GET request, display all event photos directly
    if is_all_photos_accessible and request.method == "GET":
        all_photos = event.photos.filter(processing_status__in=["completed", "ready"]).order_by("id")
        return render(
            request,
            "events/public_event.html",
            {
                "event": event,
                "link": link,
                "public_token": public_token,
                "form": form,
                "is_all_photos_mode": True,
                "all_photos": all_photos,
                "matching_photos": [],
            }
        )

    # Handle selfie search submission
    if request.method == "POST":
        form = SelfieSearchForm(
            request.POST,
            request.FILES
        )

        if form.is_valid():
            selfie = form.cleaned_data["selfie"]
            temporary_path = None

            try:
                suffix = os.path.splitext(selfie.name)[1].lower()
                file_descriptor, temporary_path = tempfile.mkstemp(suffix=suffix)

                with os.fdopen(file_descriptor, "wb") as temporary_file:
                    for chunk in selfie.chunks():
                        temporary_file.write(chunk)

                result = search_event(
                    event_id=event.id,
                    query_image_path=temporary_path,
                )

                if not result["success"]:
                    status = result["status"]
                    if status == "no_face":
                        form.add_error(
                            "selfie",
                            "No face was detected. Please upload a clear selfie."
                        )
                    elif status == "multiple_faces":
                        form.add_error(
                            "selfie",
                            "Multiple faces were detected. Please upload a selfie containing only your face."
                        )
                    elif status == "invalid_image":
                        form.add_error(
                            "selfie",
                            "The uploaded image could not be processed."
                        )
                    else:
                        form.add_error(
                            None,
                            "We could not process your selfie. Please try another image."
                        )
                else:
                    image_ids = [
                        match["image_record"]["image_id"]
                        for match in result["matching_images"]
                    ]

                    photos = EventPhoto.objects.filter(
                        event=event,
                        id__in=image_ids
                    )

                    photo_lookup = {photo.id: photo for photo in photos}

                    for match in result["matching_images"]:
                        image_id = match["image_record"]["image_id"]
                        photo = photo_lookup.get(image_id)
                        if photo is None:
                            continue
                        matching_photos.append({
                            "photo": photo,
                            "score": match["score"],
                        })

            except Exception:
                logger.exception("Public face search failed for event %s", event.id)
                form.add_error(
                    None,
                    "Something went wrong while searching your photos. Please try again."
                )

            finally:
                if temporary_path is not None:
                    try:
                        os.remove(temporary_path)
                    except OSError:
                        logger.warning("Could not delete temporary selfie: %s", temporary_path)

    return render(
        request,
        "events/public_event.html",
        {
            "event": event,
            "link": link,
            "public_token": public_token,
            "form": form,
            "matching_photos": matching_photos,
            "is_all_photos_mode": False,
        }
    )


def download_single_photo(request, public_token, photo_id):
    event, link = resolve_event_and_link(public_token)
    if not event or not event.is_active:
        raise Http404("Event not found or inactive")

    if link and link.is_expired:
        return HttpResponseForbidden("This event share link has expired.")

    if link and link.password and not request.session.get(f"link_auth_{link.id}"):
        return HttpResponseForbidden("Access requires authentication.")

    photo = get_object_or_404(
        EventPhoto,
        event=event,
        id=photo_id
    )

    if not photo.image or not os.path.exists(photo.image.path):
        return HttpResponse("Photo file not found.", status=404)

    ext = os.path.splitext(photo.image.name)[1] or ".jpg"
    safe_event_name = slugify(event.name) or "event"
    filename = f"{safe_event_name}_photo_{photo.id}{ext}"

    return FileResponse(
        open(photo.image.path, "rb"),
        as_attachment=True,
        filename=filename
    )


def download_photos_zip(request, public_token):
    event, link = resolve_event_and_link(public_token)
    if not event or not event.is_active:
        raise Http404("Event not found or inactive")

    if link and link.is_expired:
        return HttpResponseForbidden("This event share link has expired.")

    if link and link.password and not request.session.get(f"link_auth_{link.id}"):
        return HttpResponseForbidden("Access requires authentication.")

    ids_param = request.POST.getlist("photo_ids")
    if not ids_param and request.GET.getlist("ids"):
        ids_param = request.GET.getlist("ids")
    elif not ids_param and request.GET.get("ids"):
        ids_param = [i.strip() for i in request.GET.get("ids", "").split(",") if i.strip()]

    if not ids_param:
        return HttpResponse("No photos selected for download.", status=400)

    photos = event.photos.filter(id__in=ids_param)
    if not photos.exists():
        return HttpResponse("No matching photos found.", status=404)

    safe_event_name = slugify(event.name) or "event"
    zip_filename = f"Photona_{safe_event_name}_photos.zip"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, photo in enumerate(photos, 1):
            if photo.image and os.path.exists(photo.image.path):
                ext = os.path.splitext(photo.image.name)[1] or ".jpg"
                arcname = f"{safe_event_name}_{idx:02d}_{photo.id}{ext}"
                zf.write(photo.image.path, arcname=arcname)

    buffer.seek(0)
    response = HttpResponse(buffer.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{zip_filename}"'
    return response


# ============================================================
# SORTED PEOPLE (PERSON CLUSTERING) MANAGEMENT APIS
# ============================================================

@login_required
def rename_event_person(request, event_id, person_id):
    """
    Rename an identified person cluster (e.g. from 'Person 1' to 'Groom' or 'Abdul').
    """
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "POST required"}, status=405)

    event = get_object_or_404(Event, id=event_id, tenant=request.user.tenant)
    person = get_object_or_404(EventPerson, id=person_id, event=event)

    data = {}
    if request.content_type == "application/json":
        try:
            data = json.loads(request.body)
        except Exception:
            data = {}
    else:
        data = request.POST

    new_name = data.get("name", "").strip()
    if not new_name:
        return JsonResponse({"success": False, "error": "Name cannot be empty"}, status=400)

    person.name = new_name[:100]
    person.save(update_fields=["name", "updated_at"])
    return JsonResponse({
        "success": True,
        "person_id": person.id,
        "name": person.name
    })


@login_required
def download_person_photos_zip(request, event_id, person_id):
    """
    Download all photos containing a specific person as an uncompressed ZIP.
    """
    event = get_object_or_404(Event, id=event_id, tenant=request.user.tenant)
    person = get_object_or_404(EventPerson, id=person_id, event=event)

    photos = person.photos.all()
    if not photos.exists():
        return HttpResponse("No photos found for this person.", status=404)

    safe_event_name = slugify(event.name) or "event"
    safe_person_name = slugify(person.name) or f"person_{person.id}"
    zip_filename = f"Photona_{safe_event_name}_{safe_person_name}_photos.zip"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, photo in enumerate(photos, 1):
            if photo.image and os.path.exists(photo.image.path):
                ext = os.path.splitext(photo.image.name)[1] or ".jpg"
                arcname = f"{safe_person_name}_{idx:02d}_{photo.id}{ext}"
                zf.write(photo.image.path, arcname=arcname)

    buffer.seek(0)
    response = HttpResponse(buffer.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{zip_filename}"'
    return response


@login_required
def get_person_photos_json(request, event_id, person_id):
    """
    Return JSON list of photos containing this specific person for dynamic gallery view.
    """
    event = get_object_or_404(Event, id=event_id, tenant=request.user.tenant)
    person = get_object_or_404(EventPerson, id=person_id, event=event)

    photos_data = []
    for p in person.photos.all().order_by("-uploaded_at", "-id"):
        photos_data.append({
            "id": p.id,
            "thumbnail_url": p.thumbnail_url or (p.image.url if p.image else ""),
            "image_url": p.image.url if p.image else "",
            "filename": os.path.basename(p.image.name) if p.image else "",
            "uploaded_at": p.uploaded_at.strftime("%b %d, %Y") if p.uploaded_at else "",
        })

    return JsonResponse({
        "success": True,
        "person": {
            "id": person.id,
            "name": person.name,
            "avatar_url": person.avatar_url,
            "photo_count": person.photo_count,
            "face_count": person.face_count,
        },
        "photos": photos_data
    })


@login_required
def recluster_event_people_api(request, event_id):
    """
    Manually trigger re-clustering of event faces into people groups.
    """
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "POST required"}, status=405)

    event = get_object_or_404(Event, id=event_id, tenant=request.user.tenant)
    try:
        from .services.person_clustering import cluster_event_people
        count = cluster_event_people(event)
        return JsonResponse({
            "success": True,
            "people_count": count
        })
    except Exception as e:
        logger.exception("Manual re-clustering failed for event %s", event.id)
        return JsonResponse({"success": False, "error": str(e)}, status=500)



# ==============================================================================
# PHASE 2: CHUNKED UPLOAD, IDEMPOTENCY & PROGRESS API
# ==============================================================================
import uuid
from config import (
    USE_CHUNKED_UPLOAD,
    UPLOAD_CHUNK_SIZE,
    UPLOAD_CONCURRENCY,
    MAX_UPLOAD_RETRIES,
)
from .models import PhotoUploadSession, PhotoUploadChunk


@login_required
@require_POST
def upload_photo_chunk(request, event_id):
    """
    Accepts and saves a single chunk (e.g. 50 photos) of a larger upload session.
    Guarantees chunk-level idempotency to prevent duplicates on retries.
    """
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    upload_id_str = request.POST.get("upload_id")
    if not upload_id_str:
        return JsonResponse({"success": False, "error": "Missing upload_id"}, status=400)

    try:
        upload_id = uuid.UUID(upload_id_str)
    except ValueError:
        return JsonResponse({"success": False, "error": "Invalid upload_id UUID"}, status=400)

    try:
        chunk_index = int(request.POST.get("chunk_index", 0))
        total_chunks = int(request.POST.get("total_chunks", 1))
        total_files = int(request.POST.get("total_files", 0))
    except (ValueError, TypeError):
        return JsonResponse({"success": False, "error": "Invalid chunk parameters"}, status=400)

    # Retrieve or initialize the upload session
    session, _ = PhotoUploadSession.objects.get_or_create(
        upload_id=upload_id,
        defaults={
            "event": event,
            "total_files": total_files,
            "total_chunks": total_chunks,
            "status": "in_progress",
        }
    )

    # -------------------------------------------------------------
    # IDEMPOTENCY CHECK
    # -------------------------------------------------------------
    existing_chunk = PhotoUploadChunk.objects.filter(
        session=session,
        chunk_index=chunk_index
    ).first()

    if existing_chunk:
        logger.info(
            "Chunk %d of upload %s already processed. Returning cached success.",
            chunk_index, upload_id
        )
        return JsonResponse({
            "success": True,
            "already_processed": True,
            "upload_id": str(upload_id),
            "chunk_index": chunk_index,
            "saved_count": existing_chunk.file_count,
            "skipped_duplicates": 0,
            "completed_chunks": session.completed_chunks,
            "total_chunks": session.total_chunks,
        })

    # Process files in this chunk
    files = request.FILES.getlist("images") or request.FILES.getlist("photos")
    if not files:
        return JsonResponse({"success": False, "error": "No files received in this chunk"}, status=400)

    compress_target_mb = None
    target_mb_val = request.POST.get("compress_target_mb")
    if target_mb_val:
        try:
            compress_target_mb = float(target_mb_val)
        except (ValueError, TypeError):
            compress_target_mb = None

    if compress_target_mb and compress_target_mb > 0:
        files = [enforce_photo_size_ceiling(f, compress_target_mb) for f in files]

    # Deduplication check against event database
    existing_records = list(
        event.photos.values("file_hash", "original_filename", "file_size")
    )
    existing_hashes = {p["file_hash"] for p in existing_records if p["file_hash"]}
    existing_name_sizes = {
        (p["original_filename"].lower(), p["file_size"])
        for p in existing_records
        if p["original_filename"] and p["file_size"] > 0
    }

    files_to_save = []
    skipped_duplicates = 0
    batch_hashes = set()
    batch_name_sizes = set()

    for f in files:
        orig_name = getattr(f, "name", "")
        clean_name = os.path.basename(orig_name).lower()
        file_size = getattr(f, "size", 0)

        # Content hash
        hasher = hashlib.md5()
        for chunk_bytes in f.chunks():
            hasher.update(chunk_bytes)
        f.seek(0)
        f_hash = hasher.hexdigest()

        if (
            (f_hash and (f_hash in existing_hashes or f_hash in batch_hashes))
            or ((clean_name, file_size) in existing_name_sizes)
            or ((clean_name, file_size) in batch_name_sizes)
        ):
            skipped_duplicates += 1
            continue

        if f_hash:
            batch_hashes.add(f_hash)
        if clean_name and file_size:
            batch_name_sizes.add((clean_name, file_size))

        files_to_save.append((f, orig_name, file_size, f_hash))

    created_photos = []
    with transaction.atomic():
        for f, orig_name, file_size, f_hash in files_to_save:
            photo = EventPhoto(
                event=event,
                image=f,
                original_filename=orig_name,
                file_size=file_size,
                file_hash=f_hash,
                processing_status="pending"
            )
            photo.save(generate_thumb=False)
            created_photos.append(photo)

        # Record chunk completion atomically
        PhotoUploadChunk.objects.create(
            session=session,
            chunk_index=chunk_index,
            file_count=len(created_photos),
            status="completed"
        )

        completed_count = session.chunks.count()
        session.completed_chunks = completed_count
        session.save(update_fields=["completed_chunks", "updated_at"])

    return JsonResponse({
        "success": True,
        "already_processed": False,
        "upload_id": str(upload_id),
        "chunk_index": chunk_index,
        "saved_count": len(created_photos),
        "skipped_duplicates": skipped_duplicates,
        "completed_chunks": session.completed_chunks,
        "total_chunks": session.total_chunks,
    })


@login_required
def upload_session_status(request, event_id, upload_id):
    """
    Returns which chunks of an upload session have already completed.
    Enables instant client-side resume support if an upload was interrupted.
    """
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    session = get_object_or_404(
        PhotoUploadSession,
        upload_id=upload_id,
        event=event
    )

    completed_chunk_indices = list(
        session.chunks.values_list("chunk_index", flat=True)
    )

    return JsonResponse({
        "success": True,
        "upload_id": str(session.upload_id),
        "status": session.status,
        "completed_chunks": completed_chunk_indices,
        "completed_chunk_count": len(completed_chunk_indices),
        "total_chunks": session.total_chunks,
        "total_files": session.total_files,
    })


@login_required
@require_POST
def upload_complete(request, event_id):
    """
    Called once all chunks are uploaded.
    Marks session completed and triggers Phase 1 AI processing orchestrator ONCE.
    """
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    upload_id_str = request.POST.get("upload_id")
    if upload_id_str:
        try:
            upload_id = uuid.UUID(upload_id_str)
            session = PhotoUploadSession.objects.filter(upload_id=upload_id, event=event).first()
            if session:
                session.status = "completed"
                session.save(update_fields=["status", "updated_at"])
        except ValueError:
            pass

    event.ai_status = "processing"
    event.save(update_fields=["ai_status", "updated_at"])

    # Trigger Phase 1 Orchestrator ONCE
    if USE_PARALLEL_ORCHESTRATOR:
        orchestrate_event_processing.delay(event.id)
    else:
        process_event_photos_task.delay(event.id)

    return JsonResponse({
        "success": True,
        "message": "All chunks uploaded successfully. AI processing has started.",
        "redirect_url": reverse("events:detail", kwargs={"event_id": event.id})
    })
