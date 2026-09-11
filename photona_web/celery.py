import os

from celery import Celery


os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE",
    "photona_web.settings"
)


app = Celery("photona_web")


app.config_from_object(
    "django.conf:settings",
    namespace="CELERY"
)


app.autodiscover_tasks()