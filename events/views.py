from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render

from .models import Event, EventPhoto
from .forms import (
    EventCreateForm,
    EventPhotoUploadForm,
    SelfieSearchForm
)

from .tasks import process_event_photos_task
from services.search_service import search_event

import logging
import os
import tempfile

logger = logging.getLogger(__name__)

@login_required
def event_detail(request, event_id):

    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    photos = event.photos.all().order_by("-uploaded_at")

    return render(
        request,
        "events/event_detail.html",
        {
            "event": event,
            "photos": photos,
        }
    )


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

        if form.is_valid():

            uploaded_files = form.cleaned_data["images"]

            for uploaded_file in uploaded_files:

                EventPhoto.objects.create(
                    event=event,
                    image=uploaded_file
                )

            process_event_photos_task.delay(
                event.id
            )

            return redirect(
                "events:detail",
                event_id=event.id
            )

    else:

        form = EventPhotoUploadForm()

    return render(
        request,
        "events/upload_photos.html",
        {
            "event": event,
            "form": form,
        }
    )


@login_required
def create_event(request):

    if request.method == "POST":

        form = EventCreateForm(
            request.POST
        )

        if form.is_valid():

            event = form.save(
                commit=False
            )

            # Automatically assign the
            # logged-in user's tenant
            event.tenant = request.user.tenant

            event.save()

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
            "form": form,
        }
    )

@login_required
def event_ai_status(request, event_id):

    event = get_object_or_404(
        Event,
        id=event_id,
        tenant=request.user.tenant
    )

    photos = event.photos.all().order_by("id")

    photo_statuses = []

    for photo in photos:

        photo_statuses.append(
            {
                "id": photo.id,
                "processing_status": photo.processing_status,
            }
        )

    return JsonResponse(
        {
            "ai_status": event.ai_status,
            "photos": photo_statuses,
        }
    )


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
                suffix = os.path.splitext(
                    selfie.name
                )[1].lower()

                file_descriptor, temporary_path = (
                    tempfile.mkstemp(
                        suffix=suffix
                    )
                )

                with os.fdopen(
                    file_descriptor,
                    "wb"
                ) as temporary_file:

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
                            "No face was detected. "
                            "Please upload a clear selfie."
                        )

                    elif status == "multiple_faces":
                        form.add_error(
                            "selfie",
                            "Multiple faces were detected. "
                            "Please upload a selfie containing "
                            "only your face."
                        )

                    elif status == "invalid_image":
                        form.add_error(
                            "selfie",
                            "The uploaded image could not be processed."
                        )

                    else:
                        form.add_error(
                            None,
                            "We could not process your selfie. "
                            "Please try another image."
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

                    photo_lookup = {
                        photo.id: photo
                        for photo in photos
                    }

                    for match in result["matching_images"]:

                        image_id = (
                            match["image_record"]["image_id"]
                        )

                        photo = photo_lookup.get(
                            image_id
                        )

                        if photo is None:
                            continue

                        matching_photos.append(
                            {
                                "photo": photo,
                                "score": match["score"],
                            }
                        )

            except Exception:
                logger.exception(
                    "Public face search failed "
                    "for event %s",
                    event.id
                )

                form.add_error(
                    None,
                    "Something went wrong while "
                    "searching your photos. "
                    "Please try again."
                )

            finally:

                if temporary_path is not None:

                    try:
                        os.remove(
                            temporary_path
                        )

                    except OSError:
                        logger.warning(
                            "Could not delete temporary "
                            "selfie: %s",
                            temporary_path
                        )

    return render(
        request,
        "events/public_event.html",
        {
            "event": event,
            "form": form,
            "matching_photos": matching_photos,
        }
    )