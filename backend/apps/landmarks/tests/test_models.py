import io
import shutil
import tempfile

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from PIL import Image

from apps.core.media import validate_glb_header, validate_glb_size
from apps.landmarks.models import Category, Era, Landmark, LandmarkImage, LandmarkModel
from apps.stories.models import Story, StoryStep

GLB_HEADER = b"glTF" + (2).to_bytes(4, "little") + (20).to_bytes(4, "little")


def glb(name="model.glb", body=GLB_HEADER + b"\x00" * 8):
    return SimpleUploadedFile(name, body, content_type="model/gltf-binary")


def png(name="photo.png", size=(1600, 900)):
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 150, 80)).save(buf, "PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class MediaTestCase(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media = tempfile.mkdtemp()
        cls._override = override_settings(MEDIA_ROOT=cls.media)
        cls._override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override.disable()
        shutil.rmtree(cls.media, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.category = Category.objects.create(slug="history", name="History")
        self.landmark = Landmark.objects.create(slug="site", name="Site", category=self.category, latitude=38.5, longitude=68.8)


class GlbValidationTests(MediaTestCase):
    def test_valid_header(self):
        validate_glb_header(glb())

    def test_rejects_non_glb(self):
        with self.assertRaises(ValidationError):
            validate_glb_header(glb(body=b"<html>not a model</html>"))

    def test_rejects_gltf_v1(self):
        with self.assertRaises(ValidationError):
            validate_glb_header(glb(body=b"glTF" + (1).to_bytes(4, "little") + b"\x00" * 8))

    @override_settings(MAX_MODEL_UPLOAD_BYTES=10)
    def test_size_limit(self):
        with self.assertRaises(ValidationError):
            validate_glb_size(glb())

    def test_model_records_size_and_full_clean(self):
        model = LandmarkModel(landmark=self.landmark, lod="high", file=glb())
        model.full_clean()
        model.save()
        self.assertEqual(model.size_bytes, len(GLB_HEADER) + 8)

    def test_one_main_model_per_lod(self):
        LandmarkModel.objects.create(landmark=self.landmark, lod="high", file=glb())
        with self.assertRaises(IntegrityError), transaction.atomic():
            LandmarkModel.objects.create(landmark=self.landmark, lod="high", file=glb("b.glb"))
        # Same LOD is fine for an era model.
        era = Era.objects.create(landmark=self.landmark, label="Then", year=-500)
        LandmarkModel.objects.create(landmark=self.landmark, era=era, lod="high", file=glb("c.glb"))

    def test_era_must_belong_to_landmark(self):
        other = Landmark.objects.create(slug="other", name="Other", category=self.category, latitude=38, longitude=69)
        era = Era.objects.create(landmark=other, label="Then", year=100)
        with self.assertRaises(ValidationError):
            LandmarkModel(landmark=self.landmark, era=era, file=glb()).full_clean()


class ImageTests(MediaTestCase):
    def test_poster_and_gallery_thumbnails_are_webp(self):
        self.landmark.poster = png()
        self.landmark.save()
        self.assertTrue(self.landmark.poster_thumbnail.name.endswith(".webp"))
        with Image.open(self.landmark.poster_thumbnail.path) as thumb:
            self.assertLessEqual(max(thumb.size), 800)

        image = LandmarkImage.objects.create(landmark=self.landmark, image=png("g.png"))
        self.assertTrue(image.thumbnail.name.endswith(".webp"))

    def test_thumbnail_not_rebuilt_when_unchanged(self):
        self.landmark.poster = png()
        self.landmark.save()
        first = self.landmark.poster_thumbnail.name
        self.landmark.name = "Renamed"
        self.landmark.save()
        self.assertEqual(self.landmark.poster_thumbnail.name, first)


class ValidationTests(MediaTestCase):
    def test_coordinates_must_be_on_the_map(self):
        self.landmark.latitude, self.landmark.longitude = 51.5, -0.1
        with self.assertRaises(ValidationError):
            self.landmark.clean()

    def test_area_geojson_type(self):
        self.landmark.area_geojson = {"type": "Point", "coordinates": [68, 38]}
        with self.assertRaises(ValidationError):
            self.landmark.clean()
        self.landmark.area_geojson = {"type": "Polygon", "coordinates": [[[68, 38], [69, 38], [69, 39], [68, 38]]]}
        self.landmark.clean()

    def test_map_position_and_camera_are_derived(self):
        self.assertNotEqual(self.landmark.map_x, 0)
        self.assertGreater(self.landmark.camera_pos_y, self.landmark.camera_target_y)

    def test_era_end_after_start(self):
        with self.assertRaises(ValidationError):
            Era(landmark=self.landmark, label="x", year=100, year_end=50).clean()

    def test_story_step_needs_landmark_or_camera(self):
        story = Story.objects.create(slug="s", title="S")
        with self.assertRaises(ValidationError):
            StoryStep(story=story, title="Valley").clean()
        with self.assertRaises(ValidationError):
            StoryStep(story=story, title="Valley", camera_override=True, camera_pos_x=1).clean()
        StoryStep(story=story, landmark=self.landmark).clean()

    def test_only_one_default_story(self):
        a = Story.objects.create(slug="a", title="A", is_default=True)
        Story.objects.create(slug="b", title="B", is_default=True)
        a.refresh_from_db()
        self.assertFalse(a.is_default)

    def test_missing_content_lists_empty_translations(self):
        self.assertIn("subtitle_en", self.landmark.missing_content)
        self.assertIn("history_tg", self.landmark.missing_content)
