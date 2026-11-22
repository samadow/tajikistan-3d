from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.landmarks.models import Landmark
from apps.stories.models import Story

API = "/api/v1"


class ApiTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_landmarks", verbosity=0)

    def setUp(self):
        cache.clear()
        self.client = APIClient()


class MapAndCatalogueTests(ApiTestCase):
    def test_map_is_light_and_complete(self):
        res = self.client.get(f"{API}/landmarks/map/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 15)
        first = data[0]
        self.assertIn("position", first)
        self.assertIn("camera", first)
        for heavy in ("full_description", "images", "hotspots", "eras", "models"):
            self.assertNotIn(heavy, first)

    def test_catalogue_is_paginated(self):
        data = self.client.get(f"{API}/landmarks/?page_size=5").json()
        self.assertEqual(data["count"], 15)
        self.assertEqual(len(data["results"]), 5)
        self.assertIsNotNone(data["next"])

    def test_search_in_any_language(self):
        ru = self.client.get(f"{API}/landmarks/?search=крепость").json()["results"]
        self.assertTrue(ru)
        self.assertTrue(all(r["category"]["slug"] in ("architecture", "history") for r in ru))
        en = self.client.get(f"{API}/landmarks/?search=Karakul&lang=en").json()["results"]
        self.assertEqual([r["slug"] for r in en], ["karakul-lake"])

    def test_filter_by_category_and_featured(self):
        lakes = self.client.get(f"{API}/landmarks/map/?category=lakes").json()
        self.assertTrue(lakes and all(l["category"] == "lakes" for l in lakes))
        featured = self.client.get(f"{API}/landmarks/featured/").json()
        self.assertTrue(featured and all(f["is_featured"] for f in featured))

    def test_unpublished_hidden_everywhere(self):
        Landmark.objects.filter(slug="sarazm").update(is_published=False)
        slugs = [l["slug"] for l in self.client.get(f"{API}/landmarks/map/").json()]
        self.assertNotIn("sarazm", slugs)
        self.assertEqual(self.client.get(f"{API}/landmarks/sarazm/").status_code, 404)
        self.assertNotIn("sarazm", [e["landmark"]["slug"] for e in self.client.get(f"{API}/eras/").json()])

    def test_nearby_sorted_by_distance(self):
        # From Dushanbe: Hisor Fortress (~20 km) must come before Nurek (~70 km).
        res = self.client.get(f"{API}/landmarks/nearby/?lat=38.5731&lon=68.7864&radius_km=100&exclude=dushanbe")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        slugs = [d["slug"] for d in data]
        self.assertNotIn("dushanbe", slugs)
        self.assertLess(slugs.index("hisor-fortress"), slugs.index("nurek-reservoir"))
        distances = [d["distance_km"] for d in data]
        self.assertEqual(distances, sorted(distances))
        self.assertTrue(all(d <= 100 for d in distances))

    def test_nearby_validates_input(self):
        self.assertEqual(self.client.get(f"{API}/landmarks/nearby/").status_code, 400)
        self.assertEqual(self.client.get(f"{API}/landmarks/nearby/?lat=200&lon=10").status_code, 400)


class DetailTests(ApiTestCase):
    def test_detail_has_relations_and_sources(self):
        data = self.client.get(f"{API}/landmarks/sarazm/?lang=en").json()
        self.assertEqual(data["category"]["slug"], "history")
        self.assertEqual(data["coordinates_source"], "Wikidata Q422929")
        self.assertEqual([e["year"] for e in data["eras"]], [-4000, 2026])
        self.assertEqual(data["eras"][0]["sources"][0]["publisher"], "UNESCO World Heritage Centre")
        self.assertEqual(data["sources"][0]["url"], "https://whc.unesco.org/en/list/1141/")
        self.assertEqual(data["models"], [])

    def test_eras_and_stories_subresources(self):
        eras = self.client.get(f"{API}/landmarks/sarazm/eras/").json()
        self.assertEqual(len(eras), 2)
        stories = self.client.get(f"{API}/landmarks/sarazm/stories/").json()
        self.assertEqual([s["slug"] for s in stories], ["grand-tour"])

    def test_fortress_hotspots(self):
        data = self.client.get(f"{API}/landmarks/hisor-fortress/").json()
        self.assertEqual(len(data["hotspots"]), 3)
        self.assertEqual(set(data["hotspots"][0]["position"]), {"x", "y", "z"})

    def test_unknown_slug_404(self):
        self.assertEqual(self.client.get(f"{API}/landmarks/atlantis/").status_code, 404)


class LanguageTests(ApiTestCase):
    def test_param_and_header(self):
        self.assertEqual(self.client.get(f"{API}/landmarks/hisor-fortress/").json()["name"], "Қалъаи Ҳисор")
        self.assertEqual(self.client.get(f"{API}/landmarks/hisor-fortress/?lang=ru").json()["name"], "Гиссарская крепость")
        res = self.client.get(f"{API}/landmarks/hisor-fortress/", HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.9")
        self.assertEqual(res.json()["name"], "Hisor Fortress")
        self.assertEqual(res["Content-Language"], "en")
        self.assertIn("Accept-Language", res["Vary"])

    def test_fallback_order_tg_ru_en(self):
        Landmark.objects.filter(slug="sarazm").update(subtitle_en="", subtitle_ru="Только по-русски")
        en = self.client.get(f"{API}/landmarks/sarazm/?lang=en").json()
        # English is empty → falls back to Tajik first.
        self.assertEqual(en["subtitle"], "Шаҳраки бостонӣ дар водии Зарафшон")
        Landmark.objects.filter(slug="sarazm").update(subtitle_tg="")
        cache.clear()
        en = self.client.get(f"{API}/landmarks/sarazm/?lang=en").json()
        self.assertEqual(en["subtitle"], "Только по-русски")

    def test_categories_translated_with_counts(self):
        data = {c["slug"]: c for c in self.client.get(f"{API}/categories/?lang=en").json()}
        self.assertEqual(data["lakes"]["name"], "Lakes")
        self.assertEqual(data["lakes"]["landmark_count"], 3)


class OtherEndpointsTests(ApiTestCase):
    def test_eras_timeline_sorted(self):
        years = [e["year"] for e in self.client.get(f"{API}/eras/").json()]
        self.assertEqual(years, sorted(years))

    def test_story_detail(self):
        data = self.client.get(f"{API}/stories/grand-tour/?lang=en").json()
        self.assertEqual(data["title"], "The grand tour")
        self.assertEqual(len(data["steps"]), 15)
        self.assertEqual(data["steps"][0]["title"], "Sarazm")  # falls back to the landmark name
        self.assertIsNone(data["steps"][0]["camera"])

    def test_story_hides_unpublished_landmarks(self):
        Landmark.objects.filter(slug="sarazm").update(is_published=False)
        steps = self.client.get(f"{API}/stories/grand-tour/").json()["steps"]
        self.assertEqual(len(steps), 14)

    def test_about_page(self):
        data = self.client.get(f"{API}/pages/about/?lang=ru").json()
        self.assertEqual(data["title"], "О Таджикистане")

    def test_read_only(self):
        for url in (f"{API}/landmarks/", f"{API}/stories/", f"{API}/categories/"):
            self.assertEqual(self.client.post(url, {}).status_code, 405)

    def test_openapi_schema(self):
        res = self.client.get(f"{API}/schema/")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"/api/v1/landmarks/map/", res.content)

    def test_health(self):
        self.assertEqual(self.client.get("/health/").json(), {"status": "ok", "database": "ok"})


class CacheTests(ApiTestCase):
    def test_hit_then_invalidated_by_edit(self):
        url = f"{API}/landmarks/sarazm/?lang=en"
        first = self.client.get(url)
        self.assertNotIn("X-Cache", first)
        second = self.client.get(url)
        self.assertEqual(second["X-Cache"], "HIT")
        self.assertEqual(second.json(), first.json())

        landmark = Landmark.objects.get(slug="sarazm")
        landmark.subtitle_en = "Edited in the admin"
        landmark.save()
        third = self.client.get(url)
        self.assertNotIn("X-Cache", third)
        self.assertEqual(third.json()["subtitle"], "Edited in the admin")

    def test_languages_cached_separately(self):
        self.client.get(f"{API}/landmarks/map/?lang=en")
        ru = self.client.get(f"{API}/landmarks/map/", HTTP_ACCEPT_LANGUAGE="ru")
        self.assertEqual(ru.json()[0]["name"], "Саразм")
        self.assertEqual(ru["Content-Language"], "ru")


class SeedTests(ApiTestCase):
    def test_idempotent_and_keeps_edits(self):
        Landmark.objects.filter(slug="sarazm").update(subtitle_en="My own text")
        call_command("seed_landmarks", verbosity=0)
        self.assertEqual(Landmark.objects.count(), 15)
        self.assertEqual(Story.objects.count(), 1)
        self.assertEqual(Landmark.objects.get(slug="sarazm").subtitle_en, "My own text")
        self.assertEqual(Landmark.objects.get(slug="sarazm").eras.count(), 2)

    def test_every_landmark_has_a_coordinate_source(self):
        self.assertFalse(Landmark.objects.filter(coordinates_source="").exists())


class TerrainAssetTests(ApiTestCase):
    """Generated terrain assets must cover the seeded content (tools/terrain/build_heightmap.py)."""

    def test_every_landmark_has_a_detail_patch(self):
        import json
        from pathlib import Path

        index = Path(__file__).resolve().parents[4] / "frontend" / "public" / "terrain" / "patches.json"
        if not index.exists():
            self.skipTest("terrain assets not built")
        patches = json.loads(index.read_text(encoding="utf-8"))
        for landmark in Landmark.objects.all():
            with self.subTest(landmark.slug):
                self.assertIn(landmark.slug, patches)
                p = patches[landmark.slug]
                self.assertTrue(p["lonMin"] < float(landmark.longitude) < p["lonMax"])
                self.assertTrue(p["latMin"] < float(landmark.latitude) < p["latMax"])
