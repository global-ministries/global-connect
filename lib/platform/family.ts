// Taxonomía de relaciones familiares a nivel de plataforma.
// Separa los tipos actuales persistidos en DB (enum_tipo_relacion) de los
// conceptos futuros (autorizado/contacto) que aún no tienen representación
// de esquema y no deben inferirse desde los tipos existentes.

/** Tipos de relación familiar actuales, alineados con `enum_tipo_relacion`. */
export const PLATFORM_FAMILY_RELATION_TYPES = [
  'conyuge',
  'padre',
  'hijo',
  'tutor',
  'hermano',
  'otro_familiar',
] as const

export type PlatformFamilyRelationType = (typeof PLATFORM_FAMILY_RELATION_TYPES)[number]

/** Tipos de relación futuros. Aún no existen en DB; son forward-compat. */
export const PLATFORM_FUTURE_FAMILY_RELATION_TYPES = [
  'autorizado',
  'contacto',
] as const

export type PlatformFutureFamilyRelationType = (typeof PLATFORM_FUTURE_FAMILY_RELATION_TYPES)[number]

/** Unión de tipos actuales y futuros. */
export type PlatformAnyFamilyRelationType = PlatformFamilyRelationType | PlatformFutureFamilyRelationType

/** Conjunto de búsqueda O(1) para tipos actuales. */
const PLATFORM_FAMILY_RELATION_TYPE_SET = new Set<string>(PLATFORM_FAMILY_RELATION_TYPES)

/** Conjunto de búsqueda O(1) para tipos actuales + futuros. */
const PLATFORM_ANY_FAMILY_RELATION_TYPE_SET = new Set<string>([
  ...PLATFORM_FAMILY_RELATION_TYPES,
  ...PLATFORM_FUTURE_FAMILY_RELATION_TYPES,
])

/** Conjunto de búsqueda O(1) para tipos futuros. */
const PLATFORM_FUTURE_FAMILY_RELATION_TYPE_SET = new Set<string>(PLATFORM_FUTURE_FAMILY_RELATION_TYPES)

/** Verifica si un valor es uno de los 6 tipos actuales de relación familiar. */
export function isPlatformFamilyRelationType(value: unknown): value is PlatformFamilyRelationType {
  return typeof value === 'string' && PLATFORM_FAMILY_RELATION_TYPE_SET.has(value)
}

/** Verifica si un valor es cualquier tipo de relación familiar conocido (8 en total). */
export function isPlatformAnyFamilyRelationType(value: unknown): value is PlatformAnyFamilyRelationType {
  return typeof value === 'string' && PLATFORM_ANY_FAMILY_RELATION_TYPE_SET.has(value)
}

/** Verifica si un valor es uno de los 2 tipos futuros de relación familiar. */
export function isPlatformFutureFamilyRelationType(value: unknown): value is PlatformFutureFamilyRelationType {
  return typeof value === 'string' && PLATFORM_FUTURE_FAMILY_RELATION_TYPE_SET.has(value)
}

/**
 * Normaliza un valor al tipo de relación familiar actual.
 * Recorta espacios, convierte a minúsculas y solo acepta los 6 tipos de DB.
 * Los tipos futuros y valores desconocidos devuelven `undefined`.
 */
export function normalizePlatformFamilyRelationType(value: unknown): PlatformFamilyRelationType | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (isPlatformFamilyRelationType(normalized)) return normalized
  return undefined
}

/** Indica si una relación es recíproca por naturaleza (mismo término en ambos sentidos). */
export function isPlatformReciprocalFamilyRelation(type: PlatformFamilyRelationType): boolean {
  return type === 'conyuge' || type === 'hermano'
}

/**
 * Devuelve el tipo inverso de una relación familiar.
 * `tutor` y `otro_familiar` devuelven `null` porque no tienen término simétrico
 * en `enum_tipo_relacion`.
 */
export function invertPlatformFamilyRelation(type: PlatformFamilyRelationType | null): PlatformFamilyRelationType | null {
  if (type === null) return null
  switch (type) {
    case 'padre':
      return 'hijo'
    case 'hijo':
      return 'padre'
    case 'conyuge':
      return 'conyuge'
    case 'hermano':
      return 'hermano'
    case 'tutor':
    case 'otro_familiar':
      return null
    default:
      return null
  }
}

/** Etiquetas en español para cada tipo de relación (plataforma, no UI). */
export const PLATFORM_FAMILY_RELATION_LABELS = {
  conyuge: 'Cónyuge',
  padre: 'Padre / Madre',
  hijo: 'Hijo / Hija',
  tutor: 'Tutor',
  hermano: 'Hermano / Hermana',
  otro_familiar: 'Otro familiar',
  autorizado: 'Autorizado',
  contacto: 'Contacto',
} satisfies Record<PlatformAnyFamilyRelationType, string>
