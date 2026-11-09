/**
 * /mis-servicios/[planId] (RSC) — one service of the person in session
 * (odd/tasks/dps-asistencia-pco.md, T15c, S13.5; artboard
 * design/dps-avisos/05). Reads dps_mi_servicio through cargarMiServicioDps
 * (only plans the person was notified of and not taken out of) and the
 * person's blocked dates, so «No puedo» offers to block the date only when
 * it is not blocked yet. The client island answers in place.
 */
import { notFound } from 'next/navigation'

import { DetalleServicioClient } from '@/components/mis-servicios/detalle-servicio-client'
import { SinServicio } from '@/components/mis-servicios/sin-servicio'
import { cargarMiServicioDps, cargarMisFechasBloqueadasDps } from '@/lib/actions/dps-avisos.actions'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'

export const metadata = { title: 'Mi servicio' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function MiServicioPage({ params }: { readonly params: Promise<{ planId: string }> }) {
  if (!isDreamTeamEnabled()) notFound()
  const { planId } = await params
  if (!UUID_RE.test(planId)) notFound()

  const [servicio, fechas] = await Promise.all([cargarMiServicioDps({ planId }), cargarMisFechasBloqueadasDps()])
  if (!servicio.ok) return <SinServicio titulo="Mi servicio" mensaje={servicio.message} />

  const fecha = servicio.data.servicio.fecha
  const fechaBloqueada = fechas.ok && fechas.data.some((f) => f.desde <= fecha && fecha <= f.hasta)
  return <DetalleServicioClient detalle={servicio.data} fechaBloqueada={fechaBloqueada} />
}
