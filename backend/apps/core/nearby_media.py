"""Openly licensed photos and 360° panoramas around a point.

Sources (each optional, queried in parallel, failures are skipped):

* Wikimedia Commons: geotagged files. A file is a 360° panorama when it uses
  the ``{{Pano360}}`` template (Commons' marker for equirectangular spheres).
* Panoramax: open street-level imagery (CC BY-SA). ``field_of_view == 360``
  marks a sphere.
* Mapillary: street-level imagery, used only when ``MAPILLARY_TOKEN`` is set
  (a free client token from https://www.mapillary.com/dashboard/developers).

Only metadata and links are returned; images are loaded by the browser straight
from the source, with author and licence shown next to them.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
import logging
import math
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.utils.html import strip_tags

log = logging.getLogger(__name__)

USER_AGENT = "Tajikistan3D/1.0 (open-source map; https://github.com/samadow/tajikistan-3d)"
TIMEOUT = 12
MAX_RADIUS_M = 10_000
CACHE_SECONDS = 6 * 3600


def fetch_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:  # noqa: S310 (fixed https hosts)
        return json.load(resp)


def bbox(lat: float, lon: float, radius_m: float) -> tuple[float, float, float, float]:
    dlat = radius_m / 111_320
    dlon = radius_m / (111_320 * max(math.cos(math.radians(lat)), 0.01))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(a))


def _meta(ext: dict, key: str) -> str:
    return strip_tags(str(ext.get(key, {}).get("value", ""))).strip()


def _date(text: str) -> str:
    """ISO date (or year) from Commons' free-form date text, e.g. "Taken on 12 May 2009"."""
    match = re.search(r"\d{4}-\d{2}-\d{2}", text) or re.search(r"(?<![0-9])(?:1[89]|20)[0-9]{2}(?![0-9])", text)
    return match.group(0) if match else ""


def from_commons(lat: float, lon: float, radius: int) -> list[dict]:
    params = {
        "action": "query",
        "format": "json",
        "generator": "geosearch",
        "ggscoord": f"{lat}|{lon}",
        "ggsradius": min(radius, MAX_RADIUS_M),
        "ggsnamespace": 6,
        "ggslimit": 60,
        "prop": "imageinfo|templates|coordinates",
        "tltemplates": "Template:Pano360",
        "tllimit": 500,
        "iiprop": "url|size|extmetadata|mime",
        "iiurlwidth": 330,  # a standard, widely cached Commons thumbnail step
        "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|ObjectName|ImageDescription|DateTimeOriginal",
    }
    data = fetch_json("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params))
    items = []
    for page in data.get("query", {}).get("pages", {}).values():
        info = (page.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
            continue
        coords = (page.get("coordinates") or [{}])[0]
        ext = info.get("extmetadata", {})
        is_pano = bool(page.get("templates"))
        width = info.get("width") or 0
        # Originals can be 100+ MP. Use standard Commons thumbnail steps (generated
        # quickly and cached): 1280 px for photos, 3840 px for spheres so the browser
        # can upload a panorama as a single WebGL texture.
        full = info.get("url", "")
        target = 3840 if is_pano else 1280
        if width > target and info.get("thumburl"):
            full = re.sub(r"/\d+px-", f"/{target}px-", info["thumburl"], count=1)
        items.append(
            {
                "id": f"commons:{page['pageid']}",
                "source": "commons",
                "kind": "pano" if is_pano else "photo",
                "title": _meta(ext, "ObjectName") or page.get("title", "").removeprefix("File:").rsplit(".", 1)[0],
                "thumb": info.get("thumburl", ""),
                "full": full,
                "page": info.get("descriptionurl", ""),
                "author": _meta(ext, "Artist")[:120],
                "license": _meta(ext, "LicenseShortName"),
                "license_url": _meta(ext, "LicenseUrl"),
                "date": _date(_meta(ext, "DateTimeOriginal")),
                "lat": coords.get("lat"),
                "lon": coords.get("lon"),
                "width": width,
                "height": info.get("height") or 0,
            }
        )
    return items


def from_panoramax(lat: float, lon: float, radius: int) -> list[dict]:
    b = ",".join(f"{v:.6f}" for v in bbox(lat, lon, radius))
    data = fetch_json(f"https://api.panoramax.xyz/api/search?bbox={b}&limit=40")
    items = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        assets = f.get("assets", {})
        lon_, lat_ = f.get("geometry", {}).get("coordinates", [None, None])[:2]
        fov = (p.get("pers:interior_orientation") or {}).get("field_of_view")
        license_link = next((link for link in f.get("links", []) if link.get("rel") == "license"), {})
        items.append(
            {
                "id": f"panoramax:{f.get('id')}",
                "source": "panoramax",
                "kind": "pano" if fov == 360 else "photo",
                "title": "Panoramax",
                "thumb": assets.get("thumb", {}).get("href", ""),
                "full": assets.get("sd", {}).get("href", "") if fov != 360 else assets.get("hd", {}).get("href", ""),
                "page": f"https://api.panoramax.xyz/#focus=pic&pic={f.get('id')}",
                "author": ", ".join((p.get("geovisio:producer") or "").split(",")[:1]) if isinstance(p.get("geovisio:producer"), str) else "",
                "license": p.get("license", ""),
                "license_url": license_link.get("href", ""),
                "date": str(p.get("datetime", ""))[:10],
                "lat": lat_,
                "lon": lon_,
                "width": 0,
                "height": 0,
            }
        )
    return items


def from_mapillary(lat: float, lon: float, radius: int) -> list[dict]:
    token = getattr(settings, "MAPILLARY_TOKEN", "")
    if not token:
        return []
    b = ",".join(f"{v:.6f}" for v in bbox(lat, lon, min(radius, 2000)))
    fields = "id,thumb_256_url,thumb_2048_url,computed_geometry,geometry,is_pano,captured_at,creator"
    data = fetch_json(
        "https://graph.mapillary.com/images?"
        + urllib.parse.urlencode({"access_token": token, "fields": fields, "bbox": b, "limit": 60})
    )
    items = []
    for img in data.get("data", []):
        geom = img.get("computed_geometry") or img.get("geometry") or {}
        lon_, lat_ = (geom.get("coordinates") or [None, None])[:2]
        captured = img.get("captured_at")
        items.append(
            {
                "id": f"mapillary:{img['id']}",
                "source": "mapillary",
                "kind": "pano" if img.get("is_pano") else "photo",
                "title": "Mapillary",
                "thumb": img.get("thumb_256_url", ""),
                "full": img.get("thumb_2048_url", ""),
                "page": f"https://www.mapillary.com/app/?pKey={img['id']}",
                "author": (img.get("creator") or {}).get("username", ""),
                "license": "CC BY-SA 4.0",
                "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
                "date": "" if not captured else datetime.fromtimestamp(captured / 1000, tz=timezone.utc).date().isoformat(),
                "lat": lat_,
                "lon": lon_,
                "width": 0,
                "height": 0,
            }
        )
    return items


SOURCES = {"commons": from_commons, "panoramax": from_panoramax, "mapillary": from_mapillary}


def nearby_media(lat: float, lon: float, radius: int) -> dict:
    radius = max(50, min(int(radius), MAX_RADIUS_M))
    key = f"nearby-media:{lat:.4f}:{lon:.4f}:{radius}:{bool(getattr(settings, 'MAPILLARY_TOKEN', ''))}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    items: list[dict] = []
    failed: list[str] = []
    with ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        futures = {name: pool.submit(fn, lat, lon, radius) for name, fn in SOURCES.items()}
        for name, fut in futures.items():
            try:
                items.extend(fut.result())
            except Exception as exc:  # network errors from a third party must not break the page
                log.warning("nearby media source %s failed: %s", name, exc)
                failed.append(name)

    for item in items:
        if item["lat"] is not None and item["lon"] is not None:
            item["distance_m"] = round(distance_m(lat, lon, item["lat"], item["lon"]))
        else:
            item["distance_m"] = None
    items = [i for i in items if i["thumb"] and i["full"]]
    items.sort(key=lambda i: (i["kind"] != "pano", i["distance_m"] if i["distance_m"] is not None else 1e9))

    result = {
        "panoramas": [i for i in items if i["kind"] == "pano"][:40],
        "photos": [i for i in items if i["kind"] == "photo"][:60],
        "sources_failed": failed,
        "mapillary_enabled": bool(getattr(settings, "MAPILLARY_TOKEN", "")),
    }
    # Do not cache a fully failed lookup for long: the network may be back soon.
    cache.set(key, result, CACHE_SECONDS if len(failed) < len(SOURCES) else 60)
    return result
