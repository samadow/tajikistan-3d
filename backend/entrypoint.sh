#!/bin/sh
set -e

python manage.py migrate --noinput

# Seed the 12 landmarks on first start (safe to re-run; never overwrites your texts).
if [ "${SEED_ON_START:-1}" = "1" ]; then
  python manage.py seed_landmarks
fi

# Optional: create an admin user from env vars on first start.
if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  python manage.py createsuperuser --noinput --email "${DJANGO_SUPERUSER_EMAIL:-admin@example.com}" 2>/dev/null || true
fi

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "${GUNICORN_WORKERS:-3}" \
  --access-logfile - \
  --timeout 60
