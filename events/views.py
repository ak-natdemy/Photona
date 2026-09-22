from django.contrib.auth.decorators import login_required
from django.core.files.base import ContentFile
from django.http import JsonResponse, HttpResponse, FileResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.http import require_POST
from django.db import transaction

from .models import Event, EventPhoto
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
import io
import shutil
import tempfile
import zipfile
import gdown
from django.utils.text import slugify

from django.conf import settings
from core.qr import generate_qr_code

logger = logging.getLogger(__name__)


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

    public_event_url = (
        f"{settings.SITE_URL}"
        f"/e/{event.public_token}/"
    )

    qr_code = generate_qr_code(
        public_event_url
    )

    upload_form = EventPhotoUploadForm()
    edit_form = EventUpdateForm(instance=event)

    return render(
        request,
        "events/event_detail.html",
        {
            "event": event,
            "photos": photos,
            "public_event_url": public_event_url,
            "qr_code": qr_code,
            "upload_form": upload_form,
            "edit_form": edit_form,
        }
    )


@login_required
def create_event(request):
    user = request.user
    tenant = getattr(user, "tenant", None)

    if request.method == "POST":
        form = EventCreateForm(
            request.POST,
            request.FILES
        )

        if form.is_valid():
            with transaction.atomic():
                event = form.save(commit=False)
                event.tenant = tenant
                event.save()

                uploaded_files = form.cleaned_data.get("photos", [])
                for uploaded_file in uploaded_files:
                    EventPhoto.objects.create(
                        event=event,
                        image=uploaded_file
                    )

                if uploaded_files:
                    process_event_photos_task.delay(event.id)

            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                return JsonResponse({
                    "success": True,
                    "redirect_url": reverse("events:detail", kwargs={"event_id": event.id}),
                    "event_id": event.id,
                })

            return redirect(
                "events:detail",
                event_id=event.id
            )
        else:
            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                errors = {field: [str(err) for err in errs] for field, errs in form.errors.items()}
                return JsonResponse({"success": False, "errors": errors}, status=400)

    else:
        form = EventCreateForm()

    return render(
        request,
        "events/create_event.html",
        {
            "form": form,
            "user": user,
            "tenant": tenant,
        }
    )


@login_required
def edit_event(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    next_url = (
        request.POST.get("next")
        or request.META.get("HTTP_REFERER")
        or reverse("events:detail", kwargs={"event_id": event.id})
    )

    if request.method == "POST":
        form = EventUpdateForm(
            request.POST,
            request.FILES,
            instance=event
        )

        if form.is_valid():
            if request.POST.get("clear_thumbnail") == "1":
                if event.thumbnail:
                    event.thumbnail.delete(save=False)
                event.thumbnail = None

            event = form.save()

            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                return JsonResponse({
                    "success": True,
                    "name": event.name,
                    "description": event.description or "",
                    "event_date": event.event_date.strftime("%b %d, %Y") if event.event_date else "",
                    "thumbnail_url": event.cover_url or "",
                })

            return redirect(next_url)
        else:
            logger.warning("Edit event validation failed for event %s: %s", event.id, form.errors)
            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                errors = {field: [str(err) for err in errs] for field, errs in form.errors.items()}
                return JsonResponse({"success": False, "errors": errors}, status=400)

            return redirect(next_url)

    return redirect(next_url)


@login_required
@require_POST
def delete_event(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    event_name = event.name
    if event.thumbnail:
        try:
            event.thumbnail.delete(save=False)
        except Exception:
            pass

    event.delete()

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse({
            "success": True,
            "message": f"Event '{event_name}' was deleted successfully."
        })

    return redirect("dashboard")


@login_required
def upload_photos(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    if request.method == "POST":
        images = request.FILES.getlist("images")
        if not images:
            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                return JsonResponse({"success": False, "error": "No files selected."}, status=400)
            return redirect("events:detail", event_id=event.id)

        created_photos = []
        for img in images:
            ext = os.path.splitext(img.name)[1].lower()
            if ext in [".jpg", ".jpeg", ".png", ".webp"]:
                photo = EventPhoto.objects.create(
                    event=event,
                    image=img
                )
                created_photos.append(photo)

        if created_photos:
            process_event_photos_task.delay(event.id)

        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse({
                "success": True,
                "count": len(created_photos),
                "message": f"Successfully uploaded {len(created_photos)} photo(s)."
            })

        return redirect("events:detail", event_id=event.id)

    return redirect("events:detail", event_id=event.id)


@login_required
@require_POST
def delete_photo(request, event_id, photo_id):
    photo = get_object_or_404(
        EventPhoto,
        id=photo_id,
        event_id=event_id,
        event__tenant=request.user.tenant
    )

    if photo.image:
        try:
            photo.image.delete(save=False)
        except Exception as e:
            logger.warning("Error deleting image file: %s", e)

    photo.delete()

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse({
            "success": True,
            "photo_id": photo_id,
            "message": "Photo deleted."
        })

    return redirect("events:detail", event_id=event_id)


@login_required
@require_POST
def bulk_delete_photos(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    photo_ids = request.POST.getlist("photo_ids")
    if not photo_ids and request.POST.get("ids"):
        photo_ids = [i.strip() for i in request.POST.get("ids", "").split(",") if i.strip()]

    if not photo_ids:
        return JsonResponse({"success": False, "error": "No photos selected for deletion."}, status=400)

    photos = EventPhoto.objects.filter(event=event, id__in=photo_ids)
    count = photos.count()

    for p in photos:
        if p.image:
            try:
                p.image.delete(save=False)
            except Exception:
                pass
        p.delete()

    next_url = request.POST.get("next") or reverse("events:detail", kwargs={"event_id": event.id})
    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse({
            "success": True,
            "deleted_count": count,
            "message": f"Successfully deleted {count} photo(s)."
        })

    return redirect(next_url)


@login_required
def manager_download_photos_zip(request, event_id):
    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    ids_param = request.POST.getlist("photo_ids")
    if not ids_param and request.GET.getlist("ids"):
        ids_param = request.GET.getlist("ids")
    elif not ids_param and request.GET.get("ids"):
        ids_param = [i.strip() for i in request.GET.get("ids", "").split(",") if i.strip()]

    if ids_param:
        photos = event.photos.filter(id__in=ids_param).order_by("-uploaded_at", "-id")
    else:
        photos = event.photos.all().order_by("-uploaded_at", "-id")

    if not photos.exists():
        return HttpResponse("No photos found to download.", status=404)

    safe_event_name = slugify(event.name) or f"event_{event.id}"
    zip_filename = f"Photona_{safe_event_name}_photos.zip"

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
        return JsonResponse({"success": False, "error": "Please provide a Google Drive link."}, status=400)

    if "drive.google.com" not in drive_url:
        return JsonResponse({
            "success": False,
            "error": "The URL must be a valid Google Drive link (e.g., https://drive.google.com/...)."
        }, status=400)

    temp_dir = tempfile.mkdtemp(prefix=f"photona_drive_{event.id}_")
    imported_count = 0

    try:
        is_folder = "folders" in drive_url or "drive/u" in drive_url or "open?id=" in drive_url

        if is_folder:
            logger.info("Attempting gdown folder download for event %s: %s", event.id, drive_url)
            gdown.download_folder(
                url=drive_url,
                output=temp_dir,
                quiet=True,
                use_cookies=False
            )
        else:
            logger.info("Attempting gdown single/fuzzy file download for event %s: %s", event.id, drive_url)
            gdown.download(
                url=drive_url,
                output=os.path.join(temp_dir, "downloaded_file"),
                quiet=True,
                fuzzy=True
            )

        valid_extensions = {".jpg", ".jpeg", ".png", ".webp"}
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in valid_extensions:
                    full_path = os.path.join(root, file)
                    if os.path.isfile(full_path) and os.path.getsize(full_path) > 0:
                        with open(full_path, "rb") as f:
                            file_content = f.read()
                            EventPhoto.objects.create(
                                event=event,
                                image=ContentFile(file_content, name=file)
                            )
                            imported_count += 1

        if imported_count > 0:
            process_event_photos_task.delay(event.id)
            return JsonResponse({
                "success": True,
                "imported_count": imported_count,
                "message": f"Successfully imported {imported_count} photo(s) from Google Drive!"
            })
        else:
            return JsonResponse({
                "success": False,
                "error": "No valid image files (JPG, PNG, WebP) were found in the provided Drive link. Ensure the link has sharing set to 'Anyone with the link can view'."
            }, status=400)

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
    for photo in photos:
        photo_statuses.append({
            "id": photo.id,
            "processing_status": photo.processing_status,
        })

    return JsonResponse({
        "ai_status": event.ai_status,
        "photos": photo_statuses,
    })


def public_event(request, public_token):
    event = get_object_or_404(
        Event,
        public_token=public_token,
        is_active=True,
    )

    if event.ai_status != "ready":
        return render(
            request,
            "events/public_event_unavailable.html",
            {
                "event": event,
            }
        )

    form = SelfieSearchForm()
    matching_photos = []

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
            "form": form,
            "matching_photos": matching_photos,
        }
    )


def download_single_photo(request, public_token, photo_id):
    event = get_object_or_404(
        Event,
        public_token=public_token,
        is_active=True
    )
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
    event = get_object_or_404(
        Event,
        public_token=public_token,
        is_active=True
    )

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
