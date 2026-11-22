"""Upload validation and derived images (WebP thumbnails)."""
from __future__ import annotations

import io
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.validators import FileExtensionValidator
from PIL import Image, ImageOps

GLB_MAGIC = b"glTF"


def validate_glb_size(file) -> None:
    limit = settings.MAX_MODEL_UPLOAD_BYTES
    if file and file.size > limit:
        raise ValidationError(
            f"Model is {file.size / 1e6:.1f} MB; the limit is {limit / 1e6:.0f} MB. "
            "Compress it with gltf-transform (see README → Preparing 3D models)."
        )


def validate_glb_header(file) -> None:
    """A binary glTF starts with the ASCII magic 'glTF' followed by version 2."""
    if not file:
        return
    position = file.tell() if hasattr(file, "tell") else 0
    try:
        file.seek(0)
        header = file.read(8)
    finally:
        file.seek(position)
    if len(header) < 8 or header[:4] != GLB_MAGIC:
        raise ValidationError("This is not a binary glTF (.glb) file.")
    version = int.from_bytes(header[4:8], "little")
    if version != 2:
        raise ValidationError(f"glTF version {version} is not supported; export glTF 2.0.")


GLB_VALIDATORS = [FileExtensionValidator(["glb"]), validate_glb_size, validate_glb_header]
IMAGE_VALIDATORS = [FileExtensionValidator(["jpg", "jpeg", "png", "webp", "avif"])]


def make_webp_thumbnail(source, max_size: int = 800, quality: int = 80) -> ContentFile | None:
    """Return a WebP thumbnail of an uploaded image, honouring EXIF orientation."""
    if not source:
        return None
    try:
        source.open("rb")
        source.seek(0)
        with Image.open(source) as img:
            img = ImageOps.exif_transpose(img)
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            buffer = io.BytesIO()
            img.save(buffer, "WEBP", quality=quality, method=5)
    except (OSError, ValueError):
        return None
    name = f"{Path(source.name).stem}_{max_size}.webp"
    return ContentFile(buffer.getvalue(), name=name)


def refresh_thumbnail(instance, source_field: str, thumb_field: str, max_size: int = 800) -> None:
    """(Re)build ``thumb_field`` when ``source_field`` changed. Call from ``save()`` before saving."""
    source = getattr(instance, source_field)
    thumb = getattr(instance, thumb_field)
    if not source:
        if thumb:
            thumb.delete(save=False)
        return
    previous = None
    if instance.pk:
        previous = type(instance).objects.filter(pk=instance.pk).values_list(source_field, flat=True).first()
    if thumb and previous == source.name:
        return  # unchanged
    content = make_webp_thumbnail(source, max_size)
    if content is not None:
        thumb.save(content.name, content, save=False)
