from django.db import models

from tenants.models import Tenant


class Event(models.Model):

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="events"
    )

    name = models.CharField(
        max_length=200
    )

    event_date = models.DateField(
        null=True,
        blank=True
    )

    is_active = models.BooleanField(
        default=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    @property
    def ai_database_name(self):
        return f"event_{self.id}"

    def __str__(self):
        return self.name


class EventPhoto(models.Model):

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="photos"
    )

    image = models.ImageField(
        upload_to="events/%Y/%m/%d/"
    )

    uploaded_at = models.DateTimeField(
        auto_now_add=True
    )

    PROCESSING_STATUS = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    processing_status = models.CharField(
        max_length=20,
        choices=PROCESSING_STATUS,
        default="pending"
    )

    def __str__(self):
        return f"{self.event.name} - {self.image.name}"