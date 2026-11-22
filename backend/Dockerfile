# Build context: repository root (needs shared/projection.json). See docker-compose.yml.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    PROJECTION_FILE=/shared/projection.json

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY shared /shared
COPY backend/ .
# collectstatic needs a key at build time only; the real one comes from the environment.
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput \
    && useradd --create-home app && mkdir -p /app/media && chown -R app /app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/', timeout=4).status == 200 else 1)"
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
