"""Base classes for the public, read-only, multilingual API."""
from django.conf import settings
from django.utils import translation
from django.utils.cache import patch_cache_control, patch_vary_headers
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from rest_framework.pagination import PageNumberPagination

from .cache import CachedResponseMixin
from .language import resolve_language

LANG_PARAMETER = OpenApiParameter(
    name="lang",
    type=OpenApiTypes.STR,
    location=OpenApiParameter.QUERY,
    enum=["tg", "ru", "en"],
    description="Content language. Falls back to Accept-Language, then Tajik. "
    "Empty translations fall back tg → ru → en.",
)


class LanguageMixin:
    """Activates the requested content language for the whole request/response cycle."""

    def dispatch(self, request, *args, **kwargs):
        # Runs before DRF wraps the request, so it works with the plain HttpRequest.
        lang = resolve_language(request)
        request.content_language = lang
        with translation.override(lang):
            return super().dispatch(request, *args, **kwargs)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Content-Language"] = getattr(request, "content_language", settings.MODELTRANSLATION_DEFAULT_LANGUAGE)
        patch_vary_headers(response, ("Accept-Language",))
        if request.method == "GET" and response.status_code == 200:
            patch_cache_control(response, public=True, max_age=getattr(settings, "API_CACHE_SECONDS", 60))
        return response


class PublicReadOnlyMixin(LanguageMixin, CachedResponseMixin):
    """Language + server cache. Order matters: language must resolve before the cache key is built."""


class StandardPagination(PageNumberPagination):
    page_size = 24
    page_size_query_param = "page_size"
    max_page_size = 100
