from django import forms
from .models import User
from tenants.models import Tenant
from django.contrib.auth.password_validation import validate_password


class TenantRegistrationForm(forms.Form):

    username = forms.CharField(
        max_length=150,
        widget=forms.TextInput(
            attrs={
                "autocomplete": "off",
            }
        )
    )

    email = forms.EmailField(
        widget=forms.EmailInput(
            attrs={
                "autocomplete": "off",
            }
        )
    )

    password = forms.CharField(
        widget=forms.PasswordInput(
            attrs={
                "autocomplete": "new-password",
            }
        )
    )

    password_confirm = forms.CharField(
        widget=forms.PasswordInput(
            attrs={
                "autocomplete": "new-password",
            }
        )
    )

    tenant_name = forms.CharField(
        max_length=200,
        widget=forms.TextInput(
            attrs={
                "autocomplete": "off",
            }
        )
    )

    def clean_username(self):

        username = self.cleaned_data["username"]

        if User.objects.filter(username=username).exists():
            raise forms.ValidationError(
                "This username is already taken."
            )

        return username

    def clean_email(self):

        email = self.cleaned_data["email"]

        if User.objects.filter(email=email).exists():
            raise forms.ValidationError(
                "This email is already registered."
            )

        if Tenant.objects.filter(email=email).exists():
            raise forms.ValidationError(
                "This email is already associated with a business."
            )

        return email

    def clean(self):

        cleaned_data = super().clean()

        password = cleaned_data.get("password")
        password_confirm = cleaned_data.get("password_confirm")

        if password and password_confirm:

            if password != password_confirm:
                raise forms.ValidationError(
                    "Passwords do not match."
                )

            validate_password(password)

        return cleaned_data