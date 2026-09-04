from django.contrib.auth import authenticate, login
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect

from .forms import TenantRegistrationForm
from tenants.models import Tenant
from .models import User

def login_view(request):

    if request.method == "POST":

        username = request.POST.get("username")
        password = request.POST.get("password")

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

    return render(request,"accounts/login.html")

def register_view(request):

    if request.method == "POST":

        form = TenantRegistrationForm(
            request.POST
        )

        if form.is_valid():

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

            login(
                request,
                user
            )

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

    events = tenant.events.all().order_by("-created_at")

    return render(
        request,
        "accounts/dashboard.html",
        {
            "user": user,
            "tenant": tenant,
            "events": events,
        }
    )