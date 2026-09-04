from django.urls import path

from .views import (
    login_view,
    dashboard,
    register_view,
)


urlpatterns = [

    path(
        "login/",
        login_view,
        name="login"
    ),

    path(
        "register/",
        register_view,
        name="register"
    ),

    path(
        "dashboard/",
        dashboard,
        name="dashboard"
    ),

]