/**
 * Servidores — "Quitar de este equipo" (S3 of
 * odd/tasks/dream-team-estructura-correcciones.md): retires ONE servicio
 * through the existing stage change (PATCH /api/dream-team/servicios/[id],
 * the same request "Cambiar etapa" sends), so the state machine, the history
 * row and the grants revocation all run as for any other move to `retirado`.
 * The route checks the permission again.
 */

const CONFLICTO = 'Este servicio fue modificado por otra persona. Recarga la página e intenta de nuevo.'
const ERROR_GENERICO = 'No se pudo quitar de este equipo. Intenta de nuevo.'

/** Retires the servicio; `null` when done, else the message to show. */
export async function quitarServicio(servicioId: string, version: number): Promise<string | null> {
  try {
    const respuesta = await fetch(`/api/dream-team/servicios/${servicioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'retirado', motivo: 'admin_retiro', expectedVersion: version }),
    })
    if (respuesta.status === 409) return CONFLICTO
    if (!respuesta.ok) {
      const cuerpo: unknown = await respuesta.json().catch(() => null)
      const error = cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo ? (cuerpo as { error: unknown }).error : null
      return typeof error === 'string' && error !== '' ? error : ERROR_GENERICO
    }
    return null
  } catch {
    return ERROR_GENERICO
  }
}
