from celery import shared_task

from events.models import Event
from events.services import process_pending_event_photos


@shared_task
def test_celery_task():
    print("Photona Celery task executed successfully!")
    return "success"


@shared_task
def process_event_photos_task(event_id):
    """
    Process pending photos for an event in the background.

    Parameters
    ----------
    event_id : int
        ID of the event whose pending photos should be processed.
    """

    event = Event.objects.get(
        id=event_id
    )

    result = process_pending_event_photos(
        event
    )

    return result