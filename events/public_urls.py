from django.urls import path

from . import views


app_name = "public_events"


urlpatterns = [
    path(
        "<uuid:public_token>/",
        views.public_event,
        name="event"
    ),
]