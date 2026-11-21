"""Geographic projection shared by the backend, the terrain build script and the frontend.

The 3D map is a flat plane centred at the origin:
  * +X points east, -Z points north (three.js convention: camera looks down -Z),
  * Y is elevation, exaggerated so the Pamirs read dramatically.

We use a simple equirectangular projection with a cosine correction at the
mid latitude. Over a country-sized area the distortion is negligible, and it
is trivial to reproduce in TypeScript (frontend/src/lib/geo.ts) and Python
(tools/terrain/build_heightmap.py). Keep the three implementations in sync;
`landmarks.tests.test_geo` checks the generated bounds.json against these values.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

# Geographic extent of the rendered terrain (a little wider than the country border).
LON_MIN, LON_MAX = 67.2, 75.3
LAT_MIN, LAT_MAX = 36.5, 41.2

MAP_WIDTH = 100.0  # world units across the east-west extent
VERTICAL_EXAGGERATION = 3.0

_LAT_MID = (LAT_MIN + LAT_MAX) / 2
_KM_PER_DEG = 111.32
_WIDTH_KM = (LON_MAX - LON_MIN) * _KM_PER_DEG * math.cos(math.radians(_LAT_MID))
_DEPTH_KM = (LAT_MAX - LAT_MIN) * _KM_PER_DEG

MAP_DEPTH = MAP_WIDTH * _DEPTH_KM / _WIDTH_KM
KM_PER_UNIT = _WIDTH_KM / MAP_WIDTH
# World units per metre of real elevation (includes exaggeration).
HEIGHT_SCALE = VERTICAL_EXAGGERATION / (KM_PER_UNIT * 1000)


@dataclass(frozen=True)
class Vec3:
    x: float
    y: float
    z: float


def project(lat: float, lon: float, elevation_m: float = 0.0) -> Vec3:
    """Convert WGS84 latitude/longitude/elevation into map world coordinates."""
    u = (lon - LON_MIN) / (LON_MAX - LON_MIN)  # 0..1 west -> east
    v = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)  # 0..1 south -> north
    return Vec3(
        x=round((u - 0.5) * MAP_WIDTH, 4),
        y=round(elevation_m * HEIGHT_SCALE, 4),
        z=round((0.5 - v) * MAP_DEPTH, 4),
    )


def default_camera(target: Vec3) -> tuple[Vec3, Vec3]:
    """A pleasant fly-to framing: south of the target, looking north and down."""
    distance = 9.0
    position = Vec3(
        x=round(target.x + distance * 0.35, 4),
        y=round(target.y + distance * 0.75, 4),
        z=round(target.z + distance * 0.85, 4),
    )
    return position, target
