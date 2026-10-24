/**
 * Niños — /ninos/reportes (RSC), odd/tasks/ninos-checkin.md N7 and N16.
 *
 * Attendance reports for whoever may configure some Niños area
 * (ninos_puede_configurar_algun_area: Directora de Niños, area coordinators,
 * admin and pastor). Anfitriones and Líderes get a 404. Every aggregate comes
 * from ninos_reporte_asistencia, which also checks authority per room.
 * Query: ?desde=&hasta=&campus=&turno=&vista=mes (default: the last 8
 * Sundays, per Sunday; dates and quick ranges in Caracas time).
 */
import { notFound } from 'next/navigation'

import { ReportesClient, type FiltrosReporte } from '@/components/ninos/reportes-client'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { rangoPorDefecto } from '@/lib/platform/ninos/reportes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Reportes — Niños' }

type Props = {
  readonly searchParams: Promise<{
    readonly desde?: string
    readonly hasta?: string
    readonly campus?: string
    readonly turno?: string
    readonly vista?: string
  }>
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export default async function NinosReportesPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const { data: puede } = await supabase.rpc('ninos_puede_configurar_algun_area')
  if (!puede) notFound()

  const query = await searchParams
  const { data: salones } = await supabase.from('ninos_salones').select('campus_id').eq('activo', true)
  const campusIds = [...new Set((salones ?? []).map((s) => s.campus_id))]
  const [{ data: campus }, { data: turnos }] = campusIds.length
    ? await Promise.all([
        supabase.from('campus').select('id, nombre').in('id', campusIds).order('nombre'),
        supabase
          .from('dream_team_turnos')
          .select('id, nombre, campus_id, orden')
          .in('campus_id', campusIds)
          .eq('activo', true)
          .eq('dia_semana', 0)
          .order('orden'),
      ])
    : [{ data: [] }, { data: [] }]

  const hoy = hoyEnCaracas()
  const porDefecto = rangoPorDefecto(hoy)
  const listaCampus = (campus ?? []).map((c) => ({ id: c.id, nombre: c.nombre }))
  const listaTurnos = (turnos ?? []).map((t) => ({ id: t.id, nombre: t.nombre, campusId: t.campus_id }))
  const filtros: FiltrosReporte = {
    desde: query.desde && FECHA.test(query.desde) ? query.desde : porDefecto.desde,
    hasta: query.hasta && FECHA.test(query.hasta) ? query.hasta : porDefecto.hasta,
    campusId: listaCampus.find((c) => c.id === query.campus)?.id ?? '',
    turnoId: listaTurnos.find((t) => t.id === query.turno)?.id ?? '',
  }

  return (
    <ContenedorDashboard titulo="Reportes">
      <ReportesClient
        campus={listaCampus}
        turnos={listaTurnos}
        filtrosIniciales={filtros}
        hoy={hoy}
        vistaInicial={query.vista === 'mes' ? 'mes' : 'domingo'}
      />
    </ContenedorDashboard>
  )
}
