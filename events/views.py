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

from .tasks import process_event_photos_task
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

    # Descending order (last added photo first)
    photos = event.photos.all().order_by(
        "-uploaded_at", "-id"
    )

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
            from .services.person_clustering import cluster_event_people
            cluster_event_people(event)
            people = event.people.prefetch_related("photos").all()
        except Exception as e:
            logger.warning("Initial face clustering failed on event_detail: %s", e)

    total_photos_count = photos.count()
    processing_photos_count = photos.filter(processing_status="processing").count()
    pending_photos_count = photos.filter(processing_status="pending").count()
    completed_photos_count = photos.filter(processing_status__in=["completed", "ready"]).count()
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

        # Enforce maximum 150 photos per upload batch
        MAX_BATCH_SIZE = 150
        capped_notice = False
        if len(files) > MAX_BATCH_SIZE:
            files = files[:MAX_BATCH_SIZE]
            capped_notice = True

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
            "form": form
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
            from .services.person_clustering import cluster_event_people
            cluster_event_people(event)
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
            from .services.person_clustering import cluster_event_people
            cluster_event_people(event)
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

    photos = event.photos.all().order_by("-uploaded_at", "-id")

    photo_statuses = []
    completed_count = 0
    processing_count = 0
    pending_count = 0
    failed_count = 0
    for photo in photos:
        st = (photo.processing_status or "pending").lower()
        if st in ("completed", "ready"):
            completed_count += 1
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

    return JsonResponse({
        "ai_status": event.ai_status,
        "photos": photo_statuses,
        "total_count": len(photo_statuses),
        "completed_count": completed_count,
        "processing_count": processing_count,
        "pending_count": pending_count,
        "failed_count": failed_count,
        "has_processing_photos": (processing_count + pending_count) > 0,
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
        all_photos = event.photos.all().order_by("-uploaded_at", "-id")
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

