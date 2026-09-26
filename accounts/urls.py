from django.urls import path

from .views import (
    login_view,
    dashboard,
    register_view,
    logout_view,
    dashboard_stats,
    plans_and_recharge,
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

    path(
        "logout/",
        logout_view,
        name="logout"
    ),

    path(
        "dashboard/stats/",
        dashboard_stats,
        name="dashboard_stats",
    ),

    path(
        "plans/",
        plans_and_recharge,
        name="plans",
    ),

]
