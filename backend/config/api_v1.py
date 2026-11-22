"""Version 1 of the public, read-only API."""
from rest_framework.routers import DefaultRouter

from apps.core.views import SitePageViewSet
from apps.landmarks.views import CategoryViewSet, EraViewSet, LandmarkViewSet
from apps.stories.views import StoryViewSet

router = DefaultRouter(trailing_slash=True)
router.register("landmarks", LandmarkViewSet, basename="landmark")
router.register("categories", CategoryViewSet, basename="category")
router.register("eras", EraViewSet, basename="era")
router.register("stories", StoryViewSet, basename="story")
router.register("pages", SitePageViewSet, basename="page")

urlpatterns = router.urls
