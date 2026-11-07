/**
 * Grupos de Vida — /grupos-vida/planificar/diagnostico (RSC), "Diagnóstico
 * de cierre" of a planner season (artboard 10 `#diagnostico`; T8b of
 * odd/tasks/planner-gdv.md; S18): the diagnosis of the season the current
 * one closes when published (for 2026-II, 2025 - II), with the same component
 * as the new-season assistant. Opened from the season switcher of the board.
 *
 * Every planner role (admin, pastor, director general, director de etapa);
 * anyone else goes to the dashboard. Read with the session client
 * (cargarDiagnostico): planner_tablero scopes the groups of a director de
 * etapa to their segments (S10), so their diagnosis is of their segments.
 * `?temporada=<id>` diagnoses that season; without it, the most recent in
 * planning.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarX } from 'lucide-react'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { cargarDiagnostico, comoClientePlanner } from '@/lib/platform/grupos-vida/planner/datos'
import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { hrefTemporada } from '@/components/grupos-vida/planner/cabecera-temporada'
import { DiagnosticoCierreVista } from '@/components/grupos-vida/planner/diagnostico-cierre'
import { MigasPlanner } from '@/components/grupos-vida/planner/migas-planner'
import { PlannerError, PlannerSinTemporada } from '@/components/grupos-vida/planner/estado-planner'

export const metadata = { title: 'Diagnóstico de cierre | Grupos de Vida' }

const ROLES_PLANIFICADOR: readonly string[] = ['admin', 'pastor', 'director-general', 'director-etapa']

export interface DiagnosticoPageProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>
}

export default async function DiagnosticoCierrePage({ searchParams }: DiagnosticoPageProps = {}) {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData?.user) redirect('/login')
  if (!userData.roles.some((rol) => ROLES_PLANIFICADOR.includes(rol))) redirect('/dashboard')

  const pedida = (await searchParams)?.temporada
  const id = typeof pedida === 'string' ? pedida : (pedida?.[0] ?? null)
  const resultado = await cargarDiagnostico(comoClientePlanner(supabase), id)

  if (resultado.tipo === 'sin_acceso') redirect('/dashboard')
  if (resultado.tipo === 'error') return <PlannerError mensaje={resultado.mensaje} />
  if (resultado.tipo === 'sin_temporada') {
    return <PlannerSinTemporada puedeCrearTemporada={['admin', 'pastor', 'director-general'].some((r) => userData.roles.includes(r))} />
  }

  const { temporada } = resultado
  const volver = (
    <BotonSistema asChild variante="outline" tamaño="sm">
      <Link href={hrefTemporada(temporada.id)}>Volver al tablero</Link>
    </BotonSistema>
  )
  return (
    <PaginaSistema
      breadcrumbs={<MigasPlanner actual="Diagnóstico de cierre" temporada={{ nombre: temporada.nombre, href: hrefTemporada(temporada.id) }} />}
      acciones={volver}
    >
      {resultado.tipo === 'sin_origen' ? (
        <div className="rounded-2xl border border-border bg-card py-6">
          <EstadoVacioSistema
            icono={CalendarX}
            titulo={`${temporada.nombre} no cierra ninguna temporada`}
            subtitulo="Es la primera de su cohorte: al publicarla no se archiva ninguna."
            accion={volver}
          />
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Cómo termina {resultado.origen.nombre}</h1>
            <p className="text-[15px] text-muted-foreground">La temporada que se cierra cuando publiques {temporada.nombre}. Es el mismo diagnóstico del asistente de nueva temporada.</p>
          </div>
          <DiagnosticoCierreVista diagnostico={resultado.diagnostico} origen={resultado.origen.nombre} destino={temporada.nombre} />
        </>
      )}
    </PaginaSistema>
  )
}
