from modeltranslation.translator import TranslationOptions, register

from .models import Story, StoryStep


@register(Story)
class StoryTR(TranslationOptions):
    fields = ("title", "subtitle", "intro")


@register(StoryStep)
class StoryStepTR(TranslationOptions):
    fields = ("title", "text")
