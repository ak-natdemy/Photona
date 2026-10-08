from django.urls import path

from .views import (
    landing_page_view,
    contact_submit_view,
    login_view,
    dashboard,
    register_view,
    logout_view,
    dashboard_stats,
    plans_and_recharge,
)


urlpatterns = [

    path(
        "",
        landing_page_view,
        name="landing"
    ),

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

    path(
        "contact-submit/",
        contact_submit_view,
        name="contact_submit",
    ),

]
