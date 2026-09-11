from ..models import Event


def get_event_image_records(event):
    """
    Prepare event photos for the AI pipeline.

    Returns
    -------
    list[dict]
        Each dictionary contains the Django
        EventPhoto ID and the image path.
    """

    image_records = []

    photos = event.photos.all().order_by("id")

    for photo in photos:

        image_records.append(
            {
                "image_id": photo.id,
                "image_path": photo.image.path,
            }
        )

    return image_records


def get_pending_event_image_records(event):
    """
    Prepare only pending event photos for AI processing.
    """

    image_records = []

    photos = event.photos.filter(
        processing_status="pending"
    ).order_by("id")

    for photo in photos:
        image_records.append(
            {
                "image_id": photo.id,
                "image_path": photo.image.path,
            }
        )

    return image_records


def get_pending_event_photos(event):
    """
    Return Django EventPhoto objects that are waiting
    for AI processing.
    """

    return event.photos.filter(
        processing_status="pending"
    ).order_by("id")


def mark_photos_processing(photos):
    """
    Mark the supplied EventPhoto objects as processing.
    """

    for photo in photos:
        photo.processing_status = "processing"
        photo.save(
            update_fields=[
                "processing_status"
            ]
        )


def mark_photos_failed(photos):
    """
    Mark the supplied EventPhoto objects as failed.
    """

    for photo in photos:
        photo.processing_status = "failed"
        photo.save(
            update_fields=[
                "processing_status"
            ]
        )

def mark_photos_completed(photos):
    """
    Mark the supplied EventPhoto objects as completed.
    """

    for photo in photos:
        photo.processing_status = "completed"
        photo.save(
            update_fields=[
                "processing_status"
            ]
        )


def build_event_ai_database(event):
    """
    Build the AI face database for a Django event.
    """

    # ----------------------------------------
    # Mark AI Processing Started
    # ----------------------------------------

    event.ai_status = "processing"
    event.save(
        update_fields=[
            "ai_status",
            "updated_at"
        ]
    )

    try:

        # ----------------------------------------
        # Get Event Images
        # ----------------------------------------

        image_records = get_event_image_records(
            event
        )

        # ----------------------------------------
        # Run AI Pipeline
        # ----------------------------------------

        from services.database_builder import build_database

        result = build_database(
            event_id=event.id,
            image_records=image_records
        )

        # ----------------------------------------
        # Mark AI Processing Completed
        # ----------------------------------------

        event.ai_status = "ready"
        event.save(
            update_fields=[
                "ai_status",
                "updated_at"
            ]
        )

        return result

    except Exception:

        # ----------------------------------------
        # Mark AI Processing Failed
        # ----------------------------------------

        event.ai_status = "failed"
        event.save(
            update_fields=[
                "ai_status",
                "updated_at"
            ]
        )

        raise


def process_pending_event_photos(event):
    """
    Process all pending photos for an event.

    Handles the Django-side processing workflow:
    pending → processing → completed/failed.
    """

    pending_photos = get_pending_event_photos(event)

    if not pending_photos:
        return {
            "success": True,
            "event_id": event.id,
            "images_processed": 0,
            "faces_detected": 0,
        }

    mark_photos_processing(
        pending_photos
    )

    try:
        image_records = [
            {
                "image_id": photo.id,
                "image_path": photo.image.path,
            }
            for photo in pending_photos
        ]

        from services.incremental_database_builder import (
            build_incremental_event_ai_database
        )

        result = build_incremental_event_ai_database(
            event_id=event.id,
            image_records=image_records
        )

        mark_photos_completed(
            pending_photos
        )

        return {
            "success": True,
            "event_id": event.id,
            "images_processed": result["new_image_count"],
            "faces_detected": result["new_face_count"],
        }

    except Exception:
        mark_photos_failed(
            pending_photos
        )
        raise