from pathlib import Path

from config import DATABASE_DIR
from core.detector import load_face_model
from core.event_processor import process_event

from core.faiss_index import (
    build_faiss_index,
    save_faiss_index
)

from core.database import (
    save_face_records,
    save_image_records
)


def build_database(event_folder: Path) -> dict:
    """
    Build the complete face database for an event.

    Parameters
    ----------
    event_folder : Path
        Path to the event folder.

    Returns
    -------
    dict
        Summary of the database creation.
    """

    # ----------------------------------------
    # Load Face Model
    # ----------------------------------------

    app = load_face_model()

    # ----------------------------------------
    # Process Event Images
    # ----------------------------------------

    image_records, face_records = process_event(
        event_folder=event_folder,
        app=app
    )

    # ----------------------------------------
    # Build FAISS Index
    # ----------------------------------------

    index = build_faiss_index(face_records)

    # ----------------------------------------
    # Save Database
    # ----------------------------------------

    save_image_records(image_records)

    save_face_records(face_records)

    save_faiss_index(index)

    # ----------------------------------------
    # Return Summary
    # ----------------------------------------

    return {
        "success": True,
        "event_folder": str(event_folder),
        "images_processed": len(image_records),
        "faces_detected": len(face_records),
        "index_size": index.ntotal,
        "database_path": DATABASE_DIR
    }