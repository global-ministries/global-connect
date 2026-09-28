/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — loaders for the
 * taller's own plantilla (T1, migration 20260926150000_talleres_
 * plantillas_del_taller.sql): taller_plantilla_clases and
 * taller_plantilla_grupos (embedding taller_plantilla_facilitadores and
 * its usuarios nombre/apellido). Both tables are world-readable
 * (taller_plantilla_*_select policies, USING true) — these loaders
 * return EVERY row, active and inactive alike, never filtering `activo`:
 * the taller screen's Clases/Grupos sections show and let a director
 * reactivate a deactivated row, they don't hide it.
 *
 * Best-effort, same contract as loadCatalogoTalleres (lib/platform/
 * talleres/catalogo.ts): a query error degrades to an empty array rather
 * than throwing — the taller screen still renders, just with an empty
 * plantilla section (indistinguishable from "no plantilla yet", which is
 * an explicitly supported state per acceptance criterion 8's fallback).
 */

export interface PlantillaClase {
  readonly id: string
  readonly numero: number
  readonly tema: string
  readonly activo: boolean
}

export interface PlantillaFacilitador {
  readonly id: string
  readonly personaId: string
  readonly rol: string
  readonly nombre: string | null
  readonly apellido: string | null
}

export interface PlantillaGrupo {
  readonly id: string
  readonly nombre: string
  readonly orden: number
  readonly capacidad: number
  readonly activo: boolean
  readonly facilitadores: readonly PlantillaFacilitador[]
}

interface PlantillaQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, opts?: { ascending?: boolean }): PromiseLike<{
          data: unknown[] | null
          error: { message: string } | null
        }>
      }
    }
  }
}

export async function loadPlantillaClases(
  client: PlantillaQueryClient,
  tallerId: string,
): Promise<readonly PlantillaClase[]> {
  const { data, error } = await client
    .from('taller_plantilla_clases')
    .select('id, numero, tema, activo')
    .eq('taller_id', tallerId)
    .order('numero', { ascending: true })

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    numero: row.numero as number,
    tema: row.tema as string,
    activo: row.activo as boolean,
  }))
}

const FACILITADOR_SELECT = `
  id, nombre, orden, capacidad, activo,
  facilitadores:taller_plantilla_facilitadores (
    id, persona_id, rol,
    usuarios ( nombre, apellido )
  )
`

export async function loadPlantillaGrupos(
  client: PlantillaQueryClient,
  tallerId: string,
): Promise<readonly PlantillaGrupo[]> {
  const { data, error } = await client
    .from('taller_plantilla_grupos')
    .select(FACILITADOR_SELECT)
    .eq('taller_id', tallerId)
    .order('orden', { ascending: true })

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map((row) => {
    const facilitadoresRaw = (row.facilitadores ?? []) as unknown[]
    return {
      id: row.id as string,
      nombre: row.nombre as string,
      orden: row.orden as number,
      capacidad: row.capacidad as number,
      activo: row.activo as boolean,
      facilitadores: facilitadoresRaw.map((f) => {
        const facilitador = f as Record<string, unknown>
        const usuario = (facilitador.usuarios ?? null) as Record<string, unknown> | null
        return {
          id: facilitador.id as string,
          personaId: facilitador.persona_id as string,
          rol: facilitador.rol as string,
          nombre: (usuario?.nombre as string | null) ?? null,
          apellido: (usuario?.apellido as string | null) ?? null,
        }
      }),
    }
  })
}
