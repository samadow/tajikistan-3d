# Performance measurements

**Measured on 2026-11-22.**
- Bundle sizes: `npm run build` (Vite 8, production).
- Renderer statistics: `?debug` exposes `window.__TJ3D__`. They were captured in Microsoft Edge with **software WebGL (SwiftShader)**, on the map view at 1440×900.

Because of the software renderer, frame rates from this run are **not** meaningful. Measure FPS on real hardware: open `/?debug`, then read `window.__TJ3D__.fps` in the console.

## JavaScript and CSS (production build)

| Chunk | Size | gzip | When it loads |
|---|---|---|---|
| `index` (React, router, query, UI shell) | 351 kB | **111 kB** | Always |
| `ThreeRoot` (three.js, R3F, drei, postprocessing, GSAP core) | 1,317 kB | 375 kB | In parallel, only when WebGL is available |
| `StoryMode` + `gsap` (ScrollTrigger) | 48 + 70 kB | 19 + 27 kB | Only on `/story` |
| Pages (Discover, History, Stories, About) | 0.6–3.7 kB each | < 2 kB | On visit |
| CSS | 49 kB | 9.5 kB | Always |
| `terrain.worker` | 2 kB | — | With the 3D chunk |

Before Phase 3, three.js sat in the main chunk (828 kB), so the 2D fallback downloaded it too (audit D2). Now it does not.

## Terrain data

| Tier | Heightmap | Colour texture | Total on first load |
|---|---|---|---|
| high / medium | `terrain.png`, 1,040 kB | `terrain-color.webp`, 386 kB | ≈ 1.7 MB |
| low (phones) | `terrain-low.png`, 292 kB | `terrain-color-low.webp`, 107 kB | ≈ 0.66 MB |

Detail patches (about 90 kB each: heightmap plus texture) load only when the camera flies to a landmark or lingers on a story step.

## Renderer (map view)

| Tier | Draw calls | Triangles | Textures | Post-processing |
|---|---|---|---|---|
| high | 30 | 418,000 | 20 | Bloom + vignette |
| medium | 30 | 247,000 | 20 | Bloom + vignette |
| low | 13 | 126,000 | 3 | Off |

- Markers are instanced: 4 draw calls for all landmarks. Before Phase 3 it was about 5 per landmark.
- Terrain meshes are built in a Web Worker, so the main thread never stalls on 200k+ vertices.
- `PerformanceMonitor` steps down a tier when the frame rate stays low (automatic quality only). `AdaptiveDpr` lowers the pixel ratio while the camera moves.
- Changing tier at runtime only rebuilds the mesh. The downloaded data is reused, so the scene does not reload.

## Not measured yet

- Lighthouse scores and real-GPU frame times. Run Lighthouse in Chrome DevTools on the production build, and FPS via `?debug` on a mid-range laptop and a mid-range phone.
