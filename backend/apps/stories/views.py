from django.db.models import Count, Prefetch
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import viewsets

from apps.core.views_base import LANG_PARAMETER, PublicReadOnlyMixin

from .models import Story, StoryStep
from .serializers import StoryDetailSerializer, StorySummarySerializer


@extend_schema_view(
    list=extend_schema(summary="Published stories", parameters=[LANG_PARAMETER]),
    retrieve=extend_schema(summary="A story with its steps", parameters=[LANG_PARAMETER]),
)
class StoryViewSet(PublicReadOnlyMixin, viewsets.ReadOnlyModelViewSet):
    lookup_field = "slug"
    pagination_class = None

    def get_queryset(self):
        qs = Story.objects.filter(is_published=True)
        if self.action == "retrieve":
            return qs.prefetch_related(
                Prefetch("steps", queryset=StoryStep.objects.select_related("landmark__category").order_by("order", "id"))
            )
        return qs.annotate(step_count=Count("steps"))

    def get_serializer_class(self):
        return StoryDetailSerializer if self.action == "retrieve" else StorySummarySerializer
