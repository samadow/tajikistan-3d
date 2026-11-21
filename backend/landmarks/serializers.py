"""Serializers. Translated fields resolve to the language activated by the view
(django-modeltranslation falls back tg -> ru -> en when a translation is empty)."""
from rest_framework import serializers

from .models import Category, Hotspot, Landmark, LandmarkEra, LandmarkImage


def absolute_file_url(serializer: serializers.Serializer, file) -> str | None:
    if not file:
        return None
    request = serializer.context.get("request")
    return request.build_absolute_uri(file.url) if request else file.url


class CategorySerializer(serializers.ModelSerializer):
    landmark_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ("slug", "name", "color", "icon", "order", "landmark_count")


class Vec3Field(serializers.Field):
    """Serialises three float attributes as {x, y, z}."""

    def __init__(self, prefix: str, **kwargs):
        self.prefix = prefix
        kwargs["source"] = "*"
        kwargs["read_only"] = True
        super().__init__(**kwargs)

    def to_representation(self, obj):
        p = self.prefix
        return {
            "x": getattr(obj, f"{p}x"),
            "y": getattr(obj, f"{p}y"),
            "z": getattr(obj, f"{p}z"),
        }


class LandmarkListSerializer(serializers.ModelSerializer):
    """Light payload for the map: everything needed to draw markers and cards."""

    category = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    position = Vec3Field("map_")
    camera = serializers.SerializerMethodField()
    poster = serializers.SerializerMethodField()
    model_url = serializers.SerializerMethodField()
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()

    class Meta:
        model = Landmark
        fields = (
            "slug", "name", "subtitle", "short_description", "category",
            "latitude", "longitude", "elevation_m", "position", "camera",
            "poster", "model_url", "placeholder", "order",
        )

    def get_camera(self, obj: Landmark) -> dict:
        return {
            "position": {"x": obj.camera_pos_x, "y": obj.camera_pos_y, "z": obj.camera_pos_z},
            "target": {"x": obj.camera_target_x, "y": obj.camera_target_y, "z": obj.camera_target_z},
        }

    def get_poster(self, obj: Landmark) -> str | None:
        return absolute_file_url(self, obj.poster)

    def get_model_url(self, obj: Landmark) -> str | None:
        return absolute_file_url(self, obj.model_file)


class LandmarkImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    width = serializers.SerializerMethodField()
    height = serializers.SerializerMethodField()

    class Meta:
        model = LandmarkImage
        fields = ("id", "image", "caption", "credit", "width", "height")

    def get_image(self, obj):
        return absolute_file_url(self, obj.image)

    def _dimension(self, obj, attr):
        try:
            return getattr(obj.image, attr)
        except (OSError, ValueError):  # missing file on disk
            return None

    def get_width(self, obj):
        return self._dimension(obj, "width")

    def get_height(self, obj):
        return self._dimension(obj, "height")


class HotspotSerializer(serializers.ModelSerializer):
    position = Vec3Field("")

    class Meta:
        model = Hotspot
        fields = ("id", "title", "text", "position")


class LandmarkEraSerializer(serializers.ModelSerializer):
    model_url = serializers.SerializerMethodField()

    class Meta:
        model = LandmarkEra
        fields = ("id", "label", "year", "description", "model_url", "placeholder_variant")

    def get_model_url(self, obj):
        return absolute_file_url(self, obj.model_file)


class LandmarkDetailSerializer(LandmarkListSerializer):
    images = LandmarkImageSerializer(many=True, read_only=True)
    hotspots = HotspotSerializer(many=True, read_only=True)
    eras = LandmarkEraSerializer(many=True, read_only=True)
    category = CategorySerializer(read_only=True)

    class Meta(LandmarkListSerializer.Meta):
        fields = LandmarkListSerializer.Meta.fields + (
            "full_description", "best_season", "how_to_get_there",
            "model_scale", "model_credit", "poster_credit",
            "images", "hotspots", "eras", "updated_at",
        )
