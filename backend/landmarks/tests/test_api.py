import json
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from landmarks import geo
from landmarks.models import Landmark


class ApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_landmarks", verbosity=0)

    def setUp(self):
        self.client = APIClient()

    def test_list_returns_published_landmarks(self):
        res = self.client.get("/api/landmarks/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 12)

    def test_unpublished_hidden(self):
        Landmark.objects.filter(slug="sarazm").update(is_published=False)
        slugs = [item["slug"] for item in self.client.get("/api/landmarks/").json()]
        self.assertNotIn("sarazm", slugs)
        self.assertEqual(self.client.get("/api/landmarks/sarazm/").status_code, 404)

    def test_filter_by_category(self):
        data = self.client.get("/api/landmarks/?category=lakes").json()
        self.assertTrue(data)
        self.assertTrue(all(item["category"] == "lakes" for item in data))

    def test_language_param_and_header(self):
        tg = self.client.get("/api/landmarks/hisor-fortress/").json()
        ru = self.client.get("/api/landmarks/hisor-fortress/?lang=ru").json()
        en = self.client.get("/api/landmarks/hisor-fortress/", HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.9").json()
        self.assertEqual(tg["name"], "Қалъаи Ҳисор")
        self.assertEqual(ru["name"], "Гиссарская крепость")
        self.assertEqual(en["name"], "Hisor Fortress")

    def test_detail_includes_relations(self):
        data = self.client.get("/api/landmarks/sarazm/?lang=en").json()
        self.assertEqual([e["year"] for e in data["eras"]], [-3500, 2026])
        self.assertIn("hotspots", data)
        self.assertEqual(data["category"]["slug"], "history")
        fortress = self.client.get("/api/landmarks/hisor-fortress/").json()
        self.assertEqual(len(fortress["hotspots"]), 3)

    def test_categories_have_counts(self):
        data = {c["slug"]: c for c in self.client.get("/api/categories/?lang=en").json()}
        self.assertEqual(data["lakes"]["name"], "Lakes")
        self.assertEqual(data["lakes"]["landmark_count"], 3)

    def test_api_is_read_only(self):
        self.assertEqual(self.client.post("/api/landmarks/", {}).status_code, 405)

    def test_seed_is_idempotent_and_keeps_edits(self):
        Landmark.objects.filter(slug="sarazm").update(subtitle_en="My own text")
        call_command("seed_landmarks", verbosity=0)
        self.assertEqual(Landmark.objects.count(), 12)
        self.assertEqual(Landmark.objects.get(slug="sarazm").subtitle_en, "My own text")


class GeoTests(TestCase):
    def test_projection_centre_and_corners(self):
        centre = geo.project((geo.LAT_MIN + geo.LAT_MAX) / 2, (geo.LON_MIN + geo.LON_MAX) / 2)
        self.assertAlmostEqual(centre.x, 0, places=3)
        self.assertAlmostEqual(centre.z, 0, places=3)
        north_east = geo.project(geo.LAT_MAX, geo.LON_MAX)
        self.assertAlmostEqual(north_east.x, geo.MAP_WIDTH / 2, places=3)
        self.assertAlmostEqual(north_east.z, -geo.MAP_DEPTH / 2, places=3)

    def test_matches_frontend_bounds_file(self):
        bounds_file = Path(__file__).resolve().parents[3] / "frontend" / "public" / "terrain" / "bounds.json"
        if not bounds_file.exists():
            self.skipTest("terrain not built")
        bounds = json.loads(bounds_file.read_text())
        self.assertEqual(bounds["lonMin"], geo.LON_MIN)
        self.assertEqual(bounds["latMax"], geo.LAT_MAX)
        self.assertAlmostEqual(bounds["mapDepth"], geo.MAP_DEPTH, places=3)
        self.assertAlmostEqual(bounds["heightScale"], geo.HEIGHT_SCALE, places=8)
