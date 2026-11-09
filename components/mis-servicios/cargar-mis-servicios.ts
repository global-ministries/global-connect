/**
 * Data of «Mis servicios» on the dashboard (odd/tasks/dps-asistencia-pco.md,
 * T15c, S13.5): dps_mis_servicios through cargarMisServiciosDps, only when
 * Dream Team is on. The card shows only with services or unseen notices, so
 * an empty answer is null; a failure or an answer slower than the timeout
 * also hides it instead of holding up the panel (as the host-home queues).
 */
import { cargarMisServiciosDps } from '@/lib/actions/dps-avisos.actions'
import type { MisServicios } from '@/lib/platform/dps/avisos'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'

export const MIS_SERVICIOS_TIMEOUT_MS = 3000

export async function cargarMisServiciosPanel(): Promise<MisServicios | null> {
  if (!isDreamTeamEnabled()) return null
  let reloj: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<null>((resolve) => {
    reloj = setTimeout(() => {
      console.warn('Mis servicios dashboard card hidden: timed out.', { timeoutMs: MIS_SERVICIOS_TIMEOUT_MS })
      resolve(null)
    }, MIS_SERVICIOS_TIMEOUT_MS)
  })
  const carga = cargarMisServiciosDps()
    .then((resultado) => {
      if (!resultado.ok) {
        console.error('Mis servicios dashboard card hidden:', resultado.message)
        return null
      }
      const { servicios, avisos } = resultado.data
      return servicios.length > 0 || avisos.length > 0 ? resultado.data : null
    })
    .catch((error: unknown) => {
      console.error('Mis servicios dashboard card hidden:', error)
      return null
    })
  try {
    return await Promise.race([carga, limite])
  } finally {
    clearTimeout(reloj)
  }
}
