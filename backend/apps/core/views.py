from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import SitePage
from .nearby_media import nearby_media
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


class NearbyMediaQuery(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    radius = serializers.IntegerField(min_value=50, max_value=10_000, default=1500)


class MediaItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    source = serializers.ChoiceField(choices=["commons", "panoramax", "mapillary"])
    kind = serializers.ChoiceField(choices=["photo", "pano"])
    title = serializers.CharField()
    thumb = serializers.URLField()
    full = serializers.URLField()
    page = serializers.URLField()
    author = serializers.CharField(allow_blank=True)
    license = serializers.CharField(allow_blank=True)
    license_url = serializers.CharField(allow_blank=True)
    date = serializers.CharField(allow_blank=True)
    lat = serializers.FloatField(allow_null=True)
    lon = serializers.FloatField(allow_null=True)
    distance_m = serializers.IntegerField(allow_null=True)


class NearbyMediaSerializer(serializers.Serializer):
    panoramas = MediaItemSerializer(many=True)
    photos = MediaItemSerializer(many=True)
    sources_failed = serializers.ListField(child=serializers.CharField())
    mapillary_enabled = serializers.BooleanField()


@extend_schema(parameters=[NearbyMediaQuery], responses=NearbyMediaSerializer, tags=["map"])
@api_view(["GET"])
@permission_classes([AllowAny])
def nearby_media_view(request):
    """Openly licensed photos and 360° panoramas around a point (Commons, Panoramax, Mapillary)."""
    query = NearbyMediaQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    data = nearby_media(**query.validated_data)
    response = Response(data)
    response["Cache-Control"] = "public, max-age=600"
    return response


SATELLITE_EOX = {
    "tiles": ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"],
    "maxzoom": 15,
    "attribution": '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless – s2maps.eu by EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2020)',
    "high_resolution": False,
}


def satellite_config() -> dict:
    key = settings.ARCGIS_API_KEY
    if not key:
        return SATELLITE_EOX
    return {
        "tiles": [
            "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=" + key
        ],
        "maxzoom": 19,
        "attribution": "Powered by <a href=\"https://www.esri.com\" target=\"_blank\" rel=\"noopener\">Esri</a> | Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        "high_resolution": True,
    }


@extend_schema(responses=dict, tags=["map"])
@api_view(["GET"])
@permission_classes([AllowAny])
def map_config_view(_request):
    """Runtime configuration for the real map: satellite tile source and optional integrations."""
    # Mapillary client tokens are public by design (they are sent with every tile request);
    # the browser needs it to draw the street-imagery coverage layer.
    return Response(
        {
            "satellite": satellite_config(),
            "mapillary_enabled": bool(settings.MAPILLARY_TOKEN),
            "mapillary_token": settings.MAPILLARY_TOKEN,
        }
    )
