from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, LandmarkViewSet

router = DefaultRouter(trailing_slash=True)
router.register("landmarks", LandmarkViewSet, basename="landmark")
router.register("categories", CategoryViewSet, basename="category")

urlpatterns = router.urls
