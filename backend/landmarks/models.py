"""Content model for the Tajikistan 3D experience.

Translated fields (marked "i18n" below) are registered in translation.py;
django-modeltranslation adds `<field>_tg`, `<field>_ru`, `<field>_en` columns.
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MaxValueValidator, MinValueValidator
from django.db import models

from . import geo


def validate_model_size(file) -> None:
    limit = settings.MAX_MODEL_UPLOAD_BYTES
    if file and file.size > limit:
        raise ValidationError(
            f"Model is {file.size / 1e6:.1f} MB; the limit is {limit / 1e6:.0f} MB. "
            "Compress it with gltf-transform (see README)."
        )


GLB_VALIDATORS = [FileExtensionValidator(["glb"]), validate_model_size]


class Placeholder(models.TextChoices):
    """Procedural stand-in models rendered by the frontend until a real GLB is uploaded."""

    FORTRESS = "fortress", "Fortress"
    SETTLEMENT = "settlement", "Ancient settlement"
    LAKE = "lake", "Mountain lake"
    LAKES = "lakes", "Chain of lakes"
    RESERVOIR = "reservoir", "Reservoir & dam"
    PEAK = "peak", "Mountain peak"
    ROAD = "road", "Mountain road"
    STUPA = "stupa", "Monastery / stupa"
    MONUMENT = "monument", "City & monument"


class Category(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=80)  # i18n
    color = models.CharField(max_length=7, default="#d4a64a", help_text="Marker accent colour, hex.")
    icon = models.CharField(max_length=32, blank=True, help_text="Icon key used by the frontend.")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "slug"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name or self.slug


class LandmarkQuerySet(models.QuerySet):
    def published(self) -> "LandmarkQuerySet":
        return self.filter(is_published=True)


class Landmark(models.Model):
    slug = models.SlugField(unique=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="landmarks")

    # --- Text (i18n) ---
    name = models.CharField(max_length=120)
    subtitle = models.CharField(max_length=160, blank=True, help_text="One poetic line under the title.")
    short_description = models.TextField(blank=True, help_text="1–2 sentences for cards and the map tooltip.")
    full_description = models.TextField(blank=True, help_text="The story. Blank lines separate paragraphs.")
    best_season = models.CharField(max_length=120, blank=True)
    how_to_get_there = models.TextField(blank=True)

    # --- Geography ---
    latitude = models.DecimalField(max_digits=9, decimal_places=6, validators=[MinValueValidator(-90), MaxValueValidator(90)])
    longitude = models.DecimalField(max_digits=9, decimal_places=6, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    elevation_m = models.IntegerField(default=0, help_text="Metres above sea level.")

    # --- 3D map placement (auto-calculated from lat/lon unless overridden) ---
    map_x = models.FloatField(default=0, editable=False)
    map_y = models.FloatField(default=0, editable=False)
    map_z = models.FloatField(default=0, editable=False)
    camera_override = models.BooleanField(
        default=False,
        help_text="Tick to use the camera values below instead of the automatic fly-to framing.",
    )
    camera_pos_x = models.FloatField(default=0)
    camera_pos_y = models.FloatField(default=0)
    camera_pos_z = models.FloatField(default=0)
    camera_target_x = models.FloatField(default=0)
    camera_target_y = models.FloatField(default=0)
    camera_target_z = models.FloatField(default=0)

    # --- 3D model ---
    model_file = models.FileField(
        upload_to="models/", blank=True, validators=GLB_VALIDATORS,
        help_text="GLB, Draco/meshopt compressed, ideally under 5 MB. Leave empty to show the placeholder.",
    )
    model_scale = models.FloatField(default=1.0, help_text="Uniform scale applied to the GLB in the detail view.")
    model_credit = models.CharField(max_length=200, blank=True, help_text="Author / licence of the 3D model.")
    placeholder = models.CharField(max_length=16, choices=Placeholder.choices, default=Placeholder.MONUMENT)

    poster = models.ImageField(upload_to="posters/", blank=True)
    poster_credit = models.CharField(max_length=200, blank=True)

    is_published = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0, help_text="Order on the map list and in story mode.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = LandmarkQuerySet.as_manager()

    class Meta:
        ordering = ["order", "slug"]

    def __str__(self) -> str:
        return self.name or self.slug

    def save(self, *args, **kwargs) -> None:
        point = geo.project(float(self.latitude), float(self.longitude), self.elevation_m)
        self.map_x, self.map_y, self.map_z = point.x, point.y, point.z
        if not self.camera_override:
            pos, target = geo.default_camera(point)
            self.camera_pos_x, self.camera_pos_y, self.camera_pos_z = pos.x, pos.y, pos.z
            self.camera_target_x, self.camera_target_y, self.camera_target_z = target.x, target.y, target.z
        super().save(*args, **kwargs)

    @property
    def missing_content(self) -> list[str]:
        """Translated text fields that are still empty, used by the admin checklist."""
        missing = []
        for field in ("short_description", "full_description", "best_season", "how_to_get_there"):
            for lang in settings.CONTENT_LANGUAGES:
                if not getattr(self, f"{field}_{lang}", ""):
                    missing.append(f"{field}_{lang}")
        return missing


class LandmarkImage(models.Model):
    landmark = models.ForeignKey(Landmark, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="gallery/")
    caption = models.CharField(max_length=200, blank=True)  # i18n
    credit = models.CharField(max_length=200, blank=True, help_text="Photographer / licence.")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.caption or f"Image #{self.pk}"


class Hotspot(models.Model):
    """A clickable annotation positioned in the landmark model's local space."""

    landmark = models.ForeignKey(Landmark, on_delete=models.CASCADE, related_name="hotspots")
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)
    z = models.FloatField(default=0)
    title = models.CharField(max_length=120)  # i18n
    text = models.TextField(blank=True)  # i18n
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.title


class LandmarkEra(models.Model):
    """One state of a site on the time slider ("then" vs "now")."""

    class Variant(models.TextChoices):
        RESTORED = "restored", "Restored / as built"
        RUINS = "ruins", "Ruins / today"

    landmark = models.ForeignKey(Landmark, on_delete=models.CASCADE, related_name="eras")
    label = models.CharField(max_length=80)  # i18n
    year = models.IntegerField(help_text="Negative numbers are BCE, e.g. -3500.")
    description = models.TextField(blank=True)  # i18n
    model_file = models.FileField(upload_to="models/eras/", blank=True, validators=GLB_VALIDATORS)
    placeholder_variant = models.CharField(max_length=10, choices=Variant.choices, default=Variant.RUINS)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "year"]

    def __str__(self) -> str:
        return f"{self.landmark} — {self.label}"
