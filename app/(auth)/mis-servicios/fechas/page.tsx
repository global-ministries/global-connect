/**
 * /mis-servicios/fechas (RSC) — «Fechas que no puedo servir»
 * (odd/tasks/dps-asistencia-pco.md, T15c, S13.5, S13.6; artboard
 * design/dps-avisos/06). Reads the person's blocked dates and their
 * upcoming services (the marks of the Sundays grid); the client island adds
 * and removes dates through lib/actions/dps-avisos.actions.ts.
 */
import { notFound } from 'next/navigation'

import { FechasBloqueadasClient } from '@/components/mis-servicios/fechas-bloqueadas-client'
import { SinServicio } from '@/components/mis-servicios/sin-servicio'
import { cargarMisFechasBloqueadasDps, cargarMisServiciosDps } from '@/lib/actions/dps-avisos.actions'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'

export const metadata = { title: 'Fechas que no puedo servir' }

export default async function FechasBloqueadasPage() {
  if (!isDreamTeamEnabled()) notFound()

  const [fechas, servicios] = await Promise.all([cargarMisFechasBloqueadasDps(), cargarMisServiciosDps()])
  if (!fechas.ok) return <SinServicio titulo="Fechas que no puedo servir" mensaje={fechas.message} />

  return <FechasBloqueadasClient fechas={fechas.data} programados={servicios.ok ? servicios.data.servicios : []} hoy={hoyEnCaracas()} />
}
