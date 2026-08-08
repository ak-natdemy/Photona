from pathlib import Path

from config import DATABASE_DIR

from services.person_search import search_person


def get_available_events():
    """
    Get all available event folders from the database directory.
    """

    if not DATABASE_DIR.exists():
        return []

    events = [
        folder
        for folder in DATABASE_DIR.iterdir()
        if folder.is_dir()
    ]

    return sorted(
        events,
        key=lambda folder: folder.name.lower()
    )


def select_event():
    """
    Display available events and let the user select one.
    """

    events = get_available_events()

    if not events:
        print()
        print("No events found.")
        print("Please build an event database first.")
        return None

    print()
    print("=" * 60)
    print("Available Events")
    print("=" * 60)

    for number, event in enumerate(events, start=1):
        print(f"{number}. {event.name}")

    print()

    while True:

        choice = input(
            "Select Event: "
        ).strip()

        if not choice.isdigit():
            print("Please enter a valid number.")
            continue

        choice = int(choice)

        if choice < 1 or choice > len(events):
            print("Please select a number from the list.")
            continue

        return events[choice - 1].name


def main():

    print("=" * 60)
    print("Photona Person Search")
    print("=" * 60)

    # ----------------------------------------
    # Select Event
    # ----------------------------------------

    event_name = select_event()

    if event_name is None:
        return

    print()
    print(f"Selected Event: {event_name}")

    # ----------------------------------------
    # Person Name
    # ----------------------------------------

    person_name = input(
        "Enter Person Name: "
    ).strip()

    if not person_name:
        print("Person name cannot be empty.")
        return

    # ----------------------------------------
    # Query Image
    # ----------------------------------------

    query_image_path = Path(
        input(
            "Enter Query Image Path: "
        ).strip()
    )

    if not query_image_path.exists():
        print()
        print("Query image does not exist.")
        return

    # ----------------------------------------
    # Search
    # ----------------------------------------

    print()
    print("=" * 60)
    print("Searching...")
    print("=" * 60)

    result = search_person(
        event_name,
        person_name,
        query_image_path
    )

    # ----------------------------------------
    # Display Result
    # ----------------------------------------

    print()
    print("=" * 60)
    print("Search Completed")
    print("=" * 60)

    print(
        f"Event          : {result['event_name']}"
    )

    print(
        f"Person         : {person_name}"
    )

    print(
        f"Total Matches  : {result['total_matches']}"
    )

    print(
        f"Output Folder  : {result['output_folder']}"
    )


if __name__ == "__main__":
    main()