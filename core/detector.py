"""
detector.py

This module contains all functions related to:

1. Loading the InsightFace model.
2. Processing event images with in-memory downscaling (preserving master files on disk).
3. Processing query images.
"""

import os
from pathlib import Path

# Limit background worker thread contention on CPU
os.environ["OMP_NUM_THREADS"] = "2"
os.environ["MKL_NUM_THREADS"] = "2"
os.environ["ORT_NUM_THREADS"] = "2"
os.environ["OPENBLAS_NUM_THREADS"] = "2"

import cv2
import numpy as np

# Set OpenCV threads to prevent CPU saturation
cv2.setNumThreads(2)

import warnings
warnings.filterwarnings("ignore")

from insightface.app import FaceAnalysis

from config import MODEL_NAME, DETECTION_SIZE, MAX_DETECTION_DIM

import faiss


# ==========================================================
# Load Face Detection Model
# ==========================================================

def load_face_model():
    """
    Load and initialize the InsightFace model.

    Returns
    -------
    FaceAnalysis
        Initialized InsightFace model.
    """

    app = FaceAnalysis(
        name=MODEL_NAME
    )

    app.prepare(
        ctx_id=0,
        det_size=DETECTION_SIZE
    )

    return app


# ==========================================================
# Process Event Image
# ==========================================================

def process_image(
    image_path,
    app,
    image_id
):
    """
    Process a single event image.

    Note:
    Downscaling happens ONLY in-memory to prevent system lockups.
    The original image file on disk is never altered or modified.
    Bounding box coordinates are scaled back to match the original
    full-resolution image file.

    Parameters
    ----------
    image_path : str | Path
        Path to the event image.

    app : FaceAnalysis
        Initialized InsightFace model.

    image_id : int
        Unique image ID.

    Returns
    -------
    tuple
        image_record : dict
        face_records : list
    """

    # --------------------------------------------------
    # Read Image
    # --------------------------------------------------

    image = cv2.imread(str(image_path))

    if image is None:
        print(f"Could not read image: {image_path}")
        return None, []

    orig_h, orig_w = image.shape[:2]
    max_dim = max(orig_h, orig_w)
    scale = 1.0

    # In-memory resize to limit RAM allocation (original file on disk remains untouched)
    if max_dim > MAX_DETECTION_DIM:
        scale = MAX_DETECTION_DIM / float(max_dim)
        new_w = max(1, int(round(orig_w * scale)))
        new_h = max(1, int(round(orig_h * scale)))
        image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # --------------------------------------------------
    # Convert BGR -> RGB
    # --------------------------------------------------

    image = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB
    )

    # --------------------------------------------------
    # Detect Faces
    # --------------------------------------------------

    faces = app.get(image)

    # --------------------------------------------------
    # Create Image Record
    # --------------------------------------------------

    image_record = {
        "image_id": image_id,
        "filename": Path(image_path).name,
        "image_path": str(image_path),
        "total_faces": len(faces)
    }

    # --------------------------------------------------
    # Create Face Records
    # --------------------------------------------------

    face_records = []

    for face in faces:
        # Scale bounding box back to original master file resolution
        if hasattr(face, "bbox") and face.bbox is not None:
            if scale != 1.0:
                scaled_bbox = (face.bbox / scale).astype(int).tolist()
            else:
                scaled_bbox = face.bbox.astype(int).tolist()
        else:
            scaled_bbox = None

        face_record = {
            "image_id": image_id,
            "embedding": face.embedding.astype(np.float32),
            "bbox": scaled_bbox,
            "det_score": float(face.det_score) if hasattr(face, "det_score") else 1.0,
        }

        face_records.append(face_record)

    return image_record, face_records


# ==========================================================
# Process Query Image
# ==========================================================

def process_query_image(
    image_path,
    app
):
    """
    Process a query (selfie) image with in-memory downscaling.

    Returns
    -------
    dict
        {
            "success": bool,
            "status": str,
            "embedding": numpy.ndarray | None
        }
    """

    # --------------------------------------------------
    # Read Image
    # --------------------------------------------------

    image = cv2.imread(str(image_path))

    if image is None:
        print(f"Could not read image: {image_path}")
        return {
            "success": False,
            "status": "invalid_image",
            "embedding": None,
        }

    orig_h, orig_w = image.shape[:2]
    max_dim = max(orig_h, orig_w)

    # In-memory resize if selfie is high-res (e.g. 12MP/48MP)
    if max_dim > MAX_DETECTION_DIM:
        scale = MAX_DETECTION_DIM / float(max_dim)
        new_w = max(1, int(round(orig_w * scale)))
        new_h = max(1, int(round(orig_h * scale)))
        image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # --------------------------------------------------
    # Convert BGR -> RGB
    # --------------------------------------------------

    image = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB
    )

    # --------------------------------------------------
    # Detect Faces
    # --------------------------------------------------

    faces = app.get(image)

    # --------------------------------------------------
    # No Face Found
    # --------------------------------------------------

    if len(faces) == 0:
        print("No face detected.")
        return {
            "success": False,
            "status": "no_face",
            "embedding": None,
        }

    # --------------------------------------------------
    # Multiple Faces Found
    # --------------------------------------------------

    if len(faces) > 1:
        print("Please upload an image containing only one face.")
        return {
            "success": False,
            "status": "multiple_faces",
            "embedding": None,
        }

    # --------------------------------------------------
    # Get Face Embedding
    # --------------------------------------------------

    query_embedding = (
        faces[0]
        .embedding
        .astype(np.float32)
    )

    query_embedding = np.expand_dims(
        query_embedding,
        axis=0
    )

    # --------------------------------------------------
    # Normalize Embedding
    # --------------------------------------------------

    faiss.normalize_L2(
        query_embedding
    )

    return {
        "success": True,
        "status": "success",
        "embedding": query_embedding,
    }

# ==========================================================
# Worker Process Model Singleton
# ==========================================================

_worker_face_app = None


def get_worker_face_app():
    """
    Return a cached InsightFace model instance for this worker process.
    Prevents reloading 650MB+ model weights for every photo/batch.
    """
    global _worker_face_app
    if _worker_face_app is None:
        _worker_face_app = load_face_model()
    return _worker_face_app
