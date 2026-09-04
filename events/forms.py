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


class EventCreateForm(forms.ModelForm):

    class Meta:

        model = Event

        fields = [
            "name",
            "event_date",
        ]