from django import forms
from .models import Event


import os


class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True

    def value_from_datadict(self, data, files, name):
        if hasattr(files, "getlist"):
            return files.getlist(name)
        return files.get(name)


class MultipleFileField(forms.FileField):
    widget = MultipleFileInput

    def clean(self, data, initial=None):
        single_file_clean = super().clean

        if isinstance(data, (list, tuple)):
            return [
                single_file_clean(file, initial)
                for file in data
            ]

        return [
            single_file_clean(data, initial)
        ]


class EventPhotoUploadForm(forms.Form):
    images = MultipleFileField(
        label="Select photos",
        required=False,
    )
    photos = MultipleFileField(
        label="Select photos",
        required=False,
    )

    def clean(self):
        cleaned_data = super().clean()
        images = cleaned_data.get("images") or []
        photos = cleaned_data.get("photos") or []
        all_files = list(images) if images else list(photos)

        # Deduplicate files within the submitted batch
        unique_files = []
        seen_keys = set()
        for f in all_files:
            key = (getattr(f, "name", "").lower(), getattr(f, "size", 0))
            if key not in seen_keys:
                seen_keys.add(key)
                unique_files.append(f)
        all_files = unique_files

        if not all_files:
            raise forms.ValidationError(
                "Please select at least one photo to upload."
            )

        allowed_types = [
            "image/jpeg",
            "image/pjpeg",
            "image/png",
            "image/webp",
            "image/bmp",
        ]
        max_file_size = 20 * 1024 * 1024  # 20 MB

        for uploaded_file in all_files:
            if uploaded_file.size > max_file_size:
                raise forms.ValidationError(
                    f"{uploaded_file.name} is too large. "
                    "Each photo must be 20 MB or smaller."
                )

            ext = os.path.splitext(uploaded_file.name)[1].lower()
            if (
                uploaded_file.content_type not in allowed_types
                and ext not in [".jpg", ".jpeg", ".png", ".webp", ".bmp"]
            ):
                raise forms.ValidationError(
                    f"{uploaded_file.name} is not a supported image format. "
                    "Please upload JPG, JPEG, PNG, or WebP images."
                )

        cleaned_data["cleaned_photos"] = all_files
        return cleaned_data


class EventCreateForm(forms.ModelForm):
    description = forms.CharField(
        required=False,
        widget=forms.Textarea(
            attrs={
                "class": "form-input form-textarea",
                "placeholder": "Briefly describe the occasion, venue, or notes...",
                "rows": 3,
                "id": "id_description",
            }
        )
    )
    event_date = forms.DateField(
        required=False,
        widget=forms.DateInput(
            attrs={
                "class": "form-input",
                "type": "date",
                "id": "id_event_date",
            }
        )
    )
    thumbnail = forms.ImageField(
        required=False,
        widget=forms.FileInput(
            attrs={
                "class": "form-input form-file-input",
                "accept": "image/jpeg,image/png,image/webp",
                "id": "id_thumbnail",
            }
        )
    )
    photos = MultipleFileField(
        required=False,
        label="Event Photos (Optional)"
    )

    class Meta:
        model = Event
        fields = [
            "name",
            "description",
            "event_date",
            "thumbnail",
        ]
        widgets = {
            "name": forms.TextInput(
                attrs={
                    "class": "form-input",
                    "placeholder": "e.g. Annual Gala 2026",
                    "autocomplete": "off",
                    "required": True,
                    "id": "id_name",
                }
            ),
        }

    def clean_name(self):
        name = self.cleaned_data["name"].strip()
        if not name:
            raise forms.ValidationError("Event name cannot be empty.")
        return name

    def clean_photos(self):
        uploaded_files = self.cleaned_data.get("photos")
        if not uploaded_files:
            return []

        allowed_types = [
            "image/jpeg",
            "image/png",
            "image/webp",
        ]
        max_file_size = 20 * 1024 * 1024  # 20 MB

        for uploaded_file in uploaded_files:
            if uploaded_file.size > max_file_size:
                raise forms.ValidationError(
                    f"{uploaded_file.name} is too large. Each photo must be 20 MB or smaller."
                )
            if uploaded_file.content_type not in allowed_types:
                raise forms.ValidationError(
                    f"{uploaded_file.name} is not a supported image format. Please upload JPG, PNG, or WebP images."
                )

        return uploaded_files


class EventUpdateForm(forms.ModelForm):
    description = forms.CharField(
        required=False,
        widget=forms.Textarea(
            attrs={
                "class": "form-input form-textarea",
                "rows": 3,
                "id": "edit_event_desc",
                "placeholder": "Brief details or notes...",
            }
        )
    )
    event_date = forms.DateField(
        required=False,
        widget=forms.DateInput(
            attrs={
                "class": "form-input",
                "type": "date",
                "id": "edit_event_date",
            }
        )
    )
    thumbnail = forms.ImageField(
        required=False,
        widget=forms.FileInput(
            attrs={
                "class": "form-input form-file-input",
                "accept": "image/jpeg,image/png,image/webp",
                "id": "edit_event_thumb",
            }
        )
    )

    class Meta:
        model = Event
        fields = [
            "name",
            "description",
            "event_date",
            "thumbnail",
        ]
        widgets = {
            "name": forms.TextInput(
                attrs={
                    "class": "form-input",
                    "required": True,
                    "id": "edit_event_name",
                }
            ),
        }

    def clean_name(self):
        name = self.cleaned_data.get("name", "").strip()
        if not name:
            raise forms.ValidationError("Event name cannot be empty.")
        return name


class SelfieSearchForm(forms.Form):
    selfie = forms.ImageField(
        label="Upload your selfie",
        required=True
    )
