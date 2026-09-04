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