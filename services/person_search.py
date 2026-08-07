from pathlib import Path

from core.detector import (
    load_face_model,
    process_query_image
)

from core.faiss_index import (
    load_faiss_index
)

from core.database import (
    load_face_records,
    load_image_records
)

from core.search import (
    search_faces,
    get_matching_images
)

from core.display import (
    copy_matching_images
)


def search_person(query_image_path: Path) -> dict:
    """
    Search for a person in the face database.

    Parameters
    ----------
    query_image_path : Path
        Path to the query image.

    Returns
    -------
    dict
        Search summary.
    """

    # ----------------------------------------
    # Load Face Model
    # ----------------------------------------

    app = load_face_model()

    # ----------------------------------------
    # Load Database
    # ----------------------------------------

    index = load_faiss_index()

    face_records = load_face_records()

    image_records = load_image_records()

    # ----------------------------------------
    # Process Query Image
    # ----------------------------------------

    query_embedding = process_query_image(
        image_path=query_image_path,
        app=app
    )

    # ----------------------------------------
    # Search Database
    # ----------------------------------------

    face_matches = search_faces(
        query_embedding=query_embedding,
        index=index,
        face_records=face_records
    )

    matching_images = get_matching_images(
        face_matches=face_matches,
        image_records=image_records
    )

    # ----------------------------------------
    # Copy Matching Images
    # ----------------------------------------

    output_folder = copy_matching_images(
        matching_images=matching_images,
        person_name=query_image_path.stem
    )

    # ----------------------------------------
    # Return Summary
    # ----------------------------------------

    return {
        "success": True,
        "total_matches": len(matching_images),
        "matching_images": matching_images,
        "output_folder": output_folder
    }