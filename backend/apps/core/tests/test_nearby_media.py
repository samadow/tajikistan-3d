from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core import nearby_media

COMMONS = {
    "query": {
        "pages": {
            "1": {
                "pageid": 1,
                "title": "File:Rudaki Avenue.jpg",
                "coordinates": [{"lat": 38.56, "lon": 68.78}],
                "imageinfo": [
                    {
                        "mime": "image/jpeg",
                        "url": "https://upload.wikimedia.org/a.jpg",
                        "thumburl": "https://upload.wikimedia.org/thumb/330px-a.jpg",
                        "descriptionurl": "https://commons.wikimedia.org/wiki/File:Rudaki_Avenue.jpg",
                        "width": 2000,
                        "height": 1500,
                        "extmetadata": {
                            "Artist": {"value": '<a href="x">Jane Doe</a>'},
                            "LicenseShortName": {"value": "CC BY-SA 4.0"},
                            "DateTimeOriginal": {"value": "Taken on 12 May 2009"},
                        },
                    }
                ],
            },
            "2": {
                "pageid": 2,
                "title": "File:Sphere.jpg",
                "coordinates": [{"lat": 38.5601, "lon": 68.7801}],
                "templates": [{"title": "Template:Pano360"}],
                "imageinfo": [
                    {
                        "mime": "image/jpeg",
                        "url": "https://upload.wikimedia.org/s.jpg",
                        "thumburl": "https://upload.wikimedia.org/thumb/330px-s.jpg",
                        "descriptionurl": "https://commons.wikimedia.org/wiki/File:Sphere.jpg",
                        "width": 8000,
                        "height": 4000,
                        "extmetadata": {},
                    }
                ],
            },
            "3": {"pageid": 3, "title": "File:Map.svg", "imageinfo": [{"mime": "image/svg+xml"}]},
        }
    }
}


def fake_fetch(url):
    if "commons.wikimedia.org" in url:
        return COMMONS
    if "panoramax" in url:
        raise OSError("network down")
    raise AssertionError(url)


@override_settings(MAPILLARY_TOKEN="", ARCGIS_API_KEY="")
class NearbyMediaTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_merges_sources_and_marks_panoramas(self):
        with mock.patch.object(nearby_media, "fetch_json", side_effect=fake_fetch) as fetch:
            res = self.client.get("/api/v1/nearby-media/", {"lat": 38.56, "lon": 68.78, "radius": 1000})
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual([p["id"] for p in data["panoramas"]], ["commons:2"])
            self.assertEqual(data["panoramas"][0]["full"], "https://upload.wikimedia.org/thumb/3840px-s.jpg")
            self.assertEqual(data["photos"][0]["author"], "Jane Doe")  # HTML stripped
            self.assertEqual(len(data["photos"]), 1)  # SVG skipped
            self.assertEqual(data["photos"][0]["date"], "2009")
            self.assertEqual(data["sources_failed"], ["panoramax"])
            self.assertFalse(data["mapillary_enabled"])
            # Second call is served from the cache.
            self.client.get("/api/v1/nearby-media/", {"lat": 38.56, "lon": 68.78, "radius": 1000})
            self.assertEqual(fetch.call_count, 2)

    def test_validates_query(self):
        res = self.client.get("/api/v1/nearby-media/", {"lat": 200, "lon": 68})
        self.assertEqual(res.status_code, 400)

    def test_map_config_defaults_to_open_imagery(self):
        data = self.client.get("/api/v1/map-config/").json()
        self.assertFalse(data["satellite"]["high_resolution"])
        self.assertIn("eox.at", data["satellite"]["tiles"][0])
        self.assertEqual(data["mapillary_token"], "")

    @override_settings(ARCGIS_API_KEY="k123")
    def test_map_config_uses_arcgis_key(self):
        data = self.client.get("/api/v1/map-config/").json()
        self.assertTrue(data["satellite"]["high_resolution"])
        self.assertTrue(data["satellite"]["tiles"][0].endswith("token=k123"))
