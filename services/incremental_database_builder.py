from core.detector import load_face_model
from core.event_processor import process_event

from core.faiss_index import (
    build_faiss_index,
    load_faiss_index,
    save_faiss_index,
)

from core.database import (
    load_face_records,
    load_image_records,
    save_face_records,
    save_image_records,
)

def load_existing_event_database(event_id):
    """
    Load the existing AI database for an event.

    Returns
    -------
    tuple
        FAISS index, face records, and image records.
    """

    index = load_faiss_index(event_id)

    face_records = load_face_records(
        event_id
    )

    image_records = load_image_records(
        event_id
    )

    return (
        index,
        face_records,
        image_records
    )


def build_incremental_event_ai_database(event_id, image_records):
    """
    Incrementally build or update the AI database for an event.

    If an AI database already exists, new embeddings are added
    to the existing database.

    If no AI database exists, a new database is created.
    """

    app = load_face_model()

    processed_image_records, new_face_records = process_event(
        image_records=image_records,
        app=app
    )

    try:
        index = load_faiss_index(event_id)
        existing_face_records = load_face_records(event_id)
        existing_image_records = load_image_records(event_id)

    except FileNotFoundError:
        index = None
        existing_face_records = []
        existing_image_records = []

    new_embeddings = [
        record["embedding"]
        for record in new_face_records
    ]

    if index is None:

        if new_embeddings:
            index = build_faiss_index(new_face_records)
        else:
            index = None

    else:

        if new_embeddings:
            import numpy as np
            import faiss

            new_embeddings = np.array(
                new_embeddings,
                dtype=np.float32
            )

            faiss.normalize_L2(new_embeddings)

            index.add(new_embeddings)

    updated_face_records = (
        existing_face_records + new_face_records
    )

    updated_image_records = (
        existing_image_records + processed_image_records
    )

    if index is not None:
        save_faiss_index(
            index,
            event_id
        )

    save_face_records(
        updated_face_records,
        event_id
    )

    save_image_records(
        updated_image_records,
        event_id
    )

    return {
        "index": index,
        "face_records": updated_face_records,
        "image_records": updated_image_records,
        "new_face_count": len(new_face_records),
        "new_image_count": len(processed_image_records),
    }

