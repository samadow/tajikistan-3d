"""Server-side API response cache with instant invalidation.

Every cached response key contains a global *content version*. Saving or
deleting any content model bumps the version (see ``signals.py``), so stale
entries are simply never read again and expire on their own TTL.

The backend is configured in settings: LocMem for development/tests, a
file-based cache in production so all gunicorn workers share the version
counter without adding Redis as a dependency.
"""
from __future__ import annotations

import hashlib

from django.conf import settings
from django.core.cache import cache
from rest_framework.response import Response

VERSION_KEY = "content-version"


def content_version() -> int:
    version = cache.get(VERSION_KEY)
    if version is None:
        version = 1
        cache.set(VERSION_KEY, version, None)
    return int(version)


def bump_content_version() -> None:
    try:
        cache.incr(VERSION_KEY)
    except ValueError:  # key missing (cache cleared or expired)
        cache.set(VERSION_KEY, 2, None)


def response_cache_key(request, lang: str) -> str:
    raw = f"{request.get_host()}|{request.get_full_path()}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:32]
    return f"api:v{content_version()}:{lang}:{digest}"


class CachedResponseMixin:
    """Caches successful GET responses of a DRF view (data only, rendered per request).

    Authentication, permissions and throttling still run on cache hits.
    Must be combined with ``LanguageMixin`` (which sets ``request.content_language``).
    """

    def dispatch(self, request, *args, **kwargs):
        ttl = getattr(settings, "API_CACHE_SECONDS", 60)
        if request.method != "GET" or ttl <= 0:
            return super().dispatch(request, *args, **kwargs)

        key = response_cache_key(request, request.content_language)
        cached = cache.get(key)
        if cached is None:
            response = super().dispatch(request, *args, **kwargs)
            if response.status_code == 200 and hasattr(response, "data"):
                cache.set(key, response.data, ttl)
            return response

        # Mirror APIView.dispatch so headers, throttles and renderers behave identically.
        self.args, self.kwargs = args, kwargs
        drf_request = self.initialize_request(request, *args, **kwargs)
        self.request = drf_request
        self.headers = self.default_response_headers
        try:
            self.initial(drf_request, *args, **kwargs)
            response = Response(cached)
            response["X-Cache"] = "HIT"
        except Exception as exc:  # noqa: BLE001 — same contract as APIView.dispatch
            response = self.handle_exception(exc)
        self.response = self.finalize_response(drf_request, response, *args, **kwargs)
        return self.response
