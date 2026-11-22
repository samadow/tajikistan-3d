from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    label = "core"
    verbose_name = "Site"

    def ready(self) -> None:
        # Cache invalidation hooks for every content model.
        from . import signals  # noqa: F401
