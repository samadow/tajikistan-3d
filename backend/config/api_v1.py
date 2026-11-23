"""Version 1 of the public, read-only API."""
from rest_framework.routers import DefaultRouter

from django.urls import path

from apps.core.views import SitePageViewSet, map_config_view, nearby_media_view
from apps.landmarks.views import CategoryViewSet, EraViewSet, LandmarkViewSet
from apps.stories.views import StoryViewSet

router = DefaultRouter(trailing_slash=True)
router.register("landmarks", LandmarkViewSet, basename="landmark")
router.register("categories", CategoryViewSet, basename="category")
router.register("eras", EraViewSet, basename="era")
router.register("stories", StoryViewSet, basename="story")
router.register("pages", SitePageViewSet, basename="page")

urlpatterns = [
    path("nearby-media/", nearby_media_view, name="nearby-media"),
    path("map-config/", map_config_view, name="map-config"),
    *router.urls,
]
