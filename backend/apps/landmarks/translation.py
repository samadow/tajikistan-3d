from modeltranslation.translator import TranslationOptions, register

from .models import Category, Era, Hotspot, Landmark, LandmarkImage


@register(Category)
class CategoryTR(TranslationOptions):
    fields = ("name",)


@register(Landmark)
class LandmarkTR(TranslationOptions):
    fields = ("name", "subtitle", "short_description", "full_description", "history", "best_season", "how_to_get_there")


@register(LandmarkImage)
class LandmarkImageTR(TranslationOptions):
    fields = ("caption",)


@register(Hotspot)
class HotspotTR(TranslationOptions):
    fields = ("title", "text", "history")


@register(Era)
class EraTR(TranslationOptions):
    fields = ("label", "description")
