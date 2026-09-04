from django.contrib import admin
from django.contrib import messages

from .models import Event, EventPhoto
from .services.ai_service import build_event_database


@admin.action(description="Process selected events")
def process_selected_events(modeladmin, request, queryset):

    for event in queryset:

        try:

            result = build_event_database(event)

            messages.success(
                request,
                f"AI processing completed for {event.name}."
            )

        except Exception as error:

            messages.error(
                request,
                f"AI processing failed for {event.name}: {error}"
            )


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):

    list_display = (
        "name",
        "tenant",
        "event_date",
        "ai_status",
        "is_active",
        "created_at",
    )

    list_filter = (
        "tenant",
        "ai_status",
        "is_active",
    )

    search_fields = (
        "name",
        "tenant__name",
    )
    
    actions = [
        process_selected_events
    ]

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