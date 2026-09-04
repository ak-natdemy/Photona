from pathlib import Path
import shutil

from config import AI_INPUT_DIR

from services.database_builder import build_database
from services.person_search import search_person


def build_event_database(event):

    event_input_dir = AI_INPUT_DIR / event.ai_database_name

    event_input_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    event.ai_status = "processing"
    event.save(
        update_fields=["ai_status"]
    )

    try:

        for event_photo in event.photos.all():

            source_path = Path(
                event_photo.image.path
            )

            destination_path = (
                event_input_dir /
                source_path.name
            )

            shutil.copy2(
                source_path,
                destination_path
            )

        result = build_database(
            event.ai_database_name,
            event_input_dir
        )

        event.ai_status = "ready"
        event.save(
            update_fields=["ai_status"]
        )

        return result

    except Exception:

        event.ai_status = "failed"
        event.save(
            update_fields=["ai_status"]
        )

        raise


def search_event_person(
    event,
    person_name,
    query_image_path
):

    return search_person(
        event.ai_database_name,
        person_name,
        query_image_path
    )