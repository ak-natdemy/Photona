from pathlib import Path


# =====================================================
# Project Directories
# =====================================================

PROJECT_DIR = Path(__file__).resolve().parent

DATABASE_DIR = PROJECT_DIR / "database"

AI_INPUT_DIR = PROJECT_DIR / "ai_input"

FAISS_INDEX_FILE = "face_index.faiss"

IMAGE_RECORDS_FILE = "image_records.pkl"

FACE_RECORDS_FILE = "face_records.pkl"

MODELS_DIR = PROJECT_DIR / "models"

OUTPUTS_DIR = PROJECT_DIR / "outputs"


# =====================================================
# Create Required Directories
# =====================================================

AI_INPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# =====================================================
# InsightFace Settings
# =====================================================

MODEL_NAME = "buffalo_l"

DETECTION_SIZE = (640, 640)


# =====================================================
# Search Settings
# =====================================================

SIMILARITY_THRESHOLD = 0.40


# =====================================================
# Supported Image Extensions
# =====================================================

VALID_IMAGE_EXTENSIONS = (
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp",
)


# =====================================================
# EVENT DATABASE DIRECTORY
# =====================================================

def get_event_database_dir(event_id: int) -> Path:
    """
    Return the database directory for a specific event.

    Example
    -------
    event_name = "Wedding"

    Returns
    -------
    database/Wedding/
    """

    event_database_dir = DATABASE_DIR / f"event_{event_id}"

    event_database_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    return event_database_dir