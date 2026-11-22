from django.apps import AppConfig


class LandmarksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.landmarks"
    # The label stays "landmarks" so the existing migration history and tables are kept.
    label = "landmarks"
    verbose_name = "Landmarks"
