from core.detector import (
    load_face_model,
    process_query_image,
)

from core.faiss_index import (
    load_faiss_index,
)

from core.database import (
    load_face_records,
    load_image_records,
)

from core.search import (
    search_faces,
    get_matching_images,
)


def search_event(
    event_id,
    query_image_path,
):
    """
    Search an event using a user's selfie.

    Parameters
    ----------
    event_id : int
        Django Event ID.

    query_image_path : str | Path
        Path to the user's selfie.

    Returns
    -------
    dict
        Search result.
    """

    # --------------------------------------------------
    # Load AI Model
    # --------------------------------------------------

    app = load_face_model()

    # --------------------------------------------------
    # Load Event AI Database
    # --------------------------------------------------

    index = load_faiss_index(
        event_id
    )

    face_records = load_face_records(
        event_id
    )

    image_records = load_image_records(
        event_id
    )

    # --------------------------------------------------
    # Process Query Image
    # --------------------------------------------------

    query_result = process_query_image(
        image_path=query_image_path,
        app=app
    )

    if not query_result["success"]:

        return {
            "success": False,
            "event_id": event_id,
            "status": query_result["status"],
            "total_matches": 0,
            "matching_images": [],
        }

    query_embedding = query_result["embedding"]

    # --------------------------------------------------
    # Search Faces
    # --------------------------------------------------

    face_matches = search_faces(
        query_embedding=query_embedding,
        index=index,
        face_records=face_records,
    )

    # --------------------------------------------------
    # Convert Face Matches → Images
    # --------------------------------------------------

    matching_images = get_matching_images(
        face_matches=face_matches,
        image_records=image_records,
    )

    # --------------------------------------------------
    # Return Result
    # --------------------------------------------------

    return {
        "success": True,
        "event_id": event_id,
        "total_matches": len(matching_images),
        "matching_images": matching_images,
    }