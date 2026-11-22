import { describe, expect, it } from 'vitest'
import { normalise } from './SearchPalette'

describe('normalise', () => {
  it('folds Tajik letters so names are easy to type', () => {
    expect(normalise('Қуллаи Исмоили Сомонӣ')).toBe('куллаи исмоили сомони')
    expect(normalise('Ҳафткӯл')).toBe('хафткул')
    expect(normalise('Аҷинатеппа')).toBe('ачинатеппа')
  })
})
