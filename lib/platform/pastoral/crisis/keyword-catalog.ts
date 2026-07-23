/**
 * W09 — DT-052 — Crisis keyword catalog.
 *
 * Closed catalog of 5 crisis categories (D29) with 5-7 keywords each.
 * The catalog is defined as a pure TypeScript constant — no DB round-trip needed
 * for the detector (the DB table is used for audit/future extensibility).
 *
 * Keywords are stored lowercase; matching is done via case-insensitive comparison
 * using the detector's normalize step.
 *
 * The 5 closed categories (D29):
 *   duelo, crisis_matrimonial, ideacion_suicida,
 *   violencia_intrafamiliar, crisis_de_fe
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type CrisisCategoryId =
  | 'duelo'
  | 'crisis_matrimonial'
  | 'ideacion_suicida'
  | 'violencia_intrafamiliar'
  | 'crisis_de_fe'

export interface CrisisCategory {
  readonly id: CrisisCategoryId
  readonly label: string
  readonly keywords: readonly string[]
}

// ─── Closed catalog (D29) ───────────────────────────────────────────────────────

/**
 * The 5 closed crisis categories with their pastoral labels and keywords.
 * Priority order in the array = detection priority (first match wins).
 */
export const CRISIS_CATEGORIES: readonly CrisisCategory[] = Object.freeze([
  {
    id: 'duelo',
    label: 'Duelo',
    keywords: Object.freeze([
      'fallecido',
      'murió',
      'muerte',
      'perdido',
      'deuil',
      'bereavement',
      'duelo',
    ]),
  },
  {
    id: 'crisis_matrimonial',
    label: 'Crisis Matrimonial',
    keywords: Object.freeze([
      'infiel',
      'separación',
      'divorcio',
      'affair',
      'traición',
      'crisis',
    ]),
  },
  {
    id: 'ideacion_suicida',
    label: 'Ideación Suicida',
    keywords: Object.freeze([
      'suicidio',
      'quitarme la vida',
      'autolesión',
      'self-harm',
      'no vale la pena',
      'mejor no estar',
    ]),
  },
  {
    id: 'violencia_intrafamiliar',
    label: 'Violencia Intrafamiliar',
    keywords: Object.freeze([
      'violencia',
      'golpe',
      'abuso',
      'amenaza',
      'maltrato',
      'agresión',
    ]),
  },
  {
    id: 'crisis_de_fe',
    label: 'Crisis de Fe',
    keywords: Object.freeze([
      'dudar de dios',
      'perdí la fe',
      'no me importa',
      'abandonado por dios',
      'crisis de fe',
      'dios me abandonó',
      'no tengo fe',
    ]),
  },
])

// ─── Derived helpers ───────────────────────────────────────────────────────────

/**
 * Returns all keywords from all categories as a flat readonly array.
 */
export function getAllKeywords(): readonly string[] {
  return CRISIS_CATEGORIES.flatMap((c) => c.keywords)
}

/**
 * Returns the category by id, or undefined if not found.
 */
export function getCategoryById(
  id: CrisisCategoryId,
): CrisisCategory | undefined {
  return CRISIS_CATEGORIES.find((c) => c.id === id)
}
