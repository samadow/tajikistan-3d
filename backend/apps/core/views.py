from django.db import connection
from django.http import JsonResponse
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers, viewsets

from .models import SitePage
from .views_base import LANG_PARAMETER, PublicReadOnlyMixin


def health(_request):
    """Liveness + database check for load balancers and uptime monitors."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return JsonResponse({"status": "ok", "database": "ok"})
    except Exception:  # noqa: BLE001 — report, do not crash
        return JsonResponse({"status": "error", "database": "unavailable"}, status=503)


class SitePageSerializer(serializers.ModelSerializer):
    class Meta:
        model = SitePage
        fields = ("slug", "title", "lead", "body", "updated_at")


@extend_schema_view(list=extend_schema(parameters=[LANG_PARAMETER]), retrieve=extend_schema(parameters=[LANG_PARAMETER]))
class SitePageViewSet(PublicReadOnlyMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = SitePageSerializer
    lookup_field = "slug"
    pagination_class = None
    queryset = SitePage.objects.filter(is_published=True)
