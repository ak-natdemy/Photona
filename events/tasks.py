from celery import shared_task


@shared_task
def test_celery_task():
    print("Photona Celery task executed successfully!")

    return "success"


@shared_task
def build_event_ai_database_task(event_id):
    """
    Build the AI database for a Django event
    in the background using Celery.
    """

    from events.models import Event
    from events.services import build_event_ai_database

    event = Event.objects.get(
        id=event_id
    )

    result = build_event_ai_database(
        event
    )

    return result