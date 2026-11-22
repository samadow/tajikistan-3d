"""Content-language resolution shared by every public API view."""
from __future__ import annotations

from django.conf import settings
from django.http import HttpRequest


def supported_languages() -> tuple[str, ...]:
    return tuple(settings.CONTENT_LANGUAGES)


def resolve_language(request: HttpRequest) -> str:
    """``?lang=`` wins, then the Accept-Language header (in preference order), then Tajik."""
    supported = supported_languages()
    lang = (request.GET.get("lang") or "").strip().lower()
    if lang in supported:
        return lang

    header = request.headers.get("Accept-Language", "")
    weighted: list[tuple[float, int, str]] = []
    for index, part in enumerate(header.split(",")):
        pieces = part.strip().split(";")
        code = pieces[0].strip().lower()[:2]
        quality = 1.0
        for param in pieces[1:]:
            name, _, value = param.strip().partition("=")
            if name == "q":
                try:
                    quality = float(value)
                except ValueError:
                    quality = 0.0
        if code in supported and quality > 0:
            weighted.append((-quality, index, code))
    if weighted:
        return sorted(weighted)[0][2]
    return settings.MODELTRANSLATION_DEFAULT_LANGUAGE
