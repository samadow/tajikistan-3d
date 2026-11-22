# Technical Audit — Tajikistan 3D

**Date:** 2026-11-22 · **Commit audited:** `77f3a92` · **Scope:** the entire repository, measured against the Master Development Prompt.

Every claim below was checked by running a command or reading the code. Each section says how.

---

## 1. Verification run

| Check | Command | Result |
|---|---|---|
| Backend tests | `python manage.py test` | **10 tests, OK.** Includes the projection test against `bounds.json`. |
| Migrations in sync | `makemigrations --check --dry-run` | No changes detected |
| Dependency integrity | `pip check` | No broken requirements |
| Production settings | `check --deploy` (prod settings) | 2 warnings: HSTS and SSL redirect. Both are env-driven and off by default. |
| TypeScript | `npm run typecheck` | 0 errors (strict mode) |
| Production build | `npm run build` | OK. Main chunk **828 kB** (252 kB gzip). 3D chunk **917 kB** (270 kB gzip). |
| Browser E2E | Playwright script, Edge with software WebGL, run in the previous session | Map, landmark detail, time slider and story mode reached their scene modes on 1440×900 and 390×844, with no console errors. **The script is not in the repo** (it lives in a temp folder). |
| Docker | `docker compose config` | Compose file is valid. **Images were never built or run** because the Docker daemon was not running. |
| GitHub | `git ls-remote origin` | **Repository not found.** `samadow/tajikistan-3d` has not been created yet, and the commit exists only locally. |

---

## 2. What exists today

### Backend (`backend/`): Django 5.2, DRF 3.18, a single `landmarks` app
- **Models:**
  - `Category`, `Landmark`, `LandmarkImage`, `Hotspot`, `LandmarkEra`.
  - Six translated text fields per landmark via **django-modeltranslation** (`_tg/_ru/_en` columns, fallback tg → ru → en).
  - `map_x/y/z` and the default fly-to camera are computed in `Landmark.save()` from lat/lon through `landmarks/geo.py`.
  - GLB uploads are validated by extension and size (15 MB).
- **API:**
  - `GET /api/landmarks/` (light list, filter `?category=`)
  - `GET /api/landmarks/<slug>/` (full detail with images, hotspots and eras)
  - `GET /api/categories/` (with published counts)
  - Language comes from `?lang=` or `Accept-Language`. Responses set `Content-Language`, `Vary: Accept-Language` and `Cache-Control: public, max-age=60`.
  - Uses `select_related` and `prefetch_related`. Anonymous throttling is on in production.
- **Admin:** tabbed translations; inline images, hotspots and eras; poster preview; a "Missing texts" counter; a content-status filter (needs text, no 3D model, complete).
- **Seed:** `seed_landmarks` loads 5 categories and 12 landmarks. It only writes names, taglines and approximate coordinates. It is idempotent and never overwrites edits made in the admin.
- **Settings:** split into base, dev and prod. All secrets come from env. SQLite is used when `POSTGRES_DB` is unset.

### Terrain (`tools/terrain/build_heightmap.py`)
- Reads real elevation data from **AWS Terrain Tiles** (Terrarium encoding, zoom 8, 42 tiles) and the country border from **Natural Earth 1:50m**.
- Resamples from Web Mercator to the equirectangular projection used by the map.
- Outputs:
  - `terrain.png`: 1024×763, 16-bit height in the R/G channels and a soft country mask in B.
  - `terrain-low.png`: 512×381.
  - `border.json`, simplified by RDP.
  - `bounds.json`: the projection constants.
- **Resolution:** about **0.69 km per pixel**. Elevation range 189–7592 m. Vertical exaggeration ×3.

### Frontend (`frontend/`): React 19, TypeScript strict, Vite 8, R3F 9, drei 10, GSAP, Zustand, TanStack Query, Tailwind 4
- **One persistent `<Canvas>`.** The map scene is hidden, not unmounted, while a landmark's detail stage is showing.
- **`three/camera/director.ts`** owns every scripted move:
  - intro, fly-to along an arc, map ↔ detail with an ornamental veil, return to map;
  - the story spline (Catmull-Rom, with eased segments).
  - Only one tween runs at a time.
- **Terrain mesh:**
  - Displaced on the CPU, with vertex colours by height, slope and mask.
  - Edges fade into an endless ground plane and sky dome. Fog is tied to camera distance.
  - A gold border line is draped over the relief.
- **Markers:** animated pins with a constant on-screen size, category colours and `<Html>` labels.
- **Detail stage:**
  - Procedural studio HDRI (Lightformers), contact shadows, auto-rotate.
  - GLB loading with local Draco, meshopt and KTX2 decoders, auto-centering and auto-scaling, and cleanup with `useGLTF.clear` plus dispose on leave.
  - 9 procedural placeholder kinds, with ruins and restored variants.
  - Hotspots; an error boundary that falls back to the placeholder; preloading of the next landmark's model.
- **UI:** header (language switch, day/night), hero, landmark rail, category filter, detail panel (facts, story, gallery lightbox, travel info, credits), time slider, scroll story mode, loader, veil, film grain.
- **Quality tiers:**
  - The starting tier comes from a device heuristic, and `?quality=` overrides it.
  - At runtime `PerformanceMonitor` steps quality down and `AdaptiveDpr` lowers resolution.
- **SVG 2D fallback** when WebGL is unavailable.
- **URL routing:** `/`, `/place/:slug` and `/story`; deep links work.

### Infrastructure
- `docker-compose.yml` defines three services:
  - postgres:16 with a health check;
  - Django on gunicorn, which runs migrate and seed on start;
  - nginx, which serves the SPA, proxies the API and admin, and serves `/media/` with the GLB MIME type and caching headers.
- `.env.example`, `.gitignore`, and `.gitattributes` forcing LF line endings so that `entrypoint.sh` keeps working.

---

## 3. Gap analysis against the Master Prompt

Legend: ✅ done and verified · 🟡 partial · ❌ missing

| § | Requirement | Status | Notes |
|---|---|---|---|
| 3 | drf-spectacular / OpenAPI | ❌ | Not installed |
| 3 | Vitest, Playwright in repo | ❌ | No frontend test tooling. The E2E script is outside the repo. |
| 4 | Intro "from space → Central Asia → Tajikistan" | ❌ | The current intro drops from high above the map. There is no globe. |
| 5.1–5.4 | Real heightmap, border, projection, displacement | ✅ | |
| 5.4 | **Single** projection contract | 🟡 | The constants are duplicated in 3 places, held in sync only by a test. They should come from one source. |
| 5.6–5.7 | Snow and shading by height and slope | ✅ | Vertex colours only. No texture and no baked hillshade. |
| 5.8 | **Rivers and lakes** | ❌ | Not rendered. In the DEM, lakes are just flat areas. |
| 5.9–5.10 | Gold border, dark neighbours | ✅ | |
| 5 opt. | Terrain LOD, multiple resolutions, texture compression | 🟡 | There are 2 heightmap resolutions but no LOD. One mesh per tier: ~196k vertices (high), ~96k (medium), ~12k (low; too coarse). |
| 5 | Close-up terrain quality | ❌ | At 0.69 km/px, fly-to and story close-ups look blurry (see the story screenshot). |
| 6 | Camera director with every required move | 🟡 | Missing: saving and restoring the camera state on return (it always returns to the overview) and "fly to hotspot". |
| 7 | Landmark stage: GLB, placeholder, centering, lighting, shadows, hotspots, gallery | ✅ | Hotspot placement is broken for GLBs (defect D1). |
| 7 | New landmarks: Tajik National Park, Fann Mountains, Ancient Penjikent | ❌ | Not seeded. NP and Fann are *areas*, so a single point represents them poorly. |
| 8 | Hotspot image, historical info, camera focus, admin management | 🟡 | Admin management works. Image, history text and camera focus are missing. |
| 9 | Eras: year (BCE), title, description, model, variant | ✅ | |
| 9 | Historical references and a "verified vs reconstruction" flag | ❌ | There is no source model and no reconstruction disclaimer per era. A global placeholder notice exists. |
| 9 | Before/after comparison view | ❌ | Only the slider exists |
| 10 | ScrollTrigger story along a spline | ✅ | |
| 10 | CMS-driven stories (`Story` / `StoryStep`), photos in steps, progress UI, reduced motion | 🟡 | The story is hard-wired to "all landmarks in order". Reduced motion is respected for camera tweens. |
| 11 | tg/ru/en, `?lang`, Accept-Language, fallback, language in the query key | ✅ | Number formatting is hard-coded to `ru-RU`, and "N/E" is not localised (D4). |
| 12 | Separate translation tables (`LandmarkTranslation`, …) | 🟡 | Implemented as translated columns instead. See ADR-1 in ARCHITECTURE.md. |
| 12 | `featured`, `HistoricalSource`, `LandmarkModel` (LOD and licence), thumbnails, licence fields | ❌ | |
| 13 | `/api/v1/` versioning | ❌ | Currently `/api/` |
| 13 | featured, nearby, `/{slug}/eras/`, `/{slug}/stories/` | ❌ | |
| 13 | Pagination | ❌ | Lists are unpaginated by design (the map needs everything) |
| 13 | Server-side response caching | 🟡 | HTTP cache headers only. No Django cache. |
| 14 | Navigation: Explore, Discover, History, Stories, About | 🟡 | Only Map and Journey exist |
| 14 | Search, fullscreen, sound, quality selector, story progress | ❌ | Quality can only be set via a URL parameter |
| 15 | Quality tiers, PerformanceMonitor, `?quality=`, 2D fallback | ✅ | The tier switch medium → low reloads the terrain (R2) |
| 15 | Accessibility | 🟡 | Keyboard support in detail view, ARIA and focus rings exist. Every landmark is reachable by keyboard through the rail (desktop) or the card list (mobile). The 3D markers themselves can't take focus, the canvas has no text alternative, and there is no skip link. |
| 16 | Separation of camera, terrain, API, UI and state | ✅ | Largest components: `DetailPanel.tsx` (264 lines, 6 components; should be split), `Placeholders.tsx` (412 lines). |
| 17 | Serializer, translation fallback and model validation tests | 🟡 | API and projection tests exist. No dedicated fallback, upload-validation or serializer tests. |
| 18 | Env settings, upload limits, CORS/CSRF, secure cookies, nginx, compose, gunicorn | ✅ | Not run in Docker yet |
| 18 | Backups, logging strategy, monitoring, media storage strategy | ❌ | Only console logging exists |
| 18 | GLB content validation | 🟡 | Extension and size are checked. The binary `glTF` magic header is not. |

---

## 4. Verified defects

| ID | Severity | Location | Defect |
|---|---|---|---|
| D1 | **High** | `frontend/src/three/detail/DetailStage.tsx:114-125` | `<Hotspots>` is rendered **outside** the group that centres and scales an uploaded GLB (`scale={fit.s}`, line 52). Hotspots line up with the procedural placeholders, but they **will be misplaced on any real model**. |
| D2 | **High** | `frontend/src/App.tsx:7,13` | `App` eagerly imports `director.ts` (three and gsap) and `StoryMode` (ScrollTrigger). This pulls three.js into the main chunk (828 kB). The lazy `Experience` import saves little, and **2D-fallback users still download three.js**. |
| D3 | Medium | `frontend/src/three/Experience.tsx` (`use(loadTerrain())`) | No error boundary around terrain loading. If `/terrain/*` fails to load, the whole canvas crashes and the loader never finishes. |
| D4 | Low | `DetailPanel.tsx:112,143`, `StoryMode.tsx:80` | Numbers are formatted with a hard-coded `ru-RU` locale, and "° N / ° E" is not localised. This mixes languages in the English UI (§11). |
| D5 | Medium | `backend/config/settings/base.py` (REST_FRAMEWORK) | `NUM_PROXIES` is not set behind nginx. DRF then builds the throttle identity from the whole client-supplied `X-Forwarded-For` header, so **anyone can bypass the throttle** by sending a fake header. |
| D6 | Low | `backend/landmarks/models.py` (`missing_content`) | `subtitle` and `name` are not counted as missing translations. |
| D7 | Low | `frontend/src/ui/MapOverlay.tsx` | On mobile the hero block covers the upper third of the map permanently. It never collapses after the user starts interacting. |

---

## 5. Technical debt

1. **The projection is defined three times:** in `geo.py`, `build_heightmap.py` and `bounds.json`. A test guards it, but there should be one source of truth.
2. **Placeholders.tsx (412 lines)** holds 9 placeholder kinds in one file. It should be split per kind.
3. **DetailPanel.tsx** holds 6 components (top bar, panel, gallery, time slider, hint, paragraphs). Each should get its own file.
4. **No ESLint or Prettier**, no Vitest, no in-repo E2E, no CI.
5. **Seed coordinates are approximate** and were typed by hand. They have not been checked against an authoritative source such as OpenStreetMap or Wikidata (§20.4).
6. **The story is not CMS-driven.** The tour is "every landmark ordered by `order`".
7. **No Django-level cache**, and no cache invalidation on content changes.
8. **The admin "content status" filter loads every landmark into Python.** That is fine for dozens of rows and slow for thousands.

---

## 6. Performance notes (measured or calculated)

| Item | Value |
|---|---|
| Initial JS (gzip) | 252 kB (main) + 270 kB (3D) = **522 kB** before any data |
| Terrain image | 1061 kB (high/medium), 337 kB (low) |
| Terrain mesh | high 513×382 ≈ 196k vertices · medium ≈ 96k · low 129×96 ≈ 12k |
| Draw calls (map) | Terrain + ground + sky + 2 border lines + about 5 meshes per marker (≈ 60 for 12 markers) → markers should use **InstancedMesh** |
| Terrain build | Runs on the main thread when the scene mounts (196k vertices plus normals and colours). It should move to a Web Worker to avoid a frame hitch. |

---

## 7. Risks and missing data (need a decision or input from the owner)

| # | Item | Why it matters |
|---|---|---|
| R1 | **Historical and travel texts are empty by design** | The prompt forbids invented facts. Content has to come from the owner, with sources. A `HistoricalSource` model will make the sourcing visible. |
| R2 | **Satellite or colour imagery for the terrain** | The best free mosaic (Sentinel-2 cloudless by EOX) is licensed **CC BY-NC-SA**, i.e. *non-commercial only*. Public-domain alternatives such as NASA Blue Marble at 500 m/px are much coarser. This depends on whether the project is commercial. |
| R3 | **Sound design** | Needs licensed audio. Only CC0 or self-produced audio is safe. |
| R4 | **Area landmarks** (Tajik National Park, Fann Mountains, the Pamirs) | They should be drawn as areas, not single points. The boundaries can come from OpenStreetMap (ODbL, attribution required). |
| R5 | **Docker stack never executed** | Needs Docker Desktop running for verification. |
| R6 | **GitHub repository missing** | The owner must create the repo `samadow/tajikistan-3d` (or approve automated creation). Then `git push -u origin main` works. |
