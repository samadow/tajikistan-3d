from django.contrib import admin
from modeltranslation.admin import TabbedTranslationAdmin

from .models import SitePage

admin.site.site_header = "Tajikistan 3D — CMS"
admin.site.site_title = "Tajikistan 3D"
admin.site.index_title = "Content"


def missing_translations(obj, fields: tuple[str, ...], languages=("tg", "ru", "en")) -> list[str]:
    """Names of translated fields that are empty, e.g. ``['title_en', 'body_ru']``."""
    return [f"{f}_{lang}" for f in fields for lang in languages if not getattr(obj, f"{f}_{lang}", "")]


@admin.register(SitePage)
class SitePageAdmin(TabbedTranslationAdmin):
    list_display = ("title", "slug", "is_published", "missing", "updated_at")
    list_editable = ("is_published",)
    prepopulated_fields = {"slug": ("title_en",)}

    @admin.display(description="Missing texts")
    def missing(self, obj):
        return len(missing_translations(obj, ("title", "lead", "body"))) or "✓"
