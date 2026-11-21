from modeltranslation.translator import TranslationOptions, register

from .models import Category, Hotspot, Landmark, LandmarkEra, LandmarkImage


@register(Category)
class CategoryTR(TranslationOptions):
    fields = ("name",)


@register(Landmark)
class LandmarkTR(TranslationOptions):
    fields = ("name", "subtitle", "short_description", "full_description", "best_season", "how_to_get_there")


@register(LandmarkImage)
class LandmarkImageTR(TranslationOptions):
    fields = ("caption",)


@register(Hotspot)
class HotspotTR(TranslationOptions):
    fields = ("title", "text")


@register(LandmarkEra)
class LandmarkEraTR(TranslationOptions):
    fields = ("label", "description")
