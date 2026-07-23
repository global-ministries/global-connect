/**
 * W09 — DT-052 — Crisis keyword catalog tests.
 * F(pastoral/crisis/catalog) — CRISIS_CATEGORIES covers all 5 closed categories.
 *
 * Tests:
 *   1. Exactly 5 categories
 *   2. Each category has id, label, keywords
 *   3. Each category has 5-7 keywords
 *   4. Keywords cover real-world pastoral patterns
 *   5. getCategoryById returns correct category
 *   6. getAllKeywords returns all keywords flat
 */

import {
  CRISIS_CATEGORIES,
  getCategoryById,
  getAllKeywords,
} from '../../../../../lib/platform/pastoral/crisis/keyword-catalog'
import type { CrisisCategoryId } from '../../../../../lib/platform/pastoral/crisis/keyword-catalog'

describe('CRISIS_CATEGORIES', () => {
  it('has exactly 5 closed categories', () => {
    expect(CRISIS_CATEGORIES).toHaveLength(5)
  })

  it('every category has id, label, keywords', () => {
    for (const cat of CRISIS_CATEGORIES) {
      expect(cat.id).toBeDefined()
      expect(typeof cat.id).toBe('string')
      expect(cat.label).toBeDefined()
      expect(typeof cat.label).toBe('string')
      expect(Array.isArray(cat.keywords)).toBe(true)
      expect(cat.keywords.length).toBeGreaterThan(0)
    }
  })

  it('has exactly 5 categories with 5-7 keywords each', () => {
    for (const cat of CRISIS_CATEGORIES) {
      expect(cat.keywords.length).toBeGreaterThanOrEqual(5)
    }
  })

  it('all category ids are in the expected set', () => {
    const expectedIds: readonly CrisisCategoryId[] = [
      'duelo',
      'crisis_matrimonial',
      'ideacion_suicida',
      'violencia_intrafamiliar',
      'crisis_de_fe',
    ]
    const actualIds = CRISIS_CATEGORIES.map((c) => c.id)
    for (const id of expectedIds) {
      expect(actualIds).toContain(id)
    }
  })

  it('no duplicate category ids', () => {
    const ids = CRISIS_CATEGORIES.map((c) => c.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  describe('keyword coverage — real pastoral patterns', () => {
    it('duelo: covers death/loss keywords in Spanish and English', () => {
      const duelo = CRISIS_CATEGORIES.find((c) => c.id === 'duelo')!
      const kwLower = duelo.keywords.map((k) => k.toLowerCase())
      expect(kwLower).toContain('fallecido')
      expect(kwLower).toContain('muerte')
      expect(kwLower).toContain('duelo')
    })

    it('crisis_matrimonial: covers marital crisis terms', () => {
      const cm = CRISIS_CATEGORIES.find((c) => c.id === 'crisis_matrimonial')!
      const kwLower = cm.keywords.map((k) => k.toLowerCase())
      expect(kwLower).toContain('infiel')
      expect(kwLower).toContain('separación')
      expect(kwLower).toContain('divorcio')
    })

    it('ideacion_suicida: covers self-harm and suicidal ideation', () => {
      const is = CRISIS_CATEGORIES.find((c) => c.id === 'ideacion_suicida')!
      const kwLower = is.keywords.map((k) => k.toLowerCase())
      expect(kwLower.some((k) => k.includes('suicid'))).toBe(true)
      expect(kwLower).toContain('self-harm')
    })

    it('violencia_intrafamiliar: covers domestic violence terms', () => {
      const vf = CRISIS_CATEGORIES.find((c) => c.id === 'violencia_intrafamiliar')!
      const kwLower = vf.keywords.map((k) => k.toLowerCase())
      expect(kwLower).toContain('violencia')
      expect(kwLower).toContain('golpe')
      expect(kwLower).toContain('abuso')
    })

    it('crisis_de_fe: covers faith crisis terms', () => {
      const cf = CRISIS_CATEGORIES.find((c) => c.id === 'crisis_de_fe')!
      const kwLower = cf.keywords.map((k) => k.toLowerCase())
      expect(kwLower.some((k) => k.includes('fe') || k.includes('dios'))).toBe(true)
    })
  })

  describe('getCategoryById', () => {
    it('returns the correct category for each id', () => {
      for (const cat of CRISIS_CATEGORIES) {
        const found = getCategoryById(cat.id)
        expect(found).toEqual(cat)
      }
    })

    it('returns undefined for unknown id', () => {
      const found = getCategoryById('unknown_category' as CrisisCategoryId)
      expect(found).toBeUndefined()
    })
  })

  describe('getAllKeywords', () => {
    it('returns all keywords from all categories', () => {
      const all = getAllKeywords()
      expect(all.length).toBeGreaterThan(0)
      // Every keyword should appear in some category
      for (const kw of all) {
        const found = CRISIS_CATEGORIES.some((c) => c.keywords.includes(kw))
        expect(found).toBe(true)
      }
    })

    it('returns a flat array (not nested)', () => {
      const all = getAllKeywords()
      expect(Array.isArray(all)).toBe(true)
      // Each element should be a string (not an array)
      for (const item of all) {
        expect(typeof item).toBe('string')
      }
    })
  })
})
