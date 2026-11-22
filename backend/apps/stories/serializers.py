from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.landmarks.serializers import CameraSerializer, LandmarkMapSerializer, file_url

from .models import Story, StoryStep


class StorySummarySerializer(serializers.ModelSerializer):
    cover = serializers.SerializerMethodField()
    step_count = serializers.SerializerMethodField()

    class Meta:
        model = Story
        fields = ("slug", "title", "subtitle", "cover", "is_default", "step_count")

    def get_cover(self, obj) -> str | None:
        return file_url(self, obj.cover_thumbnail or obj.cover)

    def get_step_count(self, obj) -> int:
        count = getattr(obj, "step_count", None)
        return count if count is not None else obj.steps.count()


class StoryStepSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    text = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    landmark = LandmarkMapSerializer(read_only=True)
    camera = serializers.SerializerMethodField()

    class Meta:
        model = StoryStep
        fields = ("id", "order", "title", "text", "image", "image_credit", "landmark", "camera")

    def get_title(self, obj) -> str:
        return obj.title or (obj.landmark.name if obj.landmark else "")

    def get_text(self, obj) -> str:
        return obj.text or (obj.landmark.short_description if obj.landmark else "")

    def get_image(self, obj) -> str | None:
        return file_url(self, obj.image)

    @extend_schema_field(CameraSerializer(allow_null=True))
    def get_camera(self, obj):
        """Explicit keyframe if set; otherwise the client frames the landmark itself."""
        if not obj.camera_override:
            return None
        return {
            "position": {"x": obj.camera_pos_x, "y": obj.camera_pos_y, "z": obj.camera_pos_z},
            "target": {"x": obj.camera_target_x, "y": obj.camera_target_y, "z": obj.camera_target_z},
        }


class StoryDetailSerializer(StorySummarySerializer):
    steps = serializers.SerializerMethodField()

    class Meta(StorySummarySerializer.Meta):
        fields = StorySummarySerializer.Meta.fields + ("intro", "steps")

    @extend_schema_field(StoryStepSerializer(many=True))
    def get_steps(self, obj):
        # Hide steps whose landmark has been unpublished.
        steps = [s for s in obj.steps.all() if s.landmark is None or s.landmark.is_published]
        return StoryStepSerializer(steps, many=True, context=self.context).data
