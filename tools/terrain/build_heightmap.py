"""Build the terrain assets used by the 3D map.

Outputs (into frontend/public/terrain/):
  terrain.png      RGB, equirectangular. R/G = 16-bit normalised elevation (hi/lo byte),
                   B = soft country mask (255 inside Tajikistan, 0 outside).
  terrain-low.png  Same at half resolution for phones.
  bounds.json      Projection constants (kept in sync with backend/landmarks/geo.py).
  border.json      Simplified country border as [[lon, lat], ...] rings.

Data sources (attribution is shown in the site footer):
  * Elevation: AWS Terrain Tiles (Terrarium encoding), open data —
    https://registry.opendata.aws/terrain-tiles/ (SRTM, GMTED, ETOPO and others).
  * Border: Natural Earth 1:50m admin-0 countries, public domain.

Usage:
  python -m venv .venv && .venv/Scripts/pip install pillow numpy
  .venv/Scripts/python tools/terrain/build_heightmap.py
"""
from __future__ import annotations

import io
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "public" / "terrain"
CACHE = Path(__file__).resolve().parent / ".cache"

# Must match backend/landmarks/geo.py
LON_MIN, LON_MAX = 67.2, 75.3
LAT_MIN, LAT_MAX = 36.5, 41.2
MAP_WIDTH = 100.0
VERTICAL_EXAGGERATION = 3.0

ZOOM = 8
OUT_WIDTH = 1024
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
BORDER_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_50m_admin_0_countries.geojson"
)
USER_AGENT = "terrain-build-script/1.0"


def fetch(url: str, cache_name: str) -> bytes:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / cache_name
    if path.exists():
        return path.read_bytes()
    print("  downloading", url)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = res.read()
    path.write_bytes(data)
    return data


def lon_to_tile_x(lon: float, z: int) -> float:
    return (lon + 180) / 360 * 2**z


def lat_to_tile_y(lat: float, z: int) -> float:
    rad = math.radians(lat)
    return (1 - math.asinh(math.tan(rad)) / math.pi) / 2 * 2**z


def build_mosaic() -> tuple[np.ndarray, int, int]:
    """Download Terrarium tiles covering the bounds and decode them to metres."""
    x0, x1 = int(lon_to_tile_x(LON_MIN, ZOOM)), int(lon_to_tile_x(LON_MAX, ZOOM))
    y0, y1 = int(lat_to_tile_y(LAT_MAX, ZOOM)), int(lat_to_tile_y(LAT_MIN, ZOOM))
    w, h = (x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256
    mosaic = np.zeros((h, w), dtype=np.float32)
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            raw = fetch(TILE_URL.format(z=ZOOM, x=tx, y=ty), f"t{ZOOM}_{tx}_{ty}.png")
            rgb = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"), dtype=np.float32)
            elev = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
            mosaic[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = elev
    return mosaic, x0, y0


def resample(mosaic: np.ndarray, x0: int, y0: int, width: int, height: int) -> np.ndarray:
    """Bilinear resample from Web-Mercator tiles to the equirectangular output grid."""
    lons = np.linspace(LON_MIN, LON_MAX, width)
    lats = np.linspace(LAT_MAX, LAT_MIN, height)  # row 0 = north
    px = (lon_to_tile_x_arr(lons) - x0) * 256
    py = (lat_to_tile_y_arr(lats) - y0) * 256
    gx, gy = np.meshgrid(px, py)
    ix, iy = np.floor(gx).astype(int), np.floor(gy).astype(int)
    fx, fy = gx - ix, gy - iy
    ix = np.clip(ix, 0, mosaic.shape[1] - 2)
    iy = np.clip(iy, 0, mosaic.shape[0] - 2)
    a, b = mosaic[iy, ix], mosaic[iy, ix + 1]
    c, d = mosaic[iy + 1, ix], mosaic[iy + 1, ix + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def lon_to_tile_x_arr(lon: np.ndarray) -> np.ndarray:
    return (lon + 180) / 360 * 2**ZOOM


def lat_to_tile_y_arr(lat: np.ndarray) -> np.ndarray:
    rad = np.radians(lat)
    return (1 - np.arcsinh(np.tan(rad)) / np.pi) / 2 * 2**ZOOM


def load_border() -> list[list[tuple[float, float]]]:
    data = json.loads(fetch(BORDER_URL, "ne_50m_countries.geojson"))
    for feature in data["features"]:
        props = feature["properties"]
        if props.get("ISO_A3") == "TJK" or props.get("ADM0_A3") == "TJK":
            geom = feature["geometry"]
            polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
            return [[(float(x), float(y)) for x, y in poly[0]] for poly in polys]
    raise SystemExit("Tajikistan not found in Natural Earth data")


def simplify(points: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Ramer–Douglas–Peucker line simplification."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    dmax, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, index = d, i
    if dmax > tol:
        return simplify(points[: index + 1], tol)[:-1] + simplify(points[index:], tol)
    return [points[0], points[-1]]


def simplify_ring(ring: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """RDP on a closed ring: split it in two so the endpoints are not identical."""
    mid = len(ring) // 2
    return simplify(ring[: mid + 1], tol)[:-1] + simplify(ring[mid:], tol)


def rasterize_mask(rings, width: int, height: int) -> np.ndarray:
    img = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(img)
    for ring in rings:
        draw.polygon(
            [((lon - LON_MIN) / (LON_MAX - LON_MIN) * (width - 1),
              (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * (height - 1)) for lon, lat in ring],
            fill=255,
        )
    img = img.filter(ImageFilter.GaussianBlur(radius=width / 400))
    return np.asarray(img, dtype=np.uint8)


def encode(elev: np.ndarray, mask: np.ndarray, e_min: float, e_max: float) -> Image.Image:
    norm = np.clip((elev - e_min) / (e_max - e_min), 0, 1)
    # Quantise to 4096 levels (~1.8 m) — invisible on screen, but compresses ~2x better.
    v = (np.round(norm * 4095) * 16).astype(np.uint16)
    rgb = np.stack([(v >> 8).astype(np.uint8), (v & 255).astype(np.uint8), mask], axis=-1)
    return Image.fromarray(rgb, "RGB")


def main() -> None:
    lat_mid = (LAT_MIN + LAT_MAX) / 2
    width_km = (LON_MAX - LON_MIN) * 111.32 * math.cos(math.radians(lat_mid))
    depth_km = (LAT_MAX - LAT_MIN) * 111.32
    map_depth = MAP_WIDTH * depth_km / width_km
    km_per_unit = width_km / MAP_WIDTH
    height_scale = VERTICAL_EXAGGERATION / (km_per_unit * 1000)
    out_height = round(OUT_WIDTH * depth_km / width_km)

    print("Fetching elevation tiles…")
    mosaic, x0, y0 = build_mosaic()
    elev = resample(mosaic, x0, y0, OUT_WIDTH, out_height)
    elev = np.maximum(elev, 0)  # no bathymetry
    e_min, e_max = float(np.floor(elev.min())), float(np.ceil(elev.max()))
    print(f"  elevation range {e_min:.0f} … {e_max:.0f} m")

    print("Building border mask…")
    rings = load_border()
    mask = rasterize_mask(rings, OUT_WIDTH, out_height)

    OUT.mkdir(parents=True, exist_ok=True)
    full = encode(elev, mask, e_min, e_max)
    full.save(OUT / "terrain.png", optimize=True)
    full.resize((OUT_WIDTH // 2, out_height // 2), Image.Resampling.BILINEAR).save(OUT / "terrain-low.png", optimize=True)

    border = [[[round(lon, 4), round(lat, 4)] for lon, lat in simplify_ring(ring, 0.01)] for ring in rings]
    (OUT / "border.json").write_text(json.dumps(border, separators=(",", ":")))
    bounds = {
        "lonMin": LON_MIN, "lonMax": LON_MAX, "latMin": LAT_MIN, "latMax": LAT_MAX,
        "mapWidth": MAP_WIDTH, "mapDepth": round(map_depth, 6),
        "heightScale": round(height_scale, 10), "verticalExaggeration": VERTICAL_EXAGGERATION,
        "elevationMin": e_min, "elevationMax": e_max,
        "imageWidth": OUT_WIDTH, "imageHeight": out_height,
        "attribution": "Elevation: AWS Terrain Tiles (Mapzen/SRTM et al.). Border: Natural Earth.",
    }
    (OUT / "bounds.json").write_text(json.dumps(bounds, indent=2))
    for f in sorted(OUT.iterdir()):
        print(f"  {f.name:16s} {f.stat().st_size / 1024:8.0f} KB")
    print("Done.")


if __name__ == "__main__":
    sys.exit(main())
