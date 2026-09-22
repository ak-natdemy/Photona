from django.db import models
from tenants.models import Tenant
import uuid
import os


class Event(models.Model):

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="events"
    )

    name = models.CharField(
        max_length=200
    )

    description = models.TextField(
        null=True,
        blank=True
    )

    thumbnail = models.ImageField(
        upload_to="events/thumbnails/",
        null=True,
        blank=True
    )

    event_date = models.DateField(
        null=True,
        blank=True
    )

    public_token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False
    )

    is_active = models.BooleanField(
        default=True
    )

    AI_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("ready", "Ready"),
        ("failed", "Failed"),
    ]

    ai_status = models.CharField(
        max_length=20,
        choices=AI_STATUS_CHOICES,
        default="pending"
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

    @property
    def cover_url(self):
        if self.thumbnail:
            try:
                return self.thumbnail.url
            except Exception:
                pass
        latest_photo = self.photos.order_by("-uploaded_at").first()
        if latest_photo:
            return latest_photo.thumbnail_url
        return None

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

    thumbnail = models.ImageField(
        upload_to="events/thumbnails/%Y/%m/%d/",
        null=True,
        blank=True
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

    @property
    def thumbnail_url(self):
        if self.thumbnail:
            try:
                return self.thumbnail.url
            except Exception:
                pass
        if self.image:
            try:
                return self.image.url
            except Exception:
                pass
        return ""

    def generate_thumbnail(self):
        if not self.image:
            return False
        try:
            from PIL import Image, ImageOps
            import io
            from django.core.files.base import ContentFile

            if not os.path.exists(self.image.path):
                return False

            img = Image.open(self.image.path)
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            # High quality, lightweight 500x500 box preserving aspect ratio
            img.thumbnail((500, 500), Image.Resampling.LANCZOS)

            thumb_io = io.BytesIO()
            img.save(thumb_io, format="JPEG", quality=85, optimize=True)
            thumb_io.seek(0)

            base_name = os.path.basename(self.image.name)
            name, _ = os.path.splitext(base_name)
            thumb_name = f"thumb_{name}_{self.id or 'new'}.jpg"

            self.thumbnail.save(thumb_name, ContentFile(thumb_io.getvalue()), save=False)
            return True
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Error generating thumbnail for photo %s: %s", self.id, e)
            return False

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if (is_new or not self.thumbnail) and self.image:
            try:
                if self.generate_thumbnail():
                    super().save(update_fields=["thumbnail"])
            except Exception:
                pass

    def __str__(self):
        return f"{self.event.name} - {self.image.name}"
