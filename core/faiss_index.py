import faiss
import numpy as np

from config import (
    get_event_database_dir,
    FAISS_INDEX_FILE
)


def build_faiss_index(face_records):
    """
    Build a FAISS index from face embeddings.
    """

    embeddings = [record["embedding"] for record in face_records]

    embeddings = np.array(embeddings,dtype=np.float32)

    if embeddings.ndim != 2:
        raise ValueError(f"Invalid embeddings shape: {embeddings.shape}")

    # ----------------------------------------
    # Normalize Embeddings
    # ----------------------------------------

    faiss.normalize_L2(embeddings)

    # ----------------------------------------
    # Create FAISS Index
    # ----------------------------------------

    dimension = embeddings.shape[1]

    index = faiss.IndexFlatIP(dimension)

    # ----------------------------------------
    # Add Embeddings
    # ----------------------------------------

    index.add(embeddings)

    return index


def save_faiss_index(index, event_id):
    """
    Save FAISS index for a specific event.
    """

    event_dir = get_event_database_dir(event_id)

    file_path = event_dir / FAISS_INDEX_FILE

    faiss.write_index(index,str(file_path))


def load_faiss_index(event_id):
    """
    Load FAISS index for a specific event.
    """

    event_dir = get_event_database_dir(event_id)

    file_path = event_dir / FAISS_INDEX_FILE

    if not file_path.exists():
        raise FileNotFoundError(f"FAISS index not found for event: {event_id}")

    return faiss.read_index(str(file_path))