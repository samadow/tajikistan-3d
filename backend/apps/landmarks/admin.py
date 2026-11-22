from django.contrib import admin
from django.db.models import Count, Q
from django.utils.html import format_html
from modeltranslation.admin import TabbedTranslationAdmin, TranslationStackedInline, TranslationTabularInline

from .models import Category, Era, HistoricalSource, Hotspot, Landmark, LandmarkImage, LandmarkModel


def _img(url: str, height: int = 64) -> str:
    return format_html('<img src="{}" style="height:{}px;border-radius:6px;object-fit:cover">', url, height)


class ContentStatusFilter(admin.SimpleListFilter):
    title = "content status"
    parameter_name = "content"

    def lookups(self, request, model_admin):
        return (("todo", "Needs text"), ("no_model", "No 3D model"), ("no_source", "No sources"), ("ready", "Complete"))

    def queryset(self, request, queryset):
        value = self.value()
        if value == "no_model":
            return queryset.annotate(main_models=Count("models", filter=Q(models__era__isnull=True))).filter(main_models=0)
        if value == "no_source":
            return queryset.filter(sources__isnull=True)
        if value in ("todo", "ready"):
            ids = [lm.pk for lm in queryset if bool(lm.missing_content) == (value == "todo")]
            return queryset.filter(pk__in=ids)
        return queryset


class LandmarkImageInline(TranslationTabularInline):
    model = LandmarkImage
    extra = 0
    fields = ("preview", "image", "caption", "credit", "license", "order")
    readonly_fields = ("preview",)

    @admin.display(description="")
    def preview(self, obj):
        source = obj.thumbnail or obj.image if obj.pk else None
        return _img(source.url) if source else "—"


class LandmarkModelInline(admin.TabularInline):
    model = LandmarkModel
    extra = 0
    fields = ("era", "lod", "file", "size", "is_illustrative", "credit", "license")
    readonly_fields = ("size",)

    @admin.display(description="Size")
    def size(self, obj):
        if not obj.size_bytes:
            return "—"
        mb = obj.size_bytes / 1e6
        colour = "#27ae60" if mb <= 5 else "#c0392b"
        return format_html('<b style="color:{}">{} MB</b>', colour, f"{mb:.1f}")

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # Only offer eras of the landmark being edited.
        if db_field.name == "era":
            object_id = request.resolver_match.kwargs.get("object_id")
            kwargs["queryset"] = Era.objects.filter(landmark_id=object_id) if object_id else Era.objects.none()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class HotspotInline(TranslationStackedInline):
    model = Hotspot
    extra = 0
    fields = (("x", "y", "z", "focus_distance", "order"), "title", "text", "history", ("image", "image_credit"), "sources")
    autocomplete_fields = ("sources",)


class EraInline(TranslationStackedInline):
    model = Era
    extra = 0
    fields = (("year", "year_end", "year_is_approximate"), ("order", "placeholder_variant"), "label", "description", "sources")
    autocomplete_fields = ("sources",)
    show_change_link = True


@admin.register(Category)
class CategoryAdmin(TabbedTranslationAdmin):
    list_display = ("name", "slug", "swatch", "order")
    list_editable = ("order",)
    prepopulated_fields = {"slug": ("name_en",)}

    @admin.display(description="Colour")
    def swatch(self, obj):
        return format_html(
            '<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:{}"></span>', obj.color
        )


@admin.register(HistoricalSource)
class HistoricalSourceAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "year", "publisher", "used_by")
    search_fields = ("title", "author", "publisher", "citation")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            n_landmarks=Count("landmarks", distinct=True), n_eras=Count("eras", distinct=True)
        )

    @admin.display(description="Used by")
    def used_by(self, obj):
        return f"{obj.n_landmarks} landmarks · {obj.n_eras} eras"


@admin.register(Landmark)
class LandmarkAdmin(TabbedTranslationAdmin):
    list_display = (
        "thumb", "name", "category", "elevation_m", "model_count", "todo_count",
        "has_coordinates_source", "is_featured", "is_published", "order",
    )
    list_display_links = ("thumb", "name")
    list_editable = ("is_featured", "is_published", "order")
    list_filter = ("category", "is_published", "is_featured", ContentStatusFilter)
    search_fields = ("name_tg", "name_ru", "name_en", "slug")
    prepopulated_fields = {"slug": ("name_en",)}
    readonly_fields = ("poster_preview", "map_position", "missing_list", "updated_at")
    autocomplete_fields = ("sources",)
    inlines = (LandmarkModelInline, LandmarkImageInline, HotspotInline, EraInline)
    save_on_top = True
    fieldsets = (
        (None, {"fields": ("name", "subtitle", "slug", "category", ("is_published", "is_featured", "order"))}),
        ("Story", {"fields": ("short_description", "full_description")}),
        ("History", {"fields": ("history", "sources"), "description": "Only verified facts. Link every source used."}),
        ("Travel", {"fields": ("best_season", "how_to_get_there")}),
        ("Location", {
            "fields": (("latitude", "longitude", "elevation_m"), "coordinates_source", "map_position", "area_geojson"),
            "description": "Map position is calculated from latitude / longitude. "
            "Record where the coordinates were verified (e.g. Wikidata Q-id).",
        }),
        ("Fly-to camera", {
            "classes": ("collapse",),
            "fields": (
                "camera_override",
                ("camera_pos_x", "camera_pos_y", "camera_pos_z"),
                ("camera_target_x", "camera_target_y", "camera_target_z"),
            ),
        }),
        ("3D stage", {
            "fields": ("placeholder", "model_scale"),
            "description": "Upload GLB files in '3D models' below. Without a model the placeholder is shown.",
        }),
        ("Poster", {"fields": ("poster_preview", "poster", "poster_credit")}),
        ("Translation checklist", {"classes": ("collapse",), "fields": ("missing_list", "updated_at")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("category").annotate(n_models=Count("models", distinct=True))

    @admin.display(description="")
    def thumb(self, obj):
        source = obj.poster_thumbnail or obj.poster
        if source:
            return format_html('<img src="{}" style="height:40px;width:64px;object-fit:cover;border-radius:4px">', source.url)
        return format_html(
            '<span style="display:inline-block;height:40px;width:64px;border-radius:4px;background:{}"></span>', obj.category.color
        )

    @admin.display(description="Poster preview")
    def poster_preview(self, obj):
        return _img(obj.poster.url, 220) if obj.poster else "No poster yet."

    @admin.display(description="Map x / y / z")
    def map_position(self, obj):
        return f"{obj.map_x:.2f} / {obj.map_y:.2f} / {obj.map_z:.2f}"

    @admin.display(description="GLBs", ordering="n_models")
    def model_count(self, obj):
        return obj.n_models or "—"

    @admin.display(boolean=True, description="Coords verified")
    def has_coordinates_source(self, obj):
        return bool(obj.coordinates_source)

    @admin.display(description="Missing texts")
    def todo_count(self, obj):
        count = len(obj.missing_content)
        return format_html('<b style="color:{}">{}</b>', "#c0392b" if count else "#27ae60", count or "✓")

    @admin.display(description="Empty translations")
    def missing_list(self, obj):
        return ", ".join(obj.missing_content) or "All texts are filled in."


@admin.register(Era)
class EraAdmin(TabbedTranslationAdmin):
    list_display = ("label", "landmark", "year", "year_end", "placeholder_variant")
    list_filter = ("landmark",)
    search_fields = ("label_tg", "label_ru", "label_en", "landmark__name_tg")
    autocomplete_fields = ("sources",)
