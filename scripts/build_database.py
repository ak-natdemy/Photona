from pathlib import Path

from services.database_builder import build_database


def main():

    print("=" * 60)
    print("Photona Database Builder")
    print("=" * 60)

    event_folder = Path(input("Enter Event Folder Path: ").strip())
    event_name = input("Enter Event Name: ").strip()

    summary = build_database(event_name, event_folder)

    print()

    print("=" * 60)
    print("Database Created Successfully")
    print("=" * 60)

    print(f"Images Processed : {summary['images_processed']}")
    print(f"Faces Detected   : {summary['faces_detected']}")
    print(f"Faces Indexed    : {summary['index_size']}")



if __name__ == "__main__":
    main()