"""Read-only public landmark API (v1)."""
from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response

from apps.core import geo
from apps.core.views_base import LANG_PARAMETER, PublicReadOnlyMixin, StandardPagination

from .models import Category, Era, Landmark, LandmarkModel
from .serializers import (
    CategorySerializer,
    EraSerializer,
    EraTimelineSerializer,
    LandmarkCardSerializer,
    LandmarkDetailSerializer,
    LandmarkMapSerializer,
    NearbyQuerySerializer,
)

LANGS = ("tg", "ru", "en")


class LandmarkFilter(filters.FilterSet):
    category = filters.CharFilter(field_name="category__slug")
    featured = filters.BooleanFilter(field_name="is_featured")

    class Meta:
        model = Landmark
        fields = ("category", "featured")


def _with_has_model(qs):
    return qs.annotate(has_model=Exists(LandmarkModel.objects.filter(landmark=OuterRef("pk"), era__isnull=True)))


@extend_schema_view(
    list=extend_schema(summary="Catalogue of landmarks (paginated, searchable)", parameters=[LANG_PARAMETER]),
    retrieve=extend_schema(summary="Full landmark", parameters=[LANG_PARAMETER]),
)
class LandmarkViewSet(PublicReadOnlyMixin, viewsets.ReadOnlyModelViewSet):
    lookup_field = "slug"
    filterset_class = LandmarkFilter
    filter_backends = [filters.DjangoFilterBackend, SearchFilter]
    search_fields = [f"{field}_{lang}" for field in ("name", "subtitle", "short_description") for lang in LANGS]
    pagination_class = StandardPagination

    def get_queryset(self):
        qs = Landmark.objects.published().select_related("category")
        if self.action == "retrieve":
            return qs.prefetch_related(
                "images",
                "sources",
                Prefetch("models", queryset=LandmarkModel.objects.select_related("era")),
                "hotspots__sources",
                Prefetch("eras", queryset=Era.objects.order_by("order", "year").prefetch_related("models", "sources")),
            )
        return _with_has_model(qs)

    def get_serializer_class(self):
        if self.action == "retrieve":
            return LandmarkDetailSerializer
        if self.action == "map":
            return LandmarkMapSerializer
        return LandmarkCardSerializer

    @extend_schema(summary="Lightweight markers for the 3D map (unpaginated)", parameters=[LANG_PARAMETER])
    @action(detail=False, pagination_class=None)
    def map(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return Response(self.get_serializer(qs, many=True).data)

    @extend_schema(summary="Featured landmarks", parameters=[LANG_PARAMETER])
    @action(detail=False, pagination_class=None)
    def featured(self, request):
        qs = self.get_queryset().filter(is_featured=True)
        return Response(self.get_serializer(qs, many=True).data)

    @extend_schema(
        summary="Landmarks near a point, closest first",
        parameters=[
            LANG_PARAMETER,
            OpenApiParameter("lat", OpenApiTypes.FLOAT, required=True),
            OpenApiParameter("lon", OpenApiTypes.FLOAT, required=True),
            OpenApiParameter("radius_km", OpenApiTypes.FLOAT, description="Default 50, max 1000"),
            OpenApiParameter("limit", OpenApiTypes.INT, description="Default 10, max 50"),
            OpenApiParameter("exclude", OpenApiTypes.STR, description="Slug to leave out (e.g. the current landmark)"),
        ],
    )
    @action(detail=False, pagination_class=None)
    def nearby(self, request):
        params = NearbyQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        p = params.validated_data
        qs = self.get_queryset()
        if p.get("exclude"):
            qs = qs.exclude(slug=p["exclude"])
        # Haversine in Python: published landmarks number in the hundreds at most (ADR-7).
        results = []
        for landmark in qs:
            distance = geo.haversine_km(p["lat"], p["lon"], float(landmark.latitude), float(landmark.longitude))
            if distance <= p["radius_km"]:
                landmark.distance_km = distance
                results.append(landmark)
        results.sort(key=lambda lm: lm.distance_km)
        return Response(self.get_serializer(results[: p["limit"]], many=True).data)

    @extend_schema(summary="Historical eras of a landmark", parameters=[LANG_PARAMETER], responses=EraSerializer(many=True))
    @action(detail=True, pagination_class=None)
    def eras(self, request, slug=None):
        landmark = self.get_object()
        eras = landmark.eras.order_by("order", "year").prefetch_related("models", "sources")
        return Response(EraSerializer(eras, many=True, context=self.get_serializer_context()).data)

    @extend_schema(summary="Published stories that visit this landmark", parameters=[LANG_PARAMETER])
    @action(detail=True, pagination_class=None)
    def stories(self, request, slug=None):
        from apps.stories.serializers import StorySummarySerializer
        from apps.stories.models import Story

        landmark = self.get_object()
        stories = Story.objects.filter(is_published=True, steps__landmark=landmark).distinct()
        return Response(StorySummarySerializer(stories, many=True, context=self.get_serializer_context()).data)


@extend_schema_view(list=extend_schema(parameters=[LANG_PARAMETER]), retrieve=extend_schema(parameters=[LANG_PARAMETER]))
class CategoryViewSet(PublicReadOnlyMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = CategorySerializer
    lookup_field = "slug"
    pagination_class = None

    def get_queryset(self):
        return Category.objects.annotate(landmark_count=Count("landmarks", filter=Q(landmarks__is_published=True)))


class EraFilter(filters.FilterSet):
    landmark = filters.CharFilter(field_name="landmark__slug")

    class Meta:
        model = Era
        fields = ("landmark",)


@extend_schema_view(
    list=extend_schema(summary="Timeline of eras across all sites, oldest first", parameters=[LANG_PARAMETER]),
    retrieve=extend_schema(parameters=[LANG_PARAMETER]),
)
class EraViewSet(PublicReadOnlyMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = EraTimelineSerializer
    filterset_class = EraFilter
    pagination_class = None

    def get_queryset(self):
        return (
            Era.objects.filter(landmark__is_published=True)
            .select_related("landmark__category")
            .prefetch_related("models")
            .order_by("year", "landmark__order")
        )
