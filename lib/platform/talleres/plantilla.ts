/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — loaders for the
 * taller's own plantilla (T1, migration 20260926150000_talleres_
 * plantillas_del_taller.sql): taller_plantilla_clases and
 * taller_plantilla_grupos with taller_plantilla_facilitadores. Both
 * tables are world-readable (taller_plantilla_*_select policies, USING
 * true) — these loaders return EVERY row, active and inactive alike,
 * never filtering `activo`: the taller screen's Clases/Grupos sections
 * show and let a director reactivate a deactivated row, they don't hide
 * it.
 *
 * Best-effort, same contract as loadCatalogoTalleres (lib/platform/
 * talleres/catalogo.ts): a query error degrades to an empty array rather
 * than throwing — the taller screen still renders, just with an empty
 * plantilla section (indistinguishable from "no plantilla yet", which is
 * an explicitly supported state per acceptance criterion 8's fallback).
 *
 * FACILITADOR NAMES (post-T7 fix, 2026-09-27): loadPlantillaGrupos used
 * to embed `usuarios ( nombre, apellido )` straight on top of
 * taller_plantilla_facilitadores through PostgREST. `usuarios` carries
 * its OWN RLS (a Grupos de Vida concept — puede_ver_usuario / es_lider_
 * de_grupo / es_director_de_grupo — entirely unrelated to talleres),
 * which silently hid every facilitador's name from a talleres director
 * with no Grupos de Vida relation to that person: the real preview showed
 * "Persona sin nombre" for every facilitador. Names now resolve through
 * talleres_plantilla_facilitadores_personas(p_taller_id) (migration
 * 20260927140000_talleres_plantilla_personas.sql), a SECURITY DEFINER
 * RPC gated by the SAME predicate as talleres_servidores_del_taller —
 * this project's third instance of that fix (see
 * talleres_grupo_equipo_personas in grupo-detalle.ts and
 * dream_team_resolver_nombres for the other two). A persona the RPC
 * doesn't return a match for (RPC error, or a caller who can somehow
 * read the facilitador row but not the RPC) keeps its row with
 * nombre/apellido null — the UI already renders a placeholder for that —
 * it is never dropped.
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
  rpc(
    name: 'talleres_plantilla_facilitadores_personas',
    args: { p_taller_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>
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
    id, persona_id, rol
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

  // Names resolve through talleres_plantilla_facilitadores_personas —
  // never through a usuarios(...) embed (see this file's header). A
  // failed RPC call degrades every facilitador's name to null; it never
  // drops a facilitador row.
  const { data: personasData } = await client.rpc('talleres_plantilla_facilitadores_personas', {
    p_taller_id: tallerId,
  })
  const personasByKey = new Map<string, { nombre: string | null; apellido: string | null }>()
  for (const persona of (personasData ?? []) as Array<{
    plantilla_grupo_id: string
    persona_id: string
    nombre: string | null
    apellido: string | null
  }>) {
    personasByKey.set(`${persona.plantilla_grupo_id}:${persona.persona_id}`, {
      nombre: persona.nombre,
      apellido: persona.apellido,
    })
  }

  return (data as Array<Record<string, unknown>>).map((row) => {
    const grupoId = row.id as string
    const facilitadoresRaw = (row.facilitadores ?? []) as unknown[]
    return {
      id: grupoId,
      nombre: row.nombre as string,
      orden: row.orden as number,
      capacidad: row.capacidad as number,
      activo: row.activo as boolean,
      facilitadores: facilitadoresRaw.map((f) => {
        const facilitador = f as Record<string, unknown>
        const personaId = facilitador.persona_id as string
        const persona = personasByKey.get(`${grupoId}:${personaId}`) ?? null
        return {
          id: facilitador.id as string,
          personaId,
          rol: facilitador.rol as string,
          nombre: persona?.nombre ?? null,
          apellido: persona?.apellido ?? null,
        }
      }),
    }
  })
}

/**
 * One plantilla facilitador an `open_edicion` call would skip right now
 * (T11, "Crear edición" preview) — the same rule `open_edicion` applies at
 * instantiation time (migration 20260927100000_talleres_instanciar_
 * edicion.sql): the persona is not among the taller's current active
 * servidores.
 */
export interface FacilitadorOmitidoPreview {
  readonly personaId: string
  readonly nombre: string
  readonly plantillaGrupo: string
}

/**
 * T11 (odd/tasks/talleres-configuracion-del-taller.md) — preview, before a
 * director confirms "Crear edición", of which plantilla facilitadores would
 * be OMITTED at instantiation (acceptance criterion 3: a paused servidor is
 * never instantiated, and the app says so beforehand too). The caller
 * passes only ACTIVE plantilla grupos, since only those get instantiated —
 * this function does not filter by `activo` itself.
 */
export function previewFacilitadoresOmitidos(
  gruposActivos: readonly PlantillaGrupo[],
  servidorPersonaIds: ReadonlySet<string>,
): readonly FacilitadorOmitidoPreview[] {
  const omitidos: FacilitadorOmitidoPreview[] = []
  for (const grupo of gruposActivos) {
    for (const facilitador of grupo.facilitadores) {
      if (servidorPersonaIds.has(facilitador.personaId)) continue
      const nombre = [facilitador.nombre, facilitador.apellido]
        .filter((part): part is string => typeof part === 'string' && part.length > 0)
        .join(' ')
      omitidos.push({
        personaId: facilitador.personaId,
        nombre: nombre.length > 0 ? nombre : 'Persona sin nombre',
        plantillaGrupo: grupo.nombre,
      })
    }
  }
  return omitidos
}
