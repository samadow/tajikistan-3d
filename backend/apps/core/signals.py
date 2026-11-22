"""Bump the API content version whenever editors change content."""
from django.apps import apps
from django.db.models.signals import m2m_changed, post_delete, post_save

from .cache import bump_content_version

CONTENT_APPS = ("core", "landmarks", "stories")


def _bump(sender, **kwargs):
    bump_content_version()


for label in CONTENT_APPS:
    for model in apps.get_app_config(label).get_models():
        post_save.connect(_bump, sender=model, dispatch_uid=f"bump-save-{model._meta.label}")
        post_delete.connect(_bump, sender=model, dispatch_uid=f"bump-delete-{model._meta.label}")
        for field in model._meta.many_to_many:
            m2m_changed.connect(_bump, sender=field.remote_field.through, dispatch_uid=f"bump-m2m-{field.remote_field.through._meta.label}")
