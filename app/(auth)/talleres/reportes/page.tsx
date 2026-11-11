/**
 * /talleres/reportes — «Reportes de talleres», rebuilt on the v2 system in
 * R3g of odd/tasks/talleres-rediseno.md (S1/S2/S4; artboard
 * design/talleres-interior/25-reportes-escritorio.html). Read only.
 *
 * GATE (unchanged from T7 of odd/tasks/talleres-consolidar-pantallas.md):
 * flag -> user -> session, each an informational card. No role required.
 *   - grupo reports: RLS on taller_reportes decides which rows come back
 *     (loadReportes); a report whose equipo or grupo cannot be resolved is
 *     never dropped (T6b's rule) and the «Reabierto» state always shows
 *     (the regression T7 fixed).
 *   - ediciones (Por taller / Por edición): loadEdicionesReporte keeps only
 *     the ediciones whose equipo grants the viewer `verReportes`
 *     (talleres_mis_permisos) — the same permission the report counters use.
 *
 * COUNTER LINE (T7's breadth rule, unchanged): the estado counts of the
 * grupo reports show only when the viewer holds `verReportes` on MORE THAN
 * ONE distinct equipo among the visible reports — gated on breadth, never
 * on role.
 *
 * Every rule of ranges, roll-ups and pills lives in
 * lib/platform/talleres/reportes-vista.ts; the screen is
 * components/talleres/reportes/reportes-talleres-client.tsx.
 */
import {
  PaginaSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { MigasReportesTalleres } from '@/components/talleres/reportes/partes-reportes'
import { ReportesTalleresClient, TITULO_REPORTES } from '@/components/talleres/reportes/reportes-talleres-client'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { hoyIglesia } from '@/lib/platform/talleres/minimo-suspension'
import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'
import { loadEdicionesReporte, loadReportes, type ReporteRow } from '@/lib/platform/talleres/reportes'
import { parseConsultaReportes, type ReporteGrupo } from '@/lib/platform/talleres/reportes-vista'
import { cargarPermisosPorEquipos } from '@/lib/platform/talleres/permisos'

export const metadata = { title: 'Reportes' }

type Parametros = Record<string, string | string[] | undefined>

export interface ReportesPageProps {
  readonly searchParams?: Promise<Parametros>
}

/** A gate card (a plain call, so the page returns the card itself). */
function aviso(texto: string) {
  return (
    <PaginaSistema titulo={TITULO_REPORTES} breadcrumbs={<MigasReportesTalleres />}>
      <TarjetaSistema variante="outlined" className="p-6 text-center">
        <TextoSistema variante="sutil">{texto}</TextoSistema>
      </TarjetaSistema>
    </PaginaSistema>
  )
}

function aGrupo(r: ReporteRow): ReporteGrupo {
  return {
    id: r.id,
    grupoId: r.grupo_id,
    grupoNombre: r.grupoNombre,
    estado: r.estado,
    firmaLiderFecha: r.firma_lider_fecha,
    reabiertoMotivo: r.reabierto_motivo,
    tallerNombre: r.tallerNombre,
    edicionId: r.edicionId,
  }
}

export default async function ReportesPage({ searchParams }: ReportesPageProps = {}) {
  if (!isTalleresEnabled()) return aviso('El módulo de talleres está deshabilitado.')

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return aviso('Necesitas iniciar sesión.')

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) return aviso('No se pudo resolver tu sesión.')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase

  // Same as the catálogo and edición pages: the stored estado follows the dates before reading.
  await refrescarEstadosEdiciones(client)

  const [rows, ediciones, parametros] = await Promise.all([
    loadReportes(client),
    loadEdicionesReporte(client),
    searchParams ?? Promise.resolve({} as Parametros),
  ])

  const equipoIds = Array.from(new Set(rows.map((r) => r.equipoId)))
  const permisosPorEquipo = await cargarPermisosPorEquipos(client, equipoIds)
  const equiposConVerReportes = equipoIds.filter((id) => permisosPorEquipo.get(id)?.verReportes === true)
  const mostrarContadores = equiposConVerReportes.length > 1

  return (
    <PaginaSistema titulo={TITULO_REPORTES} breadcrumbs={<MigasReportesTalleres />}>
      <ReportesTalleresClient
        hoy={hoyIglesia()}
        ediciones={ediciones}
        grupos={rows.map(aGrupo)}
        consultaInicial={parseConsultaReportes(parametros)}
        mostrarContadores={mostrarContadores}
      />
    </PaginaSistema>
  )
}
