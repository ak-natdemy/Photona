from django import forms
from .models import Event


class MultipleFileInput(forms.ClearableFileInput):

    allow_multiple_selected = True


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
        required=True,
    )

    def clean_images(self):

        uploaded_files = self.cleaned_data["images"]

        allowed_types = [
            "image/jpeg",
            "image/png",
            "image/webp",
        ]

        max_file_size = 20 * 1024 * 1024  # 20 MB

        for uploaded_file in uploaded_files:

            # Check file size
            if uploaded_file.size > max_file_size:

                raise forms.ValidationError(
                    f"{uploaded_file.name} is too large. "
                    "Each photo must be 20 MB or smaller."
                )

            # Check MIME type
            if uploaded_file.content_type not in allowed_types:

                raise forms.ValidationError(
                    f"{uploaded_file.name} is not a supported image format. "
                    "Please upload JPG, JPEG, PNG, or WebP images."
                )

        return uploaded_files


class EventCreateForm(forms.ModelForm):

    class Meta:

        model = Event

        fields = [
            "name",
            "event_date",
        ]

    def clean_name(self):

        name = self.cleaned_data["name"].strip()

        if not name:

            raise forms.ValidationError(
                "Event name cannot be empty."
            )

        return name


class SelfieSearchForm(forms.Form):

    selfie = forms.ImageField(
        label="Upload your selfie",
        required=True
    )