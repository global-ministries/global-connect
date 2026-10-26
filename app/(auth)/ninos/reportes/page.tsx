/**
 * Niños — /ninos/reportes (RSC), odd/tasks/ninos-checkin.md N7 and N16.
 *
 * Attendance reports for whoever may configure some Niños area
 * (ninos_puede_configurar_algun_area: Directora de Niños, area coordinators,
 * admin and pastor). Anfitriones and Líderes get a 404. Every aggregate comes
 * from ninos_reporte_asistencia, which also checks authority per room.
 * Query: ?desde=&hasta=&campus=&turno=&vista=mes (default: the last 8
 * Sundays, per Sunday; dates and quick ranges in Caracas time).
 * ?reporte=voluntarios switches to the volunteer attendance tab
 * (odd/tasks/ninos-asistencia-voluntarios.md, V5; ninos_reporte_voluntarios).
 * Whoever may only mark volunteers (ninos_puede_marcar_voluntarios_algun_area,
 * e.g. a sub-area coordinator; V6) gets just that tab, scoped by the RPC to the
 * equipos they mark, with the Sunday turnos from ninos_voluntarios_turnos (they
 * cannot read ninos_salones).
 */
import { notFound } from 'next/navigation'

import { ReportesClient, type FiltrosReporte } from '@/components/ninos/reportes-client'
import { PestanasReportes } from '@/components/ninos/reportes-pestanas'
import { ReportesVoluntariosClient } from '@/components/ninos/reportes-voluntarios-client'
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
    readonly reporte?: string
  }>
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export default async function NinosReportesPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const { data: puedeConfigurar } = await supabase.rpc('ninos_puede_configurar_algun_area')
  if (!puedeConfigurar) {
    const { data: puedeMarcar } = await supabase.rpc('ninos_puede_marcar_voluntarios_algun_area')
    if (!puedeMarcar) notFound()
  }

  const query = await searchParams
  const { campus, turnos } = puedeConfigurar ? await opcionesCompletas(supabase) : await opcionesDeVoluntarios(supabase)

  const hoy = hoyEnCaracas()
  const porDefecto = rangoPorDefecto(hoy)
  const filtros: FiltrosReporte = {
    desde: query.desde && FECHA.test(query.desde) ? query.desde : porDefecto.desde,
    hasta: query.hasta && FECHA.test(query.hasta) ? query.hasta : porDefecto.hasta,
    campusId: campus.find((c) => c.id === query.campus)?.id ?? '',
    turnoId: turnos.find((t) => t.id === query.turno)?.id ?? '',
  }

  const voluntarios = !puedeConfigurar || query.reporte === 'voluntarios'

  return (
    <ContenedorDashboard titulo="Reportes">
      {puedeConfigurar ? <PestanasReportes actual={voluntarios ? 'voluntarios' : 'ninos'} filtros={filtros} /> : null}
      {voluntarios ? (
        <ReportesVoluntariosClient campus={campus} turnos={turnos} filtrosIniciales={filtros} />
      ) : (
        <ReportesClient
          campus={campus}
          turnos={turnos}
          filtrosIniciales={filtros}
          hoy={hoy}
          vistaInicial={query.vista === 'mes' ? 'mes' : 'domingo'}
        />
      )}
    </ContenedorDashboard>
  )
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>
type Opciones = { campus: { id: string; nombre: string }[]; turnos: { id: string; nombre: string; campusId: string }[] }

/** Campuses with active rooms and their active Sunday turnos (children's report viewers). */
async function opcionesCompletas(supabase: Supabase): Promise<Opciones> {
  const { data: salones } = await supabase.from('ninos_salones').select('campus_id').eq('activo', true)
  const campusIds = [...new Set((salones ?? []).map((s) => s.campus_id))]
  if (!campusIds.length) return { campus: [], turnos: [] }
  const [{ data: campus }, { data: turnos }] = await Promise.all([
    supabase.from('campus').select('id, nombre').in('id', campusIds).order('nombre'),
    supabase
      .from('dream_team_turnos')
      .select('id, nombre, campus_id, orden')
      .in('campus_id', campusIds)
      .eq('activo', true)
      .eq('dia_semana', 0)
      // Dated Dream Team shifts never reach Niños (S5, 20261026140000).
      .eq('tipo', 'semanal')
      .order('orden'),
  ])
  return {
    campus: (campus ?? []).map((c) => ({ id: c.id, nombre: c.nombre })),
    turnos: (turnos ?? []).map((t) => ({ id: t.id, nombre: t.nombre, campusId: t.campus_id })),
  }
}

/** The Sunday turnos the caller marks volunteers in, and their campuses (volunteer-only viewers). */
async function opcionesDeVoluntarios(supabase: Supabase): Promise<Opciones> {
  const { data } = await supabase.rpc('ninos_voluntarios_turnos')
  const domingos = (data ?? []).filter((t) => t.dia_semana === 0)
  const campus = new Map(domingos.map((t) => [t.campus_id, { id: t.campus_id, nombre: t.campus }]))
  return {
    campus: [...campus.values()],
    turnos: domingos.map((t) => ({ id: t.id, nombre: t.nombre, campusId: t.campus_id })),
  }
}
