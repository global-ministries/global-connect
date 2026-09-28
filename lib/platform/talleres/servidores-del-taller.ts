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
 * B2 correction (T7) — a 42501 (a viewer with no visibility into this
 * taller's node) used to degrade to the SAME empty array as a taller that
 * genuinely has zero active servidores, so the taller page rendered the
 * "sin servidores" empty state for both — indistinguishable from "you
 * cannot see this team". This now returns a discriminated result instead:
 * `{ ok: true, servidores }` on success, or `{ ok: false, reason }` with
 * `reason` telling the two cases apart (`'sin_autoridad'` for a 42501,
 * `'error'` for anything else — a thrown client, a malformed response).
 * Still never throws — same best-effort contract as cargarPermisos (lib/
 * platform/talleres/permisos.ts) — callers that only need the list (the
 * picker options) collapse either failure to `[]` themselves; the taller
 * page uses `reason` to show an access state instead of the empty one.
 */

export interface ServidorDelTaller {
  readonly personaId: string
  readonly nombre: string | null
  readonly apellido: string | null
  readonly rolServicio: string | null
  readonly equipoLabel: string | null
}

export type CargaServidoresDelTaller =
  | { readonly ok: true; readonly servidores: readonly ServidorDelTaller[] }
  | { readonly ok: false; readonly reason: 'sin_autoridad' | 'error' }

interface ServidoresDelTallerClient {
  rpc(
    name: 'talleres_servidores_del_taller',
    args: { p_taller_id: string },
  ): Promise<{ data: unknown; error: { message: string; code?: string } | null }>
}

export async function loadServidoresDelTaller(
  client: ServidoresDelTallerClient,
  tallerId: string,
): Promise<CargaServidoresDelTaller> {
  try {
    const { data, error } = await client.rpc('talleres_servidores_del_taller', {
      p_taller_id: tallerId,
    })
    if (error) {
      return { ok: false, reason: error.code === '42501' ? 'sin_autoridad' : 'error' }
    }
    if (!Array.isArray(data)) return { ok: false, reason: 'error' }

    return {
      ok: true,
      servidores: (data as Array<Record<string, unknown>>).map((row) => ({
        personaId: row.persona_id as string,
        nombre: (row.nombre as string | null) ?? null,
        apellido: (row.apellido as string | null) ?? null,
        rolServicio: (row.rol_servicio as string | null) ?? null,
        equipoLabel: (row.equipo_label as string | null) ?? null,
      })),
    }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

/** Same join-or-fallback shape as grupo-detalle.ts's nombreCompleto, plus an explicit placeholder for a fully-missing name. */
export function nombreCompletoServidor(servidor: ServidorDelTaller): string {
  const nombre = [servidor.nombre, servidor.apellido]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
  return nombre.length > 0 ? nombre : 'Persona sin nombre'
}
