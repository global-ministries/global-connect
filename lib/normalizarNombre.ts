// Utilidad de normalización de nombres para backend
// - Elimina sufijos redundantes de ceros al final (ej: "Juan 0", "Grupo-0")
// - Colapsa espacios múltiples
// - Trim final
// - (Opcional futuro) quitar diacríticos si se desea uniformidad total

export function normalizarNombre(base: string | null | undefined): string {
  if (!base) return ''
  let s = String(base)
  // Quitar sufijos de ceros repetidos separados por espacio, guion o underscore
  s = s.replace(/[\s_-]*0+$/g, '')
  // Colapsar espacios múltiples
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}

// Variante opcional que también elimina diacríticos para búsquedas (no usada todavía en API pública)
export function normalizarNombreBusqueda(base: string | null | undefined): string {
  return normalizarNombre(base).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
}