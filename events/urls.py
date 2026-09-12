from django.urls import path

from . import views

app_name = "events"

urlpatterns = [
    path(
        "create/",
        views.create_event,
        name="create"
    ),

    path(
        "<int:event_id>/status/",
        views.event_ai_status,
        name="ai_status"
    ),

    path(
        "<int:event_id>/",
        views.event_detail,
        name="detail"
    ),

    path(
        "<int:event_id>/upload/",
        views.upload_photos,
        name="upload_photos"
    ),
]