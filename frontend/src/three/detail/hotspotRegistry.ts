import type { Vector3 } from 'three'

/** World positions of the hotspots currently on stage (written by HotspotPin, read by the focus controller). */
export const hotspotPositions = new Map<number, { position: Vector3; distance: number | null }>()
