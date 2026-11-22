"""Geographic projection: WGS84 lat/lon/elevation → 3D map world coordinates.

The constants live in ``shared/projection.json``, the single source of truth
read by this module, by ``tools/terrain/build_heightmap.py`` and (through the
generated ``frontend/public/terrain/bounds.json``) by the frontend. See ADR-3/4
in ARCHITECTURE.md.

World axes (three.js convention):
  +X east, -Z north, +Y up. Elevation is exaggerated so the Pamirs read clearly.

Projection: equirectangular with a cosine correction at the mid latitude —
negligible distortion over ~700 km, trivially reproducible in TypeScript.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_DEFAULT_FILE = Path(__file__).resolve().parents[3] / "shared" / "projection.json"
_KM_PER_DEG = 111.32


@dataclass(frozen=True)
class Projection:
    lon_min: float
    lon_max: float
    lat_min: float
    lat_max: float
    map_width: float
    vertical_exaggeration: float

    @property
    def width_km(self) -> float:
        lat_mid = (self.lat_min + self.lat_max) / 2
        return (self.lon_max - self.lon_min) * _KM_PER_DEG * math.cos(math.radians(lat_mid))

    @property
    def depth_km(self) -> float:
        return (self.lat_max - self.lat_min) * _KM_PER_DEG

    @property
    def map_depth(self) -> float:
        return self.map_width * self.depth_km / self.width_km

    @property
    def km_per_unit(self) -> float:
        return self.width_km / self.map_width

    @property
    def height_scale(self) -> float:
        """World units per metre of real elevation (includes exaggeration)."""
        return self.vertical_exaggeration / (self.km_per_unit * 1000)


@dataclass(frozen=True)
class Vec3:
    x: float
    y: float
    z: float


@lru_cache(maxsize=1)
def projection() -> Projection:
    path = Path(os.environ.get("PROJECTION_FILE", _DEFAULT_FILE))
    data = json.loads(path.read_text(encoding="utf-8"))
    return Projection(
        lon_min=data["lonMin"],
        lon_max=data["lonMax"],
        lat_min=data["latMin"],
        lat_max=data["latMax"],
        map_width=data["mapWidth"],
        vertical_exaggeration=data["verticalExaggeration"],
    )


def project(lat: float, lon: float, elevation_m: float = 0.0) -> Vec3:
    """Convert WGS84 latitude/longitude/elevation into map world coordinates."""
    p = projection()
    u = (lon - p.lon_min) / (p.lon_max - p.lon_min)  # 0..1 west → east
    v = (lat - p.lat_min) / (p.lat_max - p.lat_min)  # 0..1 south → north
    return Vec3(
        x=round((u - 0.5) * p.map_width, 4),
        y=round(elevation_m * p.height_scale, 4),
        z=round((0.5 - v) * p.map_depth, 4),
    )


def unproject(x: float, z: float) -> tuple[float, float]:
    """Inverse of :func:`project` for x/z → (lat, lon)."""
    p = projection()
    lon = p.lon_min + (x / p.map_width + 0.5) * (p.lon_max - p.lon_min)
    lat = p.lat_min + (0.5 - z / p.map_depth) * (p.lat_max - p.lat_min)
    return lat, lon


def in_bounds(lat: float, lon: float) -> bool:
    p = projection()
    return p.lat_min <= lat <= p.lat_max and p.lon_min <= lon <= p.lon_max


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    r = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def default_camera(target: Vec3) -> tuple[Vec3, Vec3]:
    """A pleasant fly-to framing: south-east of the target, looking north-west and down."""
    distance = 9.0
    position = Vec3(
        x=round(target.x + distance * 0.35, 4),
        y=round(target.y + distance * 0.75, 4),
        z=round(target.z + distance * 0.85, 4),
    )
    return position, target
