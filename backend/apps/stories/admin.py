from django.contrib import admin
from django.db.models import Count
from modeltranslation.admin import TabbedTranslationAdmin, TranslationStackedInline

from .models import Story, StoryStep


class StoryStepInline(TranslationStackedInline):
    model = StoryStep
    extra = 0
    autocomplete_fields = ("landmark",)
    fields = (
        ("order", "landmark"), "title", "text", ("image", "image_credit"),
        "camera_override",
        ("camera_pos_x", "camera_pos_y", "camera_pos_z"),
        ("camera_target_x", "camera_target_y", "camera_target_z"),
    )


@admin.register(Story)
class StoryAdmin(TabbedTranslationAdmin):
    list_display = ("title", "slug", "steps_count", "is_default", "is_published", "order")
    list_editable = ("is_published", "order")
    prepopulated_fields = {"slug": ("title_en",)}
    inlines = (StoryStepInline,)
    fields = ("title", "subtitle", "slug", "intro", "cover", ("is_published", "is_default", "order"))

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(n_steps=Count("steps"))

    @admin.display(description="Steps", ordering="n_steps")
    def steps_count(self, obj):
        return obj.n_steps
