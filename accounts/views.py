from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import render, redirect
from django.http import JsonResponse

from events.models import EventPhoto

from .forms import TenantRegistrationForm
from tenants.models import Tenant
from .models import User
from django.db.models import Count


def login_view(request):

    # Already logged-in users do not need to login again
    if request.user.is_authenticated:
        return redirect("dashboard")

    if request.method == "POST":

        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")

        # Check empty fields
        if not username or not password:

            return render(
                request,
                "accounts/login.html",
                {
                    "error": "Please enter your username and password."
                }
            )

        # Authenticate user
        user = authenticate(
            request,
            username=username,
            password=password
        )

        if user is not None:

            login(request, user)

            return redirect("dashboard")

        else:

            return render(
                request,
                "accounts/login.html",
                {
                    "error": "Invalid username or password."
                }
            )

    return render(
        request,
        "accounts/login.html"
    )

def logout_view(request):
    logout(request)
    return redirect("login")

def register_view(request):

    if request.method == "POST":

        form = TenantRegistrationForm(request.POST)

        if form.is_valid():

            with transaction.atomic():
                tenant = Tenant.objects.create(
                    name=form.cleaned_data["tenant_name"],
                    email=form.cleaned_data["email"],
                )

                user = User.objects.create_user(
                    username=form.cleaned_data["username"],
                    email=form.cleaned_data["email"],
                    password=form.cleaned_data["password"],
                    role="tenant_admin",
                    tenant=tenant,
                )

            login(request, user)

            return redirect("dashboard")

    else:

        form = TenantRegistrationForm()

    return render(
        request,
        "accounts/register.html",
        {
            "form": form,
        }
    )


@login_required
def dashboard(request):

    user = request.user
    tenant = user.tenant

    events = (
        tenant.events
        .annotate(photo_count=Count("photos"))
        .order_by("-created_at")
    )

    total_events = events.count()

    active_events = events.filter(
        is_active=True
    ).count()

    total_photos = EventPhoto.objects.filter(
        event__tenant=tenant
    ).count()

    processing_photos = EventPhoto.objects.filter(
        event__tenant=tenant,
        processing_status="processing"
    ).count()

    context = {
        "user": user,
        "tenant": tenant,
        "events": events,

        "total_events": total_events,
        "active_events": active_events,
        "total_photos": total_photos,
        "processing_photos": processing_photos,
    }

    return render(
        request,
        "accounts/dashboard.html",
        context
    )

@login_required
def dashboard_stats(request):
    user = request.user
    tenant = user.tenant

    total_events = tenant.events.count()

    active_events = tenant.events.filter(
        is_active=True
    ).count()

    total_photos = EventPhoto.objects.filter(
        event__tenant=tenant
    ).count()

    processing_photos = EventPhoto.objects.filter(
        event__tenant=tenant,
        processing_status="processing"
    ).count()

    return JsonResponse({
        "total_events": total_events,
        "active_events": active_events,
        "total_photos": total_photos,
        "processing_photos": processing_photos,
    })