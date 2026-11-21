"""Read-only public API."""
from django.conf import settings
from django.db.models import Count, Prefetch, Q
from django.utils import translation
from django.utils.cache import patch_cache_control, patch_vary_headers
from django_filters import rest_framework as filters
from rest_framework import viewsets

from .models import Category, Landmark, LandmarkEra
from .serializers import CategorySerializer, LandmarkDetailSerializer, LandmarkListSerializer


def resolve_language(request) -> str:
    """?lang= wins, then the Accept-Language header, then Tajik."""
    supported = settings.CONTENT_LANGUAGES
    lang = (request.GET.get("lang") or "").lower()
    if lang in supported:
        return lang
    header = request.headers.get("Accept-Language", "")
    for part in header.split(","):
        code = part.split(";")[0].strip().lower()[:2]
        if code in supported:
            return code
    return settings.MODELTRANSLATION_DEFAULT_LANGUAGE


class LanguageMixin:
    """Activates the requested content language for the whole request/response cycle."""

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Content-Language"] = getattr(request, "content_language", "tg")
        patch_vary_headers(response, ("Accept-Language",))
        patch_cache_control(response, public=True, max_age=60)
        return response

    def dispatch(self, request, *args, **kwargs):
        # Runs before DRF wraps the request, so work with the plain HttpRequest.
        lang = resolve_language(request)
        request.content_language = lang
        with translation.override(lang):
            return super().dispatch(request, *args, **kwargs)


class LandmarkFilter(filters.FilterSet):
    category = filters.CharFilter(field_name="category__slug")

    class Meta:
        model = Landmark
        fields = ("category",)


class LandmarkViewSet(LanguageMixin, viewsets.ReadOnlyModelViewSet):
    lookup_field = "slug"
    filterset_class = LandmarkFilter
    pagination_class = None  # the whole country fits in one response

    def get_queryset(self):
        qs = Landmark.objects.published().select_related("category")
        if self.action == "retrieve":
            qs = qs.prefetch_related(
                "images",
                "hotspots",
                Prefetch("eras", queryset=LandmarkEra.objects.order_by("order", "year")),
            )
        return qs

    def get_serializer_class(self):
        return LandmarkDetailSerializer if self.action == "retrieve" else LandmarkListSerializer


class CategoryViewSet(LanguageMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = CategorySerializer
    lookup_field = "slug"
    pagination_class = None

    def get_queryset(self):
        return Category.objects.annotate(
            landmark_count=Count("landmarks", filter=Q(landmarks__is_published=True))
        )
