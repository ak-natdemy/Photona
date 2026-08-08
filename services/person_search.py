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


def search_person(
    event_name,
    person_name,
    query_image_path
):
    """
    Search for a person inside a specific event.
    """

    # ----------------------------------------
    # Load Face Model
    # ----------------------------------------

    app = load_face_model()

    # ----------------------------------------
    # Load Event Database
    # ----------------------------------------

    index = load_faiss_index(
        event_name
    )

    face_records = load_face_records(
        event_name
    )

    image_records = load_image_records(
        event_name
    )

    # ----------------------------------------
    # Process Query Image
    # ----------------------------------------

    query_embedding = process_query_image(
        image_path=query_image_path,
        app=app
    )

    # ----------------------------------------
    # Check Query Face
    # ----------------------------------------

    if query_embedding is None:
        return {
            "success": False,
            "event_name": event_name,
            "total_matches": 0,
            "matching_images": [],
            "output_folder": None
        }

    # ----------------------------------------
    # Search Faces
    # ----------------------------------------

    face_matches = search_faces(
        query_embedding=query_embedding,
        index=index,
        face_records=face_records
    )

    # ----------------------------------------
    # Get Matching Images
    # ----------------------------------------

    matching_images = get_matching_images(
        face_matches=face_matches,
        image_records=image_records
    )

    # ----------------------------------------
    # Copy Matching Images
    # ----------------------------------------

    output_folder = copy_matching_images(
        matching_images=matching_images,
        person_name=person_name
    )

    # ----------------------------------------
    # Return Results
    # ----------------------------------------

    return {
        "success": True,
        "event_name": event_name,
        "total_matches": len(matching_images),
        "matching_images": matching_images,
        "output_folder": output_folder
    }