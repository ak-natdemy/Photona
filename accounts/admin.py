from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        (
            "Photona",
            {
                "fields": (
                    "role",
                    "tenant",
                )
            },
        ),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            "Photona",
            {
                "fields": (
                    "role",
                    "tenant",
                ),
            },
        ),
    )