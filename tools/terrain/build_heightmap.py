"""Build every geographic asset used by the 3D experience.

Outputs (frontend/public/terrain/):
  terrain.png / terrain-low.png   RGB. R/G = 12-bit normalised elevation (hi/lo byte),
                                  B = soft country mask. 1024 / 512 px wide.
  terrain-color.webp / -low.webp  Albedo texture: hypsometric tint, baked hillshade,
                                  slope/aspect-aware snow, lakes and rivers, dimmed
                                  neighbouring countries. 2048 / 1024 px wide.
  water.json                      Lakes (rings + surface elevation) and rivers (lines), lon/lat.
  border.json                     Simplified country border rings, lon/lat.
  bounds.json                     Projection constants + elevation range (for the frontend).
  patches/<slug>.png|webp         High-resolution detail around each landmark (zoom 11).
  patches.json                    Index of patches: lon/lat bounds + elevation range.
  globe.webp                      Stylised Earth for the intro (equirectangular).

Sources (credited in the site footer and README):
  * AWS Terrain Tiles (Terrarium) — SRTM, GMTED, ETOPO1 and others; open data.
  * Natural Earth (public domain) — border (1:50m), lakes and rivers (1:10m), land (1:110m).
  * OpenStreetMap (© OpenStreetMap contributors, ODbL) — named lakes, reservoirs and rivers
    via the Overpass API. Falls back to Natural Earth if Overpass is unavailable.

The projection comes from shared/projection.json (ADR-3). Landmarks for the
detail patches come from the running API (--api) or shared/landmarks.json.

Usage:
  python -m venv tools/.venv && tools/.venv/Scripts/pip install -r tools/terrain/requirements.txt
  tools/.venv/Scripts/python tools/terrain/build_heightmap.py [--api http://127.0.0.1:8000] [--skip-patches]
"""
from __future__ import annotations

import argparse
import io
import json
import math
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "public" / "terrain"
CACHE = Path(__file__).resolve().parent / ".cache"
PROJECTION = json.loads((ROOT / "shared" / "projection.json").read_text(encoding="utf-8"))
LANDMARKS_SNAPSHOT = ROOT / "shared" / "landmarks.json"

LON_MIN, LON_MAX = PROJECTION["lonMin"], PROJECTION["lonMax"]
LAT_MIN, LAT_MAX = PROJECTION["latMin"], PROJECTION["latMax"]
MAP_WIDTH = PROJECTION["mapWidth"]
EXAGGERATION = PROJECTION["verticalExaggeration"]

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{name}.geojson"
USER_AGENT = "terrain-build-script/1.0"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
OSM_LAKES_QUERY = (
    '[out:json][timeout:180];(way["natural"="water"]["name"](36.6,67.3,41.1,75.2);'
    'relation["natural"="water"]["name"](36.6,67.3,41.1,75.2););out geom;'
)
OSM_RIVERS_QUERY = (
    '[out:json][timeout:240];area["ISO3166-1"="TJ"][admin_level=2]->.a;'
    'way["waterway"="river"]["name"](area.a);out geom;'
)
MIN_LAKE_KM2 = 0.25      # smaller water bodies are not drawn at all
MESH_LAKE_KM2 = 2.0      # lakes at least this big also get a 3D water surface
MAJOR_RIVER_KM = 100.0   # rivers at least this long go to water.json (drawn as lines)

MAIN_ZOOM = 9
PATCH_ZOOM = 11
PATCH_HALF_KM = 12.0  # each patch covers ~24 × 24 km
PATCH_HEIGHT_PX = 256
PATCH_COLOR_PX = 512


# --------------------------------------------------------------------------- IO
def fetch(url: str, cache_name: str) -> bytes:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / cache_name
    if path.exists() and path.stat().st_size > 0:
        return path.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for _ in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                data = res.read()
            path.write_bytes(data)
            return data
        except OSError as exc:  # network hiccup — retry
            print(f"  retry {cache_name}: {exc}")
    raise SystemExit(f"Could not download {url}")


def natural_earth(name: str) -> dict:
    cache = {"ne_50m_admin_0_countries": "ne_50m_countries.geojson"}.get(name, f"{name}.geojson")
    return json.loads(fetch(NE_URL.format(name=name), cache))


# ------------------------------------------------------------------- DEM tiles
def tile_x(lon, z):
    return (np.asarray(lon) + 180) / 360 * 2**z


def tile_y(lat, z):
    rad = np.radians(np.asarray(lat))
    return (1 - np.arcsinh(np.tan(rad)) / np.pi) / 2 * 2**z


def dem(lon_min, lon_max, lat_min, lat_max, width, height, zoom) -> np.ndarray:
    """Elevation (m) on an equirectangular grid, row 0 = north, bilinear from Terrarium tiles."""
    x0, x1 = int(tile_x(lon_min, zoom)), int(tile_x(lon_max, zoom))
    y0, y1 = int(tile_y(lat_max, zoom)), int(tile_y(lat_min, zoom))
    jobs = [(tx, ty) for ty in range(y0, y1 + 1) for tx in range(x0, x1 + 1)]

    def load(job):
        tx, ty = job
        raw = fetch(TILE_URL.format(z=zoom, x=tx, y=ty), f"t{zoom}_{tx}_{ty}.png")
        rgb = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"), dtype=np.float32)
        return job, rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768

    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype=np.float32)
    with ThreadPoolExecutor(8) as pool:
        for (tx, ty), elev in pool.map(load, jobs):
            mosaic[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = elev

    px = (tile_x(np.linspace(lon_min, lon_max, width), zoom) - x0) * 256
    py = (tile_y(np.linspace(lat_max, lat_min, height), zoom) - y0) * 256
    gx, gy = np.meshgrid(px, py)
    ix = np.clip(np.floor(gx).astype(int), 0, mosaic.shape[1] - 2)
    iy = np.clip(np.floor(gy).astype(int), 0, mosaic.shape[0] - 2)
    fx, fy = gx - ix, gy - iy
    top = mosaic[iy, ix] * (1 - fx) + mosaic[iy, ix + 1] * fx
    bottom = mosaic[iy + 1, ix] * (1 - fx) + mosaic[iy + 1, ix + 1] * fx
    return np.maximum(top * (1 - fy) + bottom * fy, 0).astype(np.float32)


# -------------------------------------------------------------- vector helpers
def simplify(points, tol):
    """Ramer–Douglas–Peucker (iterative, so long rivers cannot hit the recursion limit)."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = points[a][:2], points[b][:2]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-12
        dmax, index = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i][:2]
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
            if d > dmax:
                dmax, index = d, i
        if dmax > tol and index > 0:
            keep[index] = True
            stack += [(a, index), (index, b)]
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tol):
    mid = len(ring) // 2
    return simplify(ring[: mid + 1], tol)[:-1] + simplify(ring[mid:], tol)


def polygons(geometry):
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    return []


def lines(geometry):
    if geometry["type"] == "LineString":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiLineString":
        return geometry["coordinates"]
    return []


def touches_bounds(coords, pad=0.0):
    return any(LON_MIN - pad <= c[0] <= LON_MAX + pad and LAT_MIN - pad <= c[1] <= LAT_MAX + pad for c in coords)


class Raster:
    """Maps lon/lat to pixel coordinates of an equirectangular image."""

    def __init__(self, lon_min, lon_max, lat_min, lat_max, width, height):
        self.lon_min, self.lon_max, self.lat_min, self.lat_max = lon_min, lon_max, lat_min, lat_max
        self.width, self.height = width, height

    def xy(self, lon, lat):
        return (
            (lon - self.lon_min) / (self.lon_max - self.lon_min) * (self.width - 1),
            (self.lat_max - lat) / (self.lat_max - self.lat_min) * (self.height - 1),
        )


# ------------------------------------------------------------------ shading
def hillshade(elev: np.ndarray, metres_per_px: float, azimuth=245.0, altitude=35.0):
    """Classic hillshade 0..1; light from the WSW like the scene's daytime sun."""
    gy, gx = np.gradient(elev, metres_per_px)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(azimuth), math.radians(altitude)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0, 1), slope, aspect


def ramp(values: np.ndarray, stops: list[tuple[float, str]]) -> np.ndarray:
    xs = [s for s, _ in stops]
    cols = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for _, c in stops], dtype=np.float32) / 255
    return np.stack([np.interp(values, xs, cols[:, k]) for k in range(3)], axis=-1).astype(np.float32)


INSIDE = [(200, "#56703c"), (900, "#7d8346"), (1700, "#a48c58"), (2600, "#977a5d"), (3600, "#85766a"), (4500, "#918780")]
OUTSIDE = [(200, "#0e1836"), (1500, "#17224a"), (3500, "#243058"), (5000, "#3a4672")]
WATER = np.array([0.16, 0.42, 0.58], dtype=np.float32)
WATER_OUTSIDE = np.array([0.08, 0.16, 0.30], dtype=np.float32)


def colourise(elev, mask, metres_per_px, water_mask, river_mask):
    shade, slope, aspect = hillshade(elev, metres_per_px)
    inside = ramp(elev, INSIDE)
    # Snow: above ~4800 m, more on north-facing and gentle slopes, none on cliffs.
    north = (np.cos(aspect) + 1) / 2  # 1 = north-facing
    snow_line = 5200 - north * 500
    snow = (np.clip((elev - snow_line) / 500, 0, 1) * np.clip(1.4 - slope * 1.6, 0, 1))[..., None]
    inside = inside * (1 - snow) + np.array([0.96, 0.95, 0.93], np.float32) * snow
    # Bare rock on steep slopes.
    rock = np.clip((slope - 0.55) * 1.8, 0, 0.6)[..., None] * (1 - snow)
    inside = inside * (1 - rock) + np.array([0.36, 0.32, 0.29], np.float32) * rock
    outside = ramp(elev, OUTSIDE)

    # Baked light: the scene's own sun adds the rest, so the relief still reads at night.
    light = (0.55 + 0.75 * shade)[..., None]
    m = mask[..., None]
    rgb = (inside * m + outside * (1 - m)) * light
    water = np.maximum(water_mask, river_mask)[..., None]
    water_rgb = WATER * m + WATER_OUTSIDE * (1 - m)
    rgb = rgb * (1 - water) + water_rgb * water
    return np.clip(rgb * 255, 0, 255).astype(np.uint8)


def encode_height(elev, mask, e_min, e_max) -> Image.Image:
    # 12-bit quantisation (~1.8 m steps over the country) — invisible on screen, compresses ~2× better.
    v = (np.round(np.clip((elev - e_min) / (e_max - e_min), 0, 1) * 4095) * 16).astype(np.uint16)
    return Image.fromarray(np.stack([(v >> 8).astype(np.uint8), (v & 255).astype(np.uint8), mask], -1), "RGB")


# ------------------------------------------------------------------- water
def overpass(query: str, cache_name: str) -> dict | None:
    path = CACHE / cache_name
    if path.exists() and path.stat().st_size > 0:
        return json.loads(path.read_bytes())
    body = urllib.parse.urlencode({"data": query}).encode()
    for endpoint in OVERPASS * 2:
        try:
            req = urllib.request.Request(endpoint, data=body, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=300) as res:
                raw = res.read()
            path.write_bytes(raw)
            return json.loads(raw)
        except OSError as exc:
            print(f"  overpass {endpoint}: {exc}")
    return None


def ring_area_km2(ring) -> float:
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    kx, ky = 111.32 * math.cos(lat0), 111.32
    area = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        area += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky)
    return abs(area) / 2


def line_km(line) -> float:
    total = 0.0
    for (x1, y1), (x2, y2) in zip(line, line[1:]):
        total += math.hypot((x2 - x1) * 111.32 * math.cos(math.radians(y1)), (y2 - y1) * 111.32)
    return total


def stitch(segments):
    """Join way segments that share endpoints into closed rings (OSM multipolygon outers)."""
    segments = [list(seg) for seg in segments if len(seg) > 1]
    rings = []
    while segments:
        ring = segments.pop()
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, seg in enumerate(segments):
                if seg[0] == ring[-1]:
                    ring += seg[1:]
                elif seg[-1] == ring[-1]:
                    ring += seg[-2::-1]
                elif seg[-1] == ring[0]:
                    ring = seg[:-1] + ring
                elif seg[0] == ring[0]:
                    ring = seg[:0:-1] + ring
                else:
                    continue
                segments.pop(i)
                changed = True
                break
        if len(ring) > 3:
            rings.append(ring)
    return rings


def osm_name(tags: dict) -> str:
    return tags.get("name:en") or tags.get("name") or ""


def load_water():
    """Lakes (rings) and rivers (lines) from OSM, falling back to Natural Earth."""
    lakes, rivers = [], []
    osm_lakes = overpass(OSM_LAKES_QUERY, "osm_lakes.json")
    osm_rivers = overpass(OSM_RIVERS_QUERY, "osm_rivers.json")

    if osm_lakes:
        for el in osm_lakes["elements"]:
            tags = el.get("tags", {})
            if el["type"] == "way" and el.get("geometry"):
                rings = [[(pt["lon"], pt["lat"]) for pt in el["geometry"]]]
            elif el["type"] == "relation":
                outers = [
                    [(pt["lon"], pt["lat"]) for pt in m.get("geometry", [])]
                    for m in el.get("members", []) if m.get("role") == "outer"
                ]
                rings = stitch(outers)
            else:
                continue
            for ring in rings:
                area = ring_area_km2(ring)
                if area >= MIN_LAKE_KM2:
                    lakes.append({"name": osm_name(tags), "ring": ring, "area": area, "flowing": tags.get("water") in ("river", "canal", "stream", "oxbow")})
    # Natural Earth adds the big lakes beyond OSM's coverage here (e.g. outside Tajikistan).
    osm_areas = [lake["area"] for lake in lakes]
    for f in natural_earth("ne_10m_lakes")["features"]:
        for poly in polygons(f["geometry"]):
            ring = [(float(c[0]), float(c[1])) for c in poly[0]]
            if not touches_bounds(ring):
                continue
            area = ring_area_km2(ring)
            if any(abs(area - a) / max(a, 1) < 0.3 for a in osm_areas):
                continue  # same lake already from OSM
            lakes.append({"name": f["properties"].get("name") or "", "ring": ring, "area": area})

    if osm_rivers:
        by_name: dict[str, float] = {}
        for el in osm_rivers["elements"]:
            if el.get("geometry"):
                line = [(pt["lon"], pt["lat"]) for pt in el["geometry"]]
                name = osm_name(el.get("tags", {}))
                by_name[name] = by_name.get(name, 0) + line_km(line)
                rivers.append({"name": name, "line": line})
        for r in rivers:
            r["length_km"] = by_name[r["name"]]
    else:
        for f in natural_earth("ne_10m_rivers_lake_centerlines")["features"]:
            for line in lines(f["geometry"]):
                pts = [(float(c[0]), float(c[1])) for c in line]
                if touches_bounds(pts, 0.2):
                    rivers.append({"name": f["properties"].get("name") or "", "line": pts, "length_km": 300.0})
    return lakes, rivers


def rasterise_water(raster: Raster, lakes, rivers, river_scale=1.0):
    water = Image.new("L", (raster.width, raster.height), 0)
    river = Image.new("L", (raster.width, raster.height), 0)
    dw, dr = ImageDraw.Draw(water), ImageDraw.Draw(river)
    for lake in lakes:
        dw.polygon([raster.xy(x, y) for x, y in lake["ring"]], fill=255)
    for r in rivers:
        # Width and strength by the river's total length: trunk rivers read, creeks whisper.
        length = r["length_km"]
        width = (3 if length > 300 else 2 if length > 100 else 1) * river_scale
        strength = 230 if length > 100 else 150 if length > 30 else 90
        dr.line([raster.xy(x, y) for x, y in r["line"]], fill=strength, width=max(1, round(width)), joint="curve")
    water = water.filter(ImageFilter.GaussianBlur(0.6))
    river = river.filter(ImageFilter.GaussianBlur(0.5))
    return np.asarray(water, np.float32) / 255, np.asarray(river, np.float32) / 255


# ------------------------------------------------------------------- border
def load_border():
    for f in natural_earth("ne_50m_admin_0_countries")["features"]:
        props = f["properties"]
        if props.get("ISO_A3") == "TJK" or props.get("ADM0_A3") == "TJK":
            return [[(float(c[0]), float(c[1])) for c in poly[0]] for poly in polygons(f["geometry"])]
    raise SystemExit("Tajikistan not found in Natural Earth data")


def rasterise_mask(raster: Raster, rings, blur_px: float) -> np.ndarray:
    img = Image.new("L", (raster.width, raster.height), 0)
    draw = ImageDraw.Draw(img)
    for ring in rings:
        draw.polygon([raster.xy(x, y) for x, y in ring], fill=255)
    return np.asarray(img.filter(ImageFilter.GaussianBlur(blur_px)), dtype=np.float32) / 255


# ----------------------------------------------------------------- landmarks
def load_landmarks(api: str | None):
    if api:
        try:
            url = f"{api.rstrip('/')}/api/v1/landmarks/map/?lang=en"
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as res:
                items = json.loads(res.read())
            data = [{"slug": i["slug"], "lat": i["latitude"], "lon": i["longitude"]} for i in items]
            LANDMARKS_SNAPSHOT.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            print(f"  {len(data)} landmarks from the API (snapshot shared/landmarks.json updated)")
            return data
        except OSError as exc:
            print(f"  API unavailable ({exc}); using shared/landmarks.json")
    return json.loads(LANDMARKS_SNAPSHOT.read_text(encoding="utf-8"))


# ------------------------------------------------------------------- globe
def build_globe(width=2048):
    """Stylised night-blue Earth: land, country borders, Tajikistan in gold."""
    height = width // 2
    raster = Raster(-180, 180, -90, 90, width, height)
    img = Image.new("RGB", (width, height), (6, 12, 32))
    draw = ImageDraw.Draw(img)
    for f in natural_earth("ne_110m_land")["features"]:
        for poly in polygons(f["geometry"]):
            draw.polygon([raster.xy(c[0], c[1]) for c in poly[0]], fill=(24, 36, 74))
    for f in natural_earth("ne_110m_admin_0_countries")["features"]:
        is_tj = f["properties"].get("ADM0_A3") == "TJK"
        for poly in polygons(f["geometry"]):
            pts = [raster.xy(c[0], c[1]) for c in poly[0]]
            if is_tj:
                draw.polygon(pts, fill=(212, 166, 74))
            draw.line(pts + [pts[0]], fill=(242, 196, 107) if is_tj else (52, 68, 120), width=3 if is_tj else 1)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(OUT / "globe.webp", quality=82, method=6)


# ---------------------------------------------------------------- patches
def build_patches(landmarks, rings, lakes, rivers):
    """High-resolution heightmap + colour texture around each landmark (zoom 11, ~90 m/px)."""
    print(f"Detail patches (zoom {PATCH_ZOOM})…")
    out_dir = OUT / "patches"
    out_dir.mkdir(exist_ok=True)
    index = {}
    for lm in landmarks:
        lat, lon = lm["lat"], lm["lon"]
        dlat = PATCH_HALF_KM / 111.32
        dlon = PATCH_HALF_KM / (111.32 * math.cos(math.radians(lat)))
        b = {"lonMin": lon - dlon, "lonMax": lon + dlon, "latMin": lat - dlat, "latMax": lat + dlat}
        elev = dem(b["lonMin"], b["lonMax"], b["latMin"], b["latMax"], PATCH_COLOR_PX, PATCH_COLOR_PX, PATCH_ZOOM)
        raster = Raster(b["lonMin"], b["lonMax"], b["latMin"], b["latMax"], PATCH_COLOR_PX, PATCH_COLOR_PX)
        mask = rasterise_mask(raster, rings, blur_px=3)
        water, river = rasterise_water(raster, lakes, rivers, river_scale=2.5)
        rgb = colourise(elev, mask, PATCH_HALF_KM * 2000 / PATCH_COLOR_PX, water, river)
        Image.fromarray(rgb).save(out_dir / f"{lm['slug']}.webp", quality=82, method=6)
        e_min, e_max = float(np.floor(elev.min())), float(np.ceil(elev.max()))
        e_max = max(e_max, e_min + 1)
        small = np.asarray(Image.fromarray(elev).resize((PATCH_HEIGHT_PX, PATCH_HEIGHT_PX), Image.Resampling.BOX))
        m8 = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((PATCH_HEIGHT_PX, PATCH_HEIGHT_PX)))
        encode_height(small, m8, e_min, e_max).save(out_dir / f"{lm['slug']}.png", optimize=True)
        index[lm["slug"]] = {**{k: round(v, 5) for k, v in b.items()}, "elevationMin": e_min, "elevationMax": e_max}
        print(f"  {lm['slug']}")
    (OUT / "patches.json").write_text(json.dumps(index, indent=1))


# --------------------------------------------------------------------- main
def main() -> None:
    # Windows consoles default to a legacy code page; keep the progress output printable.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://127.0.0.1:8000", help="backend to read landmark coordinates from")
    parser.add_argument("--skip-patches", action="store_true")
    args = parser.parse_args()

    lat_mid = (LAT_MIN + LAT_MAX) / 2
    width_km = (LON_MAX - LON_MIN) * 111.32 * math.cos(math.radians(lat_mid))
    depth_km = (LAT_MAX - LAT_MIN) * 111.32
    map_depth = MAP_WIDTH * depth_km / width_km
    height_scale = EXAGGERATION / (width_km / MAP_WIDTH * 1000)
    OUT.mkdir(parents=True, exist_ok=True)

    print(f"Elevation (zoom {MAIN_ZOOM})…")
    color_w = 2048
    color_h = round(color_w * depth_km / width_km)
    elev = dem(LON_MIN, LON_MAX, LAT_MIN, LAT_MAX, color_w, color_h, MAIN_ZOOM)
    e_min, e_max = float(np.floor(elev.min())), float(np.ceil(elev.max()))
    print(f"  {elev.shape[1]}×{elev.shape[0]} px, {e_min:.0f}–{e_max:.0f} m")

    print("Border, lakes and rivers…")
    rings = load_border()
    lakes, rivers = load_water()
    raster = Raster(LON_MIN, LON_MAX, LAT_MIN, LAT_MAX, color_w, color_h)
    mask = rasterise_mask(raster, rings, blur_px=color_w / 500)
    water, river = rasterise_water(raster, lakes, rivers)

    print("Colour texture…")
    rgb = colourise(elev, mask, width_km * 1000 / color_w, water, river)
    Image.fromarray(rgb).save(OUT / "terrain-color.webp", quality=84, method=6)
    Image.fromarray(rgb).resize((color_w // 2, color_h // 2), Image.Resampling.LANCZOS).save(
        OUT / "terrain-color-low.webp", quality=80, method=6
    )

    print("Heightmaps…")
    mask8 = (mask * 255).astype(np.uint8)
    for name, w in (("terrain.png", 1024), ("terrain-low.png", 512)):
        h = round(w * depth_km / width_km)
        e = np.asarray(Image.fromarray(elev).resize((w, h), Image.Resampling.BOX))
        m = np.asarray(Image.fromarray(mask8).resize((w, h), Image.Resampling.BILINEAR))
        encode_height(e, m, e_min, e_max).save(OUT / name, optimize=True)

    border = [[[round(x, 4), round(y, 4)] for x, y in simplify_ring(ring, 0.01)] for ring in rings]
    (OUT / "border.json").write_text(json.dumps(border, separators=(",", ":")))

    # Lake surfaces sit at the median DEM height inside the outline.
    water_json: dict[str, list] = {"lakes": [], "rivers": []}
    for lake in lakes:
        # River-bank polygons slope downstream, so they never get a flat 3D surface.
        if lake["area"] < MESH_LAKE_KM2 or lake.get("flowing"):
            continue
        mask_img = Image.new("L", (color_w, color_h), 0)
        ImageDraw.Draw(mask_img).polygon([raster.xy(x, y) for x, y in lake["ring"]], fill=1)
        inside = np.asarray(mask_img, bool)
        if inside.sum() < 4:
            continue
        water_json["lakes"].append({
            "name": lake["name"],
            "area_km2": round(lake["area"], 1),
            "elevation": round(float(np.median(elev[inside])), 1),
            "ring": [[round(x, 4), round(y, 4)] for x, y in simplify_ring(lake["ring"], 0.004)],
        })
    for r in rivers:
        if r["length_km"] < MAJOR_RIVER_KM:
            continue
        water_json["rivers"].append({
            "name": r["name"], "length_km": round(r["length_km"]),
            "line": [[round(x, 4), round(y, 4)] for x, y in simplify(r["line"], 0.005)],
        })
    (OUT / "water.json").write_text(json.dumps(water_json, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"  {len(water_json['lakes'])} lakes, {len(water_json['rivers'])} river lines")

    bounds = {
        "lonMin": LON_MIN, "lonMax": LON_MAX, "latMin": LAT_MIN, "latMax": LAT_MAX,
        "mapWidth": MAP_WIDTH, "mapDepth": round(map_depth, 6),
        "heightScale": round(height_scale, 10), "verticalExaggeration": EXAGGERATION,
        "elevationMin": e_min, "elevationMax": e_max,
        "attribution": "Elevation: AWS Terrain Tiles (SRTM, GMTED, ETOPO1 et al.). Borders: Natural Earth. Lakes & rivers: \u00a9 OpenStreetMap contributors (ODbL), Natural Earth.",
    }
    (OUT / "bounds.json").write_text(json.dumps(bounds, indent=2))

    if not args.skip_patches:
        build_patches(load_landmarks(args.api), rings, lakes, rivers)

    print("Globe…")
    build_globe()

    for f in sorted(OUT.rglob("*")):
        if f.is_file() and "patches" not in f.parts:
            print(f"  {str(f.relative_to(OUT)):28s} {f.stat().st_size / 1024:8.0f} KB")
    total = sum(f.stat().st_size for f in (OUT / "patches").glob("*")) / 1024 if (OUT / "patches").exists() else 0
    print(f"  patches/ total               {total:8.0f} KB")
    print("Done.")


if __name__ == "__main__":
    main()
