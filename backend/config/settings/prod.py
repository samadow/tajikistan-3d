"""Production settings. All secrets come from the environment."""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import SECRET_KEY, env

if SECRET_KEY == "dev-insecure-change-me":
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY in production.")

DEBUG = False
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = env("DJANGO_SECURE_COOKIES", "1") == "1"
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# Turn these on once the site is served over HTTPS (see README → Deployment).
SECURE_SSL_REDIRECT = env("DJANGO_SSL_REDIRECT", "0") == "1"
SECURE_HSTS_SECONDS = int(env("DJANGO_HSTS_SECONDS", "0"))
