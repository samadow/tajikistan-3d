import type { Lod, ModelFile } from '../api/types'
import type { Quality } from './device'

// Preferred LOD order for each rendering quality tier.
const PREFERENCE: Record<Quality, Lod[]> = {
  high: ['high', 'medium', 'low'],
  medium: ['medium', 'high', 'low'],
  low: ['low', 'medium', 'high'],
}

/** Picks the best uploaded model for the current quality tier (or null → placeholder). */
export function pickModel(models: ModelFile[] | undefined, quality: Quality): ModelFile | null {
  if (!models?.length) return null
  for (const lod of PREFERENCE[quality]) {
    const match = models.find((m) => m.lod === lod)
    if (match) return match
  }
  return models[0]
}
