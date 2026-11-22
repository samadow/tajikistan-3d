"""Guided, scroll-driven tours across the map (Story mode)."""
from django.core.exceptions import ValidationError
from django.db import models

from apps.core.media import IMAGE_VALIDATORS, refresh_thumbnail


class Story(models.Model):
    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=160)  # i18n
    subtitle = models.CharField(max_length=200, blank=True)  # i18n
    intro = models.TextField(blank=True)  # i18n
    cover = models.ImageField(upload_to="stories/", blank=True, validators=IMAGE_VALIDATORS)
    cover_thumbnail = models.ImageField(upload_to="stories/thumbs/", blank=True, editable=False)
    is_published = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False, help_text="The tour that opens from 'Start the journey'.")
    order = models.PositiveSmallIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "slug"]
        verbose_name_plural = "stories"

    def __str__(self) -> str:
        return self.title or self.slug

    def save(self, *args, **kwargs) -> None:
        refresh_thumbnail(self, "cover", "cover_thumbnail", 900)
        super().save(*args, **kwargs)
        if self.is_default:
            Story.objects.exclude(pk=self.pk).filter(is_default=True).update(is_default=False)


class StoryStep(models.Model):
    """One stop of a tour: a landmark, or a free camera keyframe (e.g. an overview of a valley)."""

    story = models.ForeignKey(Story, on_delete=models.CASCADE, related_name="steps")
    order = models.PositiveSmallIntegerField(default=0)
    landmark = models.ForeignKey(
        "landmarks.Landmark", on_delete=models.CASCADE, null=True, blank=True, related_name="story_steps",
    )
    title = models.CharField(max_length=160, blank=True, help_text="Empty = the landmark's name.")  # i18n
    text = models.TextField(blank=True, help_text="Empty = the landmark's short description.")  # i18n
    image = models.ImageField(upload_to="stories/steps/", blank=True, validators=IMAGE_VALIDATORS)
    image_credit = models.CharField(max_length=200, blank=True)

    camera_override = models.BooleanField(default=False, help_text="Use the camera values below for this step.")
    camera_pos_x = models.FloatField(null=True, blank=True)
    camera_pos_y = models.FloatField(null=True, blank=True)
    camera_pos_z = models.FloatField(null=True, blank=True)
    camera_target_x = models.FloatField(null=True, blank=True)
    camera_target_y = models.FloatField(null=True, blank=True)
    camera_target_z = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.story} #{self.order}"

    CAMERA_FIELDS = (
        "camera_pos_x", "camera_pos_y", "camera_pos_z",
        "camera_target_x", "camera_target_y", "camera_target_z",
    )

    def clean(self) -> None:
        if not self.landmark_id and not self.camera_override:
            raise ValidationError("A step needs a landmark or its own camera keyframe.")
        if self.camera_override and any(getattr(self, f) is None for f in self.CAMERA_FIELDS):
            raise ValidationError("Fill in all six camera values or untick 'camera override'.")
        if not self.landmark_id and not self.title_tg and not self.title:
            raise ValidationError({"title": "A step without a landmark needs a title."})
