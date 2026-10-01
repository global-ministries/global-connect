/**
 * Grupos de Vida — names of the stage directors of a group.
 *
 * A couple of stage directors is shown as one director ("Ana Pérez y Luis Gómez"),
 * so the solicitudes views list every director linked to the group, not just the first.
 * Pure helpers: no database access.
 */
import { extraerRelacion } from '@/lib/supabase/helpers'

export type NombreDirector = { nombre?: string | null; apellido?: string | null }

/** "Ana Pérez", "Ana Pérez y Luis Gómez", "Ana Pérez, Luis Gómez y Sara Díaz". */
export function unirNombresDirectores(directores: NombreDirector[]): string {
  const nombres = directores
    .map((d) => `${d.nombre ?? ''} ${d.apellido ?? ''}`.trim())
    .filter((nombre) => nombre.length > 0)
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

type Usuario = { nombre: string; apellido: string }
type SegmentoLider = { usuario: unknown } | null

/**
 * Extracts the directors from the `director_etapa_grupos` embed of a group
 * (`segmento_lideres -> usuario`), in the order the database returned them.
 */
export function directoresDeAsignaciones(asignaciones: unknown): Array<{ nombre: string; apellido: string }> {
  if (!Array.isArray(asignaciones)) return []
  const directores: Usuario[] = []
  for (const asignacion of asignaciones as Array<{ segmento_lideres?: unknown } | null>) {
    const segLider = extraerRelacion<SegmentoLider>(asignacion?.segmento_lideres)
    const usuario = segLider?.usuario ? extraerRelacion<Usuario>(segLider.usuario) : null
    if (usuario) directores.push({ nombre: usuario.nombre, apellido: usuario.apellido })
  }
  return directores
}
