from pathlib import Path

from tqdm import tqdm

from config import VALID_IMAGE_EXTENSIONS

from core.detector import process_image




def get_image_files(
    event_folder
):
    """
    Get all supported image files
    from an event folder.

    Parameters
    ----------
    event_folder : str | Path

    Returns
    -------
    list[Path]
    """

    event_folder = Path(event_folder)

    if not event_folder.exists():

        raise FileNotFoundError(
            f"Folder not found: {event_folder}"
        )

    image_files = [file for file in event_folder.iterdir() if file.is_file()]

    image_files.sort()

    return image_files





def process_event(
    image_records,
    app,
    on_photo_started=None,
    on_photo_processed=None,
):
    """
    Process all supplied event images.
    """

    # ----------------------------------------
    # Prepare Image Records
    # ----------------------------------------

    image_files = [
        {
            "image_id": record["image_id"],
            "image_path": Path(record["image_path"])
        }
        for record in image_records
    ]

    # ----------------------------------------
    # Create Databases
    # ----------------------------------------

    processed_image_records = []

    face_records = []

    # ----------------------------------------
    # Process Every Image
    # ----------------------------------------

    for record in tqdm(image_files):

        image_id = record["image_id"]

        image_path = record["image_path"]

        if on_photo_started:
            try:
                on_photo_started(image_id)
            except Exception:
                pass

        image_record, face_record_list = process_image(
            image_path=image_path,
            app=app,
            image_id=image_id
        )

        if on_photo_processed:
            try:
                on_photo_processed(image_id)
            except Exception:
                pass

        if image_record is None:
            continue

        processed_image_records.append(
            image_record
        )

        face_records.extend(
            face_record_list
        )

    return processed_image_records, face_records