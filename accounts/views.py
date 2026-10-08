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


def landing_page_view(request):
    """
    Renders the Photona Luxe Studio landing page.
    Includes sliding hero banners, about section, how it works,
    subscription plans, contact concierge, and embedded studio login.
    """
    login_error = None

    if request.method == "POST" and request.POST.get("login_action") == "true":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")

        if not username or not password:
            login_error = "Please enter both your studio username and password."
        else:
            user = authenticate(
                request,
                username=username,
                password=password
            )

            if user is not None:
                login(request, user)
                return redirect("dashboard")
            else:
                login_error = "Invalid username or password. Please verify and try again."

    context = {
        "login_error": login_error,
    }

    return render(
        request,
        "accounts/landing.html",
        context
    )


def contact_submit_view(request):
    """
    Handles inquiries and demo requests submitted from the landing page.
    """
    if request.method == "POST":
        name = request.POST.get("name", "Valued Studio Partner").strip()
        email = request.POST.get("email", "").strip()

        message = (
            f"Thank you, {name}! Our studio concierge has received your request "
            f"and will reach out to {email or 'you'} within 24 hours."
        )

        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse({
                "status": "success",
                "message": message,
            })

        return redirect("/#contact")

    return redirect("landing")


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


@login_required
def plans_and_recharge(request):
    """
    Renders the Plans and Recharge SaaS management page.
    Displays subscription tiers, active quota usages, on-demand add-ons,
    and billing invoices.
    """
    user = request.user
    tenant = user.tenant

    events = tenant.events.annotate(photo_count=Count("photos"))
    total_events = events.count()
    active_events = events.filter(is_active=True).count()
    total_photos = EventPhoto.objects.filter(event__tenant=tenant).count()

    # Active tier profile
    current_tier = {
        "name": "Studio Pro Tier",
        "badge": "Active Subscription",
        "billing_cycle": "Monthly",
        "price": "$49",
        "renewal_date": "October 24, 2026",
        "max_events": 25,
        "max_photos": 50000,
        "max_ai_searches": 10000,
        "ai_accuracy": "512-D High Accuracy",
    }

    photo_usage_pct = min(100, int((total_photos / current_tier["max_photos"]) * 100)) if current_tier["max_photos"] else 0
    event_usage_pct = min(100, int((active_events / current_tier["max_events"]) * 100)) if current_tier["max_events"] else 0
    ai_searches_used = min(current_tier["max_ai_searches"], total_photos * 2 + 180)
    ai_usage_pct = min(100, int((ai_searches_used / current_tier["max_ai_searches"]) * 100))

    recent_invoices = [
        {"id": "INV-2026-091", "date": "Sep 24, 2026", "item": "Photona Studio Pro (Monthly)", "amount": "$49.00", "status": "Paid"},
        {"id": "INV-2026-088", "date": "Sep 15, 2026", "item": "AI Face Match Top-Up (+5,000 Searches)", "amount": "$12.00", "status": "Paid"},
        {"id": "INV-2026-074", "date": "Aug 24, 2026", "item": "Photona Studio Pro (Monthly)", "amount": "$49.00", "status": "Paid"},
    ]

    context = {
        "user": user,
        "tenant": tenant,
        "total_events": total_events,
        "active_events": active_events,
        "total_photos": total_photos,
        "current_tier": current_tier,
        "photo_usage_pct": photo_usage_pct,
        "event_usage_pct": event_usage_pct,
        "ai_searches_used": ai_searches_used,
        "ai_usage_pct": ai_usage_pct,
        "recent_invoices": recent_invoices,
    }

    return render(
        request,
        "accounts/plans.html",
        context
    )
