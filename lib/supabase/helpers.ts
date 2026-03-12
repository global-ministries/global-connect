/**
 * Helpers para trabajar con relaciones Supabase de forma type-safe.
 *
 * Supabase devuelve relaciones anidadas con tipos auto-generados que pueden
 * variar en forma (objeto o array) dependiendo de la cardinalidad FK.
 * Este módulo centraliza el patrón de extracción para evitar `as unknown as`
 * dispersos por el codebase.
 */

/**
 * Extrae una relación Supabase de forma type-safe.
 * Supabase devuelve relaciones como objetos o arrays según la FK — este helper normaliza.
 *
 * @example
 * const usuario = extraerRelacion<{ id: string; nombre: string }>(casa.usuarios);
 */
export function extraerRelacion<T>(data: unknown): T | null {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return data as T;
}
