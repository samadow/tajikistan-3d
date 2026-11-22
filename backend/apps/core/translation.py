from modeltranslation.translator import TranslationOptions, register

from .models import SitePage


@register(SitePage)
class SitePageTR(TranslationOptions):
    fields = ("title", "lead", "body")
