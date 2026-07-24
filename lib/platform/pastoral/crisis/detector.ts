/**
 * W09 — DT-053 — Pure crisis detector.
 *
 * Detects the FIRST crisis category matching in a given text.
 * Priority = order in CRISIS_CATEGORIES (duelo first, crisis_de_fe last).
 *
 * Normalization:
 *   1. Strip accents (diacritics) via removeAccents
 *   2. Lowercase
 *   3. Search for keywords as whole-word matches (word boundary \b)
 *
 * Returns null when no category matches.
 */

import type { CrisisCategoryId } from './keyword-catalog'
import { CRISIS_CATEGORIES } from './keyword-catalog'

// ─── Accent removal ────────────────────────────────────────────────────────────

/**
 * Removes diacritical marks (accents, tildes, cedillas) from a string.
 * Uses the canonical NFD decomposition + strip of combining marks.
 */
function removeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ─── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalizes text for keyword matching:
 *   - Removes accents
 *   - Converts to lowercase
 */
export function normalizeForMatching(text: string): string {
  return removeAccents(text).toLowerCase()
}

// ─── Detection ────────────────────────────────────────────────────────────────

export interface CrisisMatch {
  readonly categoria: CrisisCategoryId
  readonly matches: readonly string[]
}

/**
 * Detects crisis keywords in the given text.
 * Returns the first matching category (priority = CRISIS_CATEGORIES order).
 * Returns null if no category matches.
 *
 * @param text - the raw text to scan (resumen + notas concatenated)
 */
export function detectCrisisInText(text: string): CrisisMatch | null {
  if (!text || text.trim().length === 0) {
    return null
  }

  const normalized = normalizeForMatching(text)

  for (const category of CRISIS_CATEGORIES) {
    const matchedKeywords: string[] = []

    for (const keyword of category.keywords) {
      // Normalize keyword the same way as the text for case/accent-insensitive matching.
      // Use simple substring includes (no word boundaries) to handle:
      //   - "murió" (accent) matches keyword "muerto" if text uses "muerto"
      //   - "perdido" keyword matches "perdió" text (accent difference collapsed by normalization)
      const normalizedKeyword = normalizeForMatching(keyword)
      if (normalized.includes(normalizedKeyword)) {
        matchedKeywords.push(keyword)
      }
    }

    if (matchedKeywords.length > 0) {
      return {
        categoria: category.id,
        matches: Object.freeze([...matchedKeywords]),
      }
    }
  }

  return null
}
