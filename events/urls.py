from django.urls import path
from . import views

app_name = "events"

urlpatterns = [
    path("create/", views.create_event, name="create"),
    path("<int:event_id>/", views.event_detail, name="detail"),
    path("<int:event_id>/edit/", views.edit_event, name="edit"),
    path("<int:event_id>/delete/", views.delete_event, name="delete"),
    path("<int:event_id>/status/", views.event_ai_status, name="ai_status"),
    path("<int:event_id>/upload/", views.upload_photos, name="upload_photos"),
    path("<int:event_id>/import-drive/", views.import_drive_photos, name="import_drive"),
    path("<int:event_id>/photos/<int:photo_id>/delete/", views.delete_photo, name="delete_photo"),
    path("<int:event_id>/photos/delete/", views.bulk_delete_photos, name="bulk_delete_photos"),
    path("<int:event_id>/download-zip/", views.manager_download_photos_zip, name="download_zip"),
]
