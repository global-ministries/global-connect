/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — loader for the
 * talleres_servidores_del_taller(p_taller_id) RPC (T1, migration
 * 20260926150000_talleres_plantillas_del_taller.sql): every active
 * servidor of the taller's node or a descendant. Backs BOTH the read-only
 * "Equipo" section of /talleres/[taller] (docs/talleres-de-punta-a-
 * punta.md §12: "Asignar coordinador" se elimina; el equipo real se lee de
 * dream_team_servicios vía RPC) and the bounded facilitador picker in the
 * Grupos (plantilla) section — one loader, two consumers, never
 * `talleres_buscar_personas` (that RPC is for Dream Team's own servidor
 * search, out of scope here).
 *
 * Best-effort, same contract as cargarPermisos (lib/platform/talleres/
 * permisos.ts): never throws. Any RPC error (including 42501 for a viewer
 * with no visibility into this taller's node) degrades to an empty array
 * — the safe default is "show nothing", never a thrown page.
 */

export interface ServidorDelTaller {
  readonly personaId: string
  readonly nombre: string | null
  readonly apellido: string | null
  readonly rolServicio: string | null
  readonly equipoLabel: string | null
}

interface ServidoresDelTallerClient {
  rpc(
    name: 'talleres_servidores_del_taller',
    args: { p_taller_id: string },
  ): Promise<{ data: unknown; error: { message: string; code?: string } | null }>
}

export async function loadServidoresDelTaller(
  client: ServidoresDelTallerClient,
  tallerId: string,
): Promise<readonly ServidorDelTaller[]> {
  try {
    const { data, error } = await client.rpc('talleres_servidores_del_taller', {
      p_taller_id: tallerId,
    })
    if (error || !Array.isArray(data)) return []

    return (data as Array<Record<string, unknown>>).map((row) => ({
      personaId: row.persona_id as string,
      nombre: (row.nombre as string | null) ?? null,
      apellido: (row.apellido as string | null) ?? null,
      rolServicio: (row.rol_servicio as string | null) ?? null,
      equipoLabel: (row.equipo_label as string | null) ?? null,
    }))
  } catch {
    return []
  }
}

/** Same join-or-fallback shape as grupo-detalle.ts's nombreCompleto, plus an explicit placeholder for a fully-missing name. */
export function nombreCompletoServidor(servidor: ServidorDelTaller): string {
  const nombre = [servidor.nombre, servidor.apellido]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
  return nombre.length > 0 ? nombre : 'Persona sin nombre'
}
