/**
 * R3f (odd/tasks/talleres-rediseno.md, S2) — client call to the existing
 * POST /api/talleres/inscripciones/asignar-grupo (T2,
 * odd/tasks/talleres-inscripcion-a-grupo.md), which wraps the SECURITY
 * DEFINER RPC and is the security wall. Moved here from the legacy
 * tabla-inscripciones.tsx; the route's own messages are not shown (they are
 * still in voseo), the error code is mapped to neutral «tú» text instead.
 */

export interface ResultadoAsignacion {
  readonly ok: boolean
  /** Neutral Spanish, ready for a toast. */
  readonly mensaje: string
}

interface RespuestaRuta {
  readonly asignadas?: number
  readonly ocupacion?: number | null
  readonly capacidad?: number | null
  readonly error?: string
}

const ERRORES: Readonly<Record<string, string>> = {
  FORBIDDEN: 'No tienes permiso para asignar grupos en esta edición.',
  INVALID_GRUPO: 'Ese grupo es de otra edición.',
  NOT_APROBADA: 'Solo se pueden ubicar inscripciones aprobadas.',
  NOT_FOUND: 'Una o más inscripciones ya no existen. Actualiza la página.',
  MISSING_IDS: 'Elige al menos una inscripción.',
}

const ERROR_GENERAL = 'No se pudo asignar el grupo. Inténtalo de nuevo.'

/** `grupoId` null takes the inscriptions out of their grupo. */
export async function asignarGrupo(
  inscripcionIds: readonly string[],
  grupoId: string | null,
): Promise<ResultadoAsignacion> {
  try {
    const res = await fetch('/api/talleres/inscripciones/asignar-grupo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inscripcion_ids: inscripcionIds, grupo_id: grupoId }),
    })
    const cuerpo = (await res.json().catch(() => ({}))) as RespuestaRuta
    if (!res.ok) return { ok: false, mensaje: (cuerpo.error && ERRORES[cuerpo.error]) || ERROR_GENERAL }
    if (grupoId === null) return { ok: true, mensaje: 'Quitaste el grupo.' }
    const { ocupacion, capacidad } = cuerpo
    let mensaje = 'Grupo asignado.'
    if (typeof ocupacion === 'number' && typeof capacidad === 'number' && ocupacion > capacidad) {
      mensaje += ` El grupo queda con ${ocupacion} de ${capacidad}: ${ocupacion - capacidad} por encima de la capacidad.`
    }
    return { ok: true, mensaje }
  } catch {
    return { ok: false, mensaje: ERROR_GENERAL }
  }
}
