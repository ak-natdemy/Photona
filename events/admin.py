from django.contrib import admin

from .models import Event, EventPhoto


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):

    list_display = (
        "name",
        "tenant",
        "event_date",
        "is_active",
        "created_at",
    )

    list_filter = (
        "tenant",
        "is_active",
    )

    search_fields = (
        "name",
        "tenant__name",
    )


@admin.register(EventPhoto)
class EventPhotoAdmin(admin.ModelAdmin):

    list_display = (
        "event",
        "image",
        "processing_status",
        "uploaded_at",
    )

    list_filter = (
        "processing_status",
        "event",
    )

    search_fields = (
        "event__name",
    )