from pathlib import Path

from services.person_search import search_person


def main():

    print("=" * 60)
    print("Photona Person Search")
    print("=" * 60)

    query_image = Path(
        input("Enter Query Image Path: ").strip()
    )

    result = search_person(query_image)

    print()

    print("=" * 60)
    print("Search Completed")
    print("=" * 60)

    print(f"Total Matches : {result['total_matches']}")
    print(f"Output Folder : {result['output_folder']}")


if __name__ == "__main__":
    main()