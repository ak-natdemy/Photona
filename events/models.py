from django.db import models
from django.utils import timezone
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


class EventShareLink(models.Model):

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="share_links"
    )

    token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False
    )

    is_all_photos_accessible = models.BooleanField(
        default=False,
        help_text="If True, guests can directly see and download all photos without selfie search"
    )

    password = models.CharField(
        max_length=128,
        blank=True,
        null=True,
        help_text="Optional password to protect this link"
    )

    expires_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Optional expiration date and time"
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

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_expired(self):
        if self.expires_at:
            return timezone.now() > self.expires_at
        return False

    @property
    def share_type_label(self):
        return "Full Event Album" if self.is_all_photos_accessible else "AI Face Find Link"

    def __str__(self):
        return f"{self.event.name} - {self.share_type_label} ({self.token})"


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

    original_filename = models.CharField(
        max_length=255,
        blank=True,
        default="",
        db_index=True
    )

    file_size = models.BigIntegerField(
        default=0,
        db_index=True
    )

    file_hash = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True
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

    error_message = models.TextField(
        blank=True,
        default=""
    )

    retry_count = models.IntegerField(
        default=0
    )

    class Meta:
        indexes = [
            models.Index(fields=["event", "processing_status"]),
        ]

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

            self.thumbnail.save(thumb_name, ContentFile(thumb_io.getvalue()), save=True)
            return True
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Error generating thumbnail for photo %s: %s", self.id, e)
            return False

    def save(self, *args, **kwargs):
        generate_thumb = kwargs.pop("generate_thumb", False)
        if not self.original_filename and self.image:
            self.original_filename = os.path.basename(self.image.name)
        if not self.file_size and self.image:
            try:
                self.file_size = self.image.size
            except Exception:
                pass
        super().save(*args, **kwargs)
        if generate_thumb and not self.thumbnail and self.image:
            try:
                if self.generate_thumbnail():
                    super().save(update_fields=["thumbnail"])
            except Exception:
                pass

    def __str__(self):
        return f"{self.event.name} - {self.image.name}"


class EventPerson(models.Model):
    """
    Represents an individual person detected and grouped across event photos
    via facial recognition clustering.
    """

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="people"
    )

    name = models.CharField(
        max_length=100,
        default="Person"
    )

    avatar = models.ImageField(
        upload_to="events/people/%Y/%m/",
        null=True,
        blank=True
    )

    photos = models.ManyToManyField(
        EventPhoto,
        related_name="people",
        blank=True
    )

    face_count = models.IntegerField(
        default=0,
        help_text="Number of face instances detected for this person"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        ordering = ["-face_count", "id"]

    @property
    def avatar_url(self):
        if self.avatar:
            try:
                return self.avatar.url
            except Exception:
                pass
        cover = self.photos.first()
        if cover:
            return cover.thumbnail_url
        return ""

    @property
    def photo_count(self):
        return self.photos.count()

    def __str__(self):
        return f"{self.event.name} - {self.name} ({self.photo_count} photos)"



class PhotoUploadSession(models.Model):
    """
    Tracks an upload session for an event to support chunked,
    concurrent, idempotent, and resumable photo uploads.
    """
    STATUS_CHOICES = [
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    upload_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        db_index=True
    )

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="upload_sessions"
    )

    total_files = models.IntegerField(
        default=0
    )

    total_chunks = models.IntegerField(
        default=0
    )

    completed_chunks = models.IntegerField(
        default=0
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="in_progress"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"UploadSession {self.upload_id} - Event {self.event.name} ({self.completed_chunks}/{self.total_chunks})"


class PhotoUploadChunk(models.Model):
    """
    Tracks an individual uploaded chunk to guarantee idempotency on retries.
    """
    session = models.ForeignKey(
        PhotoUploadSession,
        on_delete=models.CASCADE,
        related_name="chunks"
    )

    chunk_index = models.IntegerField()

    file_count = models.IntegerField(
        default=0
    )

    status = models.CharField(
        max_length=20,
        default="completed"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        unique_together = ("session", "chunk_index")
        indexes = [
            models.Index(fields=["session", "chunk_index"]),
        ]

    def __str__(self):
        return f"Chunk {self.chunk_index} of Session {self.session.upload_id}"
