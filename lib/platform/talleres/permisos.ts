/**
 * T1 (odd/tasks/talleres-consolidar-pantallas.md) — app helper for the
 * talleres_mis_permisos(p_equipo_id) RPC (migration
 * 20260919120000_talleres_mis_permisos.sql).
 *
 * The consolidated screens (T2+) resolve "what can this viewer do at
 * this node" ONCE, on the server, and pass it down as a typed prop —
 * never re-derived in the client from a capability array (docs/talleres-
 * de-punta-a-punta.md §9, "Permisos en la interfaz"). This wrapper is the
 * single place that calls the RPC and normalizes its jsonb into a typed,
 * camelCase shape.
 *
 * Best-effort, same contract as generateCertificateForInscription
 * (lib/platform/talleres/certificates.ts): never throws. Any RPC error,
 * a thrown/rejected client, or a missing/malformed payload all resolve
 * to PERMISOS_TALLER_ALL_FALSE — the safe default is "hide every
 * control", never "show it and let RLS 42501".
 */

export interface PermisosTaller {
  readonly ver: boolean
  readonly editarTaller: boolean
  readonly abrirEdicion: boolean
  readonly editarEdicion: boolean
  readonly gestionarGrupos: boolean
  readonly aprobarInscripciones: boolean
  readonly resolverRetiros: boolean
  readonly asignarEquipo: boolean
  readonly verReportes: boolean
  readonly verMetricas: boolean
}

export const PERMISOS_TALLER_ALL_FALSE: PermisosTaller = {
  ver: false,
  editarTaller: false,
  abrirEdicion: false,
  editarEdicion: false,
  gestionarGrupos: false,
  aprobarInscripciones: false,
  resolverRetiros: false,
  asignarEquipo: false,
  verReportes: false,
  verMetricas: false,
}

interface MisPermisosClient {
  rpc(
    name: 'talleres_mis_permisos',
    args: { p_equipo_id: string | null },
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * Loads the caller's permisos for one org-chart node (a taller's
 * dream_team_equipo_id). `equipoId: null` mirrors
 * auth_has_talleres_capability_scoped's own semantics — only a truly
 * global grant (scope_id IS NULL) can satisfy any boolean.
 */
export async function cargarPermisos(
  client: MisPermisosClient,
  equipoId: string | null,
): Promise<PermisosTaller> {
  try {
    const { data, error } = await client.rpc('talleres_mis_permisos', {
      p_equipo_id: equipoId,
    })
    if (error || data === null || typeof data !== 'object') {
      return PERMISOS_TALLER_ALL_FALSE
    }
    const row = data as Record<string, unknown>
    return {
      ver: row.ver === true,
      editarTaller: row.editar_taller === true,
      abrirEdicion: row.abrir_edicion === true,
      editarEdicion: row.editar_edicion === true,
      gestionarGrupos: row.gestionar_grupos === true,
      aprobarInscripciones: row.aprobar_inscripciones === true,
      resolverRetiros: row.resolver_retiros === true,
      asignarEquipo: row.asignar_equipo === true,
      verReportes: row.ver_reportes === true,
      verMetricas: row.ver_metricas === true,
    }
  } catch {
    return PERMISOS_TALLER_ALL_FALSE
  }
}
