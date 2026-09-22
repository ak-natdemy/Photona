from django.urls import path
from . import views

app_name = "public_events"

urlpatterns = [
    path(
        "<uuid:public_token>/",
        views.public_event,
        name="event"
    ),
    path(
        "<uuid:public_token>/download-zip/",
        views.download_photos_zip,
        name="download_zip"
    ),
    path(
        "<uuid:public_token>/download/<int:photo_id>/",
        views.download_single_photo,
        name="download_single"
    ),
]
