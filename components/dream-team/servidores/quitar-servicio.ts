/**
 * Servidores — "Quitar de este equipo" (S3, S7 of
 * odd/tasks/dream-team-estructura-correcciones.md): quits ONE servicio through
 * DELETE /api/dream-team/servicios/[id]. The route checks the permission and
 * the version, retires it as "Cambiar etapa" would (state machine, grants
 * revocation) and, until 2027-01-01 (Caracas), then deletes it without a
 * trace; from that date it stays retired with its history.
 */

const CONFLICTO = 'Este servicio fue modificado por otra persona. Recarga la página e intenta de nuevo.'
const ERROR_GENERICO = 'No se pudo quitar de este equipo. Intenta de nuevo.'

/** Quits the servicio; `null` when done, else the message to show. */
export async function quitarServicio(servicioId: string, version: number): Promise<string | null> {
  try {
    const respuesta = await fetch(`/api/dream-team/servicios/${servicioId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: version }),
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
