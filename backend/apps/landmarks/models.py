"""Content model for landmarks.

Translated fields (marked "i18n") are registered in translation.py;
django-modeltranslation adds ``<field>_tg``, ``<field>_ru``, ``<field>_en`` columns
(ADR-1 in ARCHITECTURE.md).
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from apps.core import geo
from apps.core.media import GLB_VALIDATORS, IMAGE_VALIDATORS, refresh_thumbnail


class Placeholder(models.TextChoices):
    """Procedural stand-ins rendered by the frontend until a real GLB is uploaded."""

    FORTRESS = "fortress", "Fortress"
    SETTLEMENT = "settlement", "Ancient settlement"
    LAKE = "lake", "Mountain lake"
    LAKES = "lakes", "Chain of lakes"
    RESERVOIR = "reservoir", "Reservoir & dam"
    PEAK = "peak", "Mountain peak"
    RANGE = "range", "Mountain range / park"
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


class HistoricalSource(models.Model):
    """A citable source. Linked from landmarks, eras and hotspots so every claim can be traced."""

    title = models.CharField(max_length=300)
    author = models.CharField(max_length=200, blank=True)
    publisher = models.CharField(max_length=200, blank=True, help_text="Publisher, journal or institution.")
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    url = models.URLField(blank=True)
    citation = models.TextField(blank=True, help_text="Full citation as it should appear on the site.")

    class Meta:
        ordering = ["author", "year", "title"]

    def __str__(self) -> str:
        bits = [self.author, str(self.year) if self.year else "", self.title]
        return " · ".join(b for b in bits if b)


class LandmarkQuerySet(models.QuerySet):
    def published(self) -> "LandmarkQuerySet":
        return self.filter(is_published=True)


class Landmark(models.Model):
    slug = models.SlugField(unique=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="landmarks")

    # --- Text (i18n) ---
    name = models.CharField(max_length=120)
    subtitle = models.CharField(max_length=160, blank=True, help_text="One line under the title.")
    short_description = models.TextField(blank=True, help_text="1–2 sentences for cards and the map tooltip.")
    full_description = models.TextField(blank=True, help_text="The story. Blank lines separate paragraphs.")
    history = models.TextField(blank=True, help_text="Historical information. Cite sources below.")
    best_season = models.CharField(max_length=120, blank=True)
    how_to_get_there = models.TextField(blank=True)

    # --- Geography ---
    latitude = models.DecimalField(max_digits=9, decimal_places=6, validators=[MinValueValidator(-90), MaxValueValidator(90)])
    longitude = models.DecimalField(max_digits=9, decimal_places=6, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    elevation_m = models.IntegerField(default=0, help_text="Metres above sea level.")
    coordinates_source = models.CharField(
        max_length=200, blank=True,
        help_text="Where the coordinates were verified, e.g. 'Wikidata Q2478596' or an OSM URL.",
    )
    area_geojson = models.JSONField(
        null=True, blank=True,
        help_text="Optional outline for areas (parks, ranges): a GeoJSON Polygon/MultiPolygon in lon/lat.",
    )

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

    # --- 3D stage ---
    model_scale = models.FloatField(default=1.0, help_text="Uniform scale applied to uploaded models on the stage.")
    placeholder = models.CharField(max_length=16, choices=Placeholder.choices, default=Placeholder.MONUMENT)

    # --- Media ---
    poster = models.ImageField(upload_to="posters/", blank=True, validators=IMAGE_VALIDATORS)
    poster_thumbnail = models.ImageField(upload_to="posters/thumbs/", blank=True, editable=False)
    poster_credit = models.CharField(max_length=200, blank=True)

    sources = models.ManyToManyField(HistoricalSource, blank=True, related_name="landmarks")

    is_published = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False, help_text="Shown in highlights on the home screen.")
    order = models.PositiveSmallIntegerField(default=0, help_text="Order on the map list.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = LandmarkQuerySet.as_manager()

    class Meta:
        ordering = ["order", "slug"]
        indexes = [models.Index(fields=["is_published", "order"])]

    def __str__(self) -> str:
        return self.name or self.slug

    def clean(self) -> None:
        if self.latitude is not None and self.longitude is not None:
            if not geo.in_bounds(float(self.latitude), float(self.longitude)):
                raise ValidationError("Coordinates are outside the map area (Tajikistan and its surroundings).")
        if self.area_geojson:
            kind = self.area_geojson.get("type") if isinstance(self.area_geojson, dict) else None
            if kind not in ("Polygon", "MultiPolygon"):
                raise ValidationError({"area_geojson": "Must be a GeoJSON Polygon or MultiPolygon geometry."})

    def save(self, *args, **kwargs) -> None:
        point = geo.project(float(self.latitude), float(self.longitude), self.elevation_m)
        self.map_x, self.map_y, self.map_z = point.x, point.y, point.z
        if not self.camera_override:
            pos, target = geo.default_camera(point)
            self.camera_pos_x, self.camera_pos_y, self.camera_pos_z = pos.x, pos.y, pos.z
            self.camera_target_x, self.camera_target_y, self.camera_target_z = target.x, target.y, target.z
        refresh_thumbnail(self, "poster", "poster_thumbnail", 800)
        super().save(*args, **kwargs)

    TRANSLATED_TEXT = ("subtitle", "short_description", "full_description", "history", "best_season", "how_to_get_there")

    @property
    def missing_content(self) -> list[str]:
        """Translated text fields that are still empty (admin checklist)."""
        return [
            f"{field}_{lang}"
            for field in ("name", *self.TRANSLATED_TEXT)
            for lang in settings.CONTENT_LANGUAGES
            if not getattr(self, f"{field}_{lang}", "")
        ]


class LandmarkImage(models.Model):
    landmark = models.ForeignKey(Landmark, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="gallery/", validators=IMAGE_VALIDATORS)
    thumbnail = models.ImageField(upload_to="gallery/thumbs/", blank=True, editable=False)
    caption = models.CharField(max_length=200, blank=True)  # i18n
    credit = models.CharField(max_length=200, blank=True, help_text="Photographer.")
    license = models.CharField(max_length=120, blank=True, help_text="e.g. CC BY-SA 4.0, own photo.")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.caption or f"Image #{self.pk}"

    def save(self, *args, **kwargs) -> None:
        refresh_thumbnail(self, "image", "thumbnail", 640)
        super().save(*args, **kwargs)


class Era(models.Model):
    """A historical period of a site on the time slider (negative years = BCE)."""

    class Variant(models.TextChoices):
        RESTORED = "restored", "Restored / as built"
        RUINS = "ruins", "Ruins / today"

    landmark = models.ForeignKey(Landmark, on_delete=models.CASCADE, related_name="eras")
    label = models.CharField(max_length=80)  # i18n
    year = models.IntegerField(help_text="Negative numbers are BCE, e.g. -3500.")
    year_end = models.IntegerField(null=True, blank=True, help_text="Optional end of the period.")
    year_is_approximate = models.BooleanField(default=True, help_text="Shown with '≈'.")
    description = models.TextField(blank=True)  # i18n
    placeholder_variant = models.CharField(max_length=10, choices=Variant.choices, default=Variant.RUINS)
    sources = models.ManyToManyField(HistoricalSource, blank=True, related_name="eras")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "year"]

    def __str__(self) -> str:
        return f"{self.landmark} — {self.label}"

    def clean(self) -> None:
        if self.year_end is not None and self.year_end < self.year:
            raise ValidationError({"year_end": "The end year must not be before the start year."})


class LandmarkModel(models.Model):
    """An uploaded GLB for a landmark (optionally for one era), at one level of detail."""

    class Lod(models.TextChoices):
        HIGH = "high", "High (desktop)"
        MEDIUM = "medium", "Medium (laptops, tablets)"
        LOW = "low", "Low (phones)"

    landmark = models.ForeignKey(Landmark, on_delete=models.CASCADE, related_name="models")
    era = models.ForeignKey(
        Era, on_delete=models.CASCADE, null=True, blank=True, related_name="models",
        help_text="Leave empty for the landmark's main model.",
    )
    lod = models.CharField(max_length=6, choices=Lod.choices, default=Lod.HIGH)
    file = models.FileField(upload_to="models/", validators=GLB_VALIDATORS)
    size_bytes = models.PositiveIntegerField(default=0, editable=False)
    is_illustrative = models.BooleanField(
        default=True,
        help_text="Artistic/illustrative reconstruction (not a survey-accurate scan). Shown as a badge.",
    )
    credit = models.CharField(max_length=200, blank=True, help_text="Author of the 3D model.")
    license = models.CharField(max_length=120, blank=True, help_text="e.g. CC BY 4.0, own work.")

    class Meta:
        ordering = ["era__order", "lod"]
        constraints = [
            models.UniqueConstraint(fields=["landmark", "lod"], condition=Q(era__isnull=True), name="unique_main_model_per_lod"),
            models.UniqueConstraint(fields=["landmark", "era", "lod"], condition=Q(era__isnull=False), name="unique_era_model_per_lod"),
        ]
        verbose_name = "3D model"

    def __str__(self) -> str:
        era = f" — {self.era.label}" if self.era_id else ""
        return f"{self.landmark}{era} ({self.lod})"

    def clean(self) -> None:
        if self.era_id and self.landmark_id and self.era.landmark_id != self.landmark_id:
            raise ValidationError({"era": "This era belongs to another landmark."})

    def save(self, *args, **kwargs) -> None:
        if self.file:
            try:
                self.size_bytes = self.file.size
            except (OSError, ValueError):
                pass
        super().save(*args, **kwargs)


class Hotspot(models.Model):
    """A clickable annotation, positioned in the model's own coordinate space (as in Blender)."""

    landmark = models.ForeignKey(Landmark, on_delete=models.CASCADE, related_name="hotspots")
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)
    z = models.FloatField(default=0)
    title = models.CharField(max_length=120)  # i18n
    text = models.TextField(blank=True)  # i18n
    history = models.TextField(blank=True, help_text="Optional historical note. Cite sources.")  # i18n
    image = models.ImageField(upload_to="hotspots/", blank=True, validators=IMAGE_VALIDATORS)
    image_credit = models.CharField(max_length=200, blank=True)
    focus_distance = models.FloatField(
        null=True, blank=True,
        help_text="Camera distance when focusing on this point (stage units). Empty = automatic.",
    )
    sources = models.ManyToManyField(HistoricalSource, blank=True, related_name="hotspots")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.title
