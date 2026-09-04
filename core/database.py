import pickle

from config import (
    get_event_database_dir,
    FACE_RECORDS_FILE,
    IMAGE_RECORDS_FILE
)


def save_face_records(face_records, event_id):
    """
    Save face records for a specific event.
    """

    event_dir = get_event_database_dir(event_id)

    file_path = event_dir / FACE_RECORDS_FILE

    with open(file_path, "wb") as file:
        pickle.dump(face_records, file)


def load_face_records(event_id):
    """
    Load face records for a specific event.
    """

    event_dir = get_event_database_dir(event_id)

    file_path = event_dir / FACE_RECORDS_FILE

    if not file_path.exists():
        raise FileNotFoundError(
            f"Face records not found for event: {event_id}"
        )

    with open(file_path, "rb") as file:
        return pickle.load(file)


def save_image_records(image_records, event_id):
    """
    Save image records for a specific event.
    """

    event_dir = get_event_database_dir(event_id)

    file_path = event_dir / IMAGE_RECORDS_FILE

    with open(file_path, "wb") as file:
        pickle.dump(image_records, file)


def load_image_records(event_id):
    """
    Load image records for a specific event.
    """

    event_dir = get_event_database_dir(event_id)

    file_path = event_dir / IMAGE_RECORDS_FILE

    if not file_path.exists():
        raise FileNotFoundError(
            f"Image records not found for event: {event_id}"
        )

    with open(file_path, "rb") as file:
        return pickle.load(file)