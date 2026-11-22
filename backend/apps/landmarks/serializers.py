"""Serializers. Translated fields resolve to the language activated by the view
(django-modeltranslation falls back tg → ru → en when a translation is empty)."""
from __future__ import annotations

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Category, Era, HistoricalSource, Hotspot, Landmark, LandmarkImage, LandmarkModel


def file_url(serializer: serializers.Serializer, file) -> str | None:
    if not file:
        return None
    request = serializer.context.get("request")
    return request.build_absolute_uri(file.url) if request else file.url


class Vec3Serializer(serializers.Serializer):
    x = serializers.FloatField()
    y = serializers.FloatField()
    z = serializers.FloatField()


class CameraSerializer(serializers.Serializer):
    position = Vec3Serializer()
    target = Vec3Serializer()


class CategorySerializer(serializers.ModelSerializer):
    landmark_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ("slug", "name", "color", "icon", "order", "landmark_count")


class CategoryRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("slug", "name", "color")


class HistoricalSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = HistoricalSource
        fields = ("id", "title", "author", "publisher", "year", "url", "citation")


class LandmarkModelSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = LandmarkModel
        fields = ("id", "lod", "url", "size_bytes", "is_illustrative", "credit", "license")

    def get_url(self, obj) -> str | None:
        return file_url(self, obj.file)


class _LandmarkBase(serializers.ModelSerializer):
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    has_model = serializers.SerializerMethodField()

    def get_has_model(self, obj) -> bool:
        annotated = getattr(obj, "has_model", None)
        if annotated is not None:
            return bool(annotated)
        return obj.models.filter(era__isnull=True).exists()


class LandmarkMapSerializer(_LandmarkBase):
    """Lightweight marker payload: everything the 3D map needs, nothing more."""

    category = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    position = serializers.SerializerMethodField()
    camera = serializers.SerializerMethodField()

    class Meta:
        model = Landmark
        fields = (
            "slug", "name", "subtitle", "category", "latitude", "longitude", "elevation_m",
            "position", "camera", "placeholder", "has_model", "is_featured", "order", "area_geojson",
        )

    @extend_schema_field(Vec3Serializer)
    def get_position(self, obj):
        return {"x": obj.map_x, "y": obj.map_y, "z": obj.map_z}

    @extend_schema_field(CameraSerializer)
    def get_camera(self, obj):
        return {
            "position": {"x": obj.camera_pos_x, "y": obj.camera_pos_y, "z": obj.camera_pos_z},
            "target": {"x": obj.camera_target_x, "y": obj.camera_target_y, "z": obj.camera_target_z},
        }


class LandmarkCardSerializer(_LandmarkBase):
    """Catalogue / search / featured / nearby cards."""

    category = CategoryRefSerializer(read_only=True)
    thumbnail = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()

    class Meta:
        model = Landmark
        fields = (
            "slug", "name", "subtitle", "short_description", "category", "thumbnail",
            "latitude", "longitude", "elevation_m", "is_featured", "has_model", "distance_km",
        )

    def get_thumbnail(self, obj) -> str | None:
        return file_url(self, obj.poster_thumbnail or obj.poster)

    @extend_schema_field(OpenApiTypes.FLOAT)
    def get_distance_km(self, obj):
        distance = getattr(obj, "distance_km", None)
        return round(distance, 1) if distance is not None else None


class LandmarkImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    thumbnail = serializers.SerializerMethodField()
    width = serializers.SerializerMethodField()
    height = serializers.SerializerMethodField()

    class Meta:
        model = LandmarkImage
        fields = ("id", "image", "thumbnail", "caption", "credit", "license", "width", "height")

    def get_image(self, obj) -> str | None:
        return file_url(self, obj.image)

    def get_thumbnail(self, obj) -> str | None:
        return file_url(self, obj.thumbnail or obj.image)

    def _dimension(self, obj, attr):
        try:
            return getattr(obj.image, attr)
        except (OSError, ValueError):  # file missing on disk
            return None

    def get_width(self, obj) -> int | None:
        return self._dimension(obj, "width")

    def get_height(self, obj) -> int | None:
        return self._dimension(obj, "height")


class HotspotSerializer(serializers.ModelSerializer):
    position = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    sources = HistoricalSourceSerializer(many=True, read_only=True)

    class Meta:
        model = Hotspot
        fields = ("id", "title", "text", "history", "image", "image_credit", "position", "focus_distance", "sources")

    @extend_schema_field(Vec3Serializer)
    def get_position(self, obj):
        return {"x": obj.x, "y": obj.y, "z": obj.z}

    def get_image(self, obj) -> str | None:
        return file_url(self, obj.image)


class EraSerializer(serializers.ModelSerializer):
    models = LandmarkModelSerializer(many=True, read_only=True)
    sources = HistoricalSourceSerializer(many=True, read_only=True)

    class Meta:
        model = Era
        fields = (
            "id", "label", "year", "year_end", "year_is_approximate", "description",
            "placeholder_variant", "models", "sources",
        )


class EraTimelineSerializer(serializers.ModelSerializer):
    """Eras across all sites for the History page."""

    landmark = serializers.SerializerMethodField()
    has_model = serializers.SerializerMethodField()

    class Meta:
        model = Era
        fields = ("id", "label", "year", "year_end", "year_is_approximate", "description", "landmark", "has_model")

    @extend_schema_field(
        {"type": "object", "properties": {"slug": {"type": "string"}, "name": {"type": "string"}, "category": {"type": "string"}}}
    )
    def get_landmark(self, obj):
        return {"slug": obj.landmark.slug, "name": obj.landmark.name, "category": obj.landmark.category.slug}

    def get_has_model(self, obj) -> bool:
        return bool(obj.models.all())


class LandmarkDetailSerializer(LandmarkMapSerializer):
    category = CategoryRefSerializer(read_only=True)
    poster = serializers.SerializerMethodField()
    poster_thumbnail = serializers.SerializerMethodField()
    models = serializers.SerializerMethodField()
    images = LandmarkImageSerializer(many=True, read_only=True)
    hotspots = HotspotSerializer(many=True, read_only=True)
    eras = EraSerializer(many=True, read_only=True)
    sources = HistoricalSourceSerializer(many=True, read_only=True)

    class Meta(LandmarkMapSerializer.Meta):
        fields = LandmarkMapSerializer.Meta.fields + (
            "short_description", "full_description", "history", "best_season", "how_to_get_there",
            "coordinates_source", "model_scale", "poster", "poster_thumbnail", "poster_credit",
            "models", "images", "hotspots", "eras", "sources", "updated_at",
        )

    def get_poster(self, obj) -> str | None:
        return file_url(self, obj.poster)

    def get_poster_thumbnail(self, obj) -> str | None:
        return file_url(self, obj.poster_thumbnail or obj.poster)

    @extend_schema_field(LandmarkModelSerializer(many=True))
    def get_models(self, obj):
        main = [m for m in obj.models.all() if m.era_id is None]
        return LandmarkModelSerializer(main, many=True, context=self.context).data


class NearbyQuerySerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    radius_km = serializers.FloatField(min_value=0.1, max_value=1000, default=50)
    limit = serializers.IntegerField(min_value=1, max_value=50, default=10)
    exclude = serializers.SlugField(required=False)
