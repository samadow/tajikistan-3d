from django.contrib import admin
from django.utils.html import format_html
from modeltranslation.admin import TabbedTranslationAdmin, TranslationStackedInline, TranslationTabularInline

from .models import Category, Hotspot, Landmark, LandmarkEra, LandmarkImage


class ContentStatusFilter(admin.SimpleListFilter):
    title = "content status"
    parameter_name = "content"

    def lookups(self, request, model_admin):
        return (("todo", "Needs text"), ("no_model", "No 3D model"), ("ready", "Complete"))

    def queryset(self, request, queryset):
        value = self.value()
        if value == "no_model":
            return queryset.filter(model_file="")
        if value in ("todo", "ready"):
            ids = [lm.pk for lm in queryset if bool(lm.missing_content) == (value == "todo")]
            return queryset.filter(pk__in=ids)
        return queryset


class LandmarkImageInline(TranslationTabularInline):
    model = LandmarkImage
    extra = 1
    fields = ("preview", "image", "caption", "credit", "order")
    readonly_fields = ("preview",)

    @admin.display(description="")
    def preview(self, obj):
        if obj.pk and obj.image:
            return format_html('<img src="{}" style="height:64px;border-radius:6px">', obj.image.url)
        return "—"


class HotspotInline(TranslationStackedInline):
    model = Hotspot
    extra = 0
    fields = (("x", "y", "z", "order"), "title", "text")


class LandmarkEraInline(TranslationStackedInline):
    model = LandmarkEra
    extra = 0
    fields = (("year", "order", "placeholder_variant"), "label", "description", "model_file")


@admin.register(Category)
class CategoryAdmin(TabbedTranslationAdmin):
    list_display = ("name", "slug", "swatch", "order")
    list_editable = ("order",)
    prepopulated_fields = {"slug": ("name_en",)}

    @admin.display(description="Colour")
    def swatch(self, obj):
        return format_html(
            '<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:{}"></span>',
            obj.color,
        )


@admin.register(Landmark)
class LandmarkAdmin(TabbedTranslationAdmin):
    list_display = ("thumb", "name", "category", "elevation_m", "has_model", "todo_count", "is_published", "order")
    list_display_links = ("thumb", "name")
    list_editable = ("is_published", "order")
    list_filter = ("category", "is_published", ContentStatusFilter)
    search_fields = ("name_tg", "name_ru", "name_en", "slug")
    prepopulated_fields = {"slug": ("name_en",)}
    readonly_fields = ("poster_preview", "map_position", "updated_at")
    inlines = (LandmarkImageInline, HotspotInline, LandmarkEraInline)
    save_on_top = True
    fieldsets = (
        (None, {"fields": ("name", "subtitle", "slug", "category", "is_published", "order")}),
        ("Story", {"fields": ("short_description", "full_description")}),
        ("Travel", {"fields": ("best_season", "how_to_get_there")}),
        ("Location", {
            "fields": (("latitude", "longitude", "elevation_m"), "map_position"),
            "description": "Map position is calculated automatically from latitude / longitude.",
        }),
        ("Fly-to camera", {
            "classes": ("collapse",),
            "fields": (
                "camera_override",
                ("camera_pos_x", "camera_pos_y", "camera_pos_z"),
                ("camera_target_x", "camera_target_y", "camera_target_z"),
            ),
        }),
        ("3D model", {
            "fields": ("model_file", "model_scale", "model_credit", "placeholder"),
            "description": "Upload a compressed GLB to replace the procedural placeholder.",
        }),
        ("Poster", {"fields": ("poster_preview", "poster", "poster_credit")}),
        ("Meta", {"classes": ("collapse",), "fields": ("updated_at",)}),
    )

    @admin.display(description="")
    def thumb(self, obj):
        if obj.poster:
            return format_html('<img src="{}" style="height:40px;width:64px;object-fit:cover;border-radius:4px">', obj.poster.url)
        return format_html('<span style="display:inline-block;height:40px;width:64px;border-radius:4px;background:{}"></span>', obj.category.color)

    @admin.display(description="Poster preview")
    def poster_preview(self, obj):
        if obj.poster:
            return format_html('<img src="{}" style="max-height:220px;border-radius:8px">', obj.poster.url)
        return "No poster yet."

    @admin.display(description="Map x / y / z")
    def map_position(self, obj):
        return f"{obj.map_x:.2f} / {obj.map_y:.2f} / {obj.map_z:.2f}"

    @admin.display(boolean=True, description="GLB")
    def has_model(self, obj):
        return bool(obj.model_file)

    @admin.display(description="Missing texts")
    def todo_count(self, obj):
        count = len(obj.missing_content)
        return format_html('<b style="color:{}">{}</b>', "#c0392b" if count else "#27ae60", count or "✓")
