import json
from pathlib import Path

from django.test import SimpleTestCase

from apps.core import geo

REPO = Path(__file__).resolve().parents[4]
PROJECTION = json.loads((REPO / "shared" / "projection.json").read_text(encoding="utf-8"))


class ProjectionContractTests(SimpleTestCase):
    """The same fixtures are asserted by frontend/src/lib/geo.test.ts (ADR-3)."""

    def test_shared_fixtures(self):
        for fx in PROJECTION["fixtures"]:
            with self.subTest(fx["name"]):
                p = geo.project(fx["lat"], fx["lon"], fx["elevation"])
                self.assertAlmostEqual(p.x, fx["x"], places=3)
                self.assertAlmostEqual(p.y, fx["y"], places=3)
                self.assertAlmostEqual(p.z, fx["z"], places=3)

    def test_unproject_is_inverse(self):
        for fx in PROJECTION["fixtures"]:
            p = geo.project(fx["lat"], fx["lon"])
            lat, lon = geo.unproject(p.x, p.z)
            self.assertAlmostEqual(lat, fx["lat"], places=3)
            self.assertAlmostEqual(lon, fx["lon"], places=3)

    def test_generated_bounds_match_contract(self):
        bounds_file = REPO / "frontend" / "public" / "terrain" / "bounds.json"
        if not bounds_file.exists():
            self.skipTest("terrain assets not built")
        bounds = json.loads(bounds_file.read_text(encoding="utf-8"))
        proj = geo.projection()
        self.assertEqual(bounds["lonMin"], proj.lon_min)
        self.assertEqual(bounds["latMax"], proj.lat_max)
        self.assertAlmostEqual(bounds["mapDepth"], proj.map_depth, places=4)
        self.assertAlmostEqual(bounds["heightScale"], proj.height_scale, places=8)

    def test_haversine(self):
        # Dushanbe → Khujand is roughly 190 km as the crow flies.
        d = geo.haversine_km(38.5731, 68.7864, 40.2848, 69.6168)
        self.assertGreater(d, 180)
        self.assertLess(d, 210)
        self.assertEqual(geo.haversine_km(38, 70, 38, 70), 0)

    def test_in_bounds(self):
        self.assertTrue(geo.in_bounds(38.5, 68.8))
        self.assertFalse(geo.in_bounds(51.5, -0.1))  # London
