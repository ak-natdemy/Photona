from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render

from .models import Event, EventPhoto
from .forms import (
    EventCreateForm,
    EventPhotoUploadForm,
)


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