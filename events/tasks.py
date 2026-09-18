import logging

from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist

from events.models import Event
from events.services import process_pending_event_photos


logger = logging.getLogger(__name__)


@shared_task
def test_celery_task():

    logger.info(
        "Photona Celery task executed successfully."
    )

    return "success"


@shared_task(
    bind=True,
    autoretry_for=(ConnectionError, TimeoutError),
    retry_backoff=True,
    retry_backoff_max=60,
    max_retries=3,
)
def process_event_photos_task(
    self,
    event_id
):
    """
    Process pending photos for an event
    in the background.

    Parameters
    ----------
    event_id : int
        ID of the event whose pending photos
        should be processed.
    """

    try:

        event = Event.objects.get(
            id=event_id
        )

    except Event.DoesNotExist:

        logger.warning(
            "Event %s no longer exists. "
            "Skipping photo processing.",
            event_id
        )

        return {
            "success": False,
            "event_id": event_id,
            "status": "event_not_found",
        }


    logger.info(
        "Starting photo processing for event %s.",
        event_id
    )


    try:

        result = process_pending_event_photos(
            event
        )

        logger.info(
            "Photo processing completed for event %s.",
            event_id
        )

        return result


    except Exception:

        logger.exception(
            "Photo processing failed for event %s.",
            event_id
        )

        raise