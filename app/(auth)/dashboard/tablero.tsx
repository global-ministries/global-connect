/**
 * What the home still reads from the previous dashboard
 * (odd/tasks/home-por-rol.md T4): obtener_datos_dashboard, narrowed to the
 * campus picked in the browser, «Visión general» for admin and pastor from
 * its widgets, and the «Contextos visibles» behind the platform flag.
 * Loaded only when «A tu cargo» or «Visión general» is present; a failure
 * leaves both without it, never the page.
 */
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'

import { ContextosVisibles } from '@/components/inicio/contextos-visibles'
import type { DatosVisionGeneral } from '@/components/inicio/seccion-vision-general'
import { getDashboardPlatformNavigationFlags, resolveDashboardContextualAccess } from '@/lib/dashboard/contextual-navigation'
import { obtenerDatosDashboard } from '@/lib/dashboard/obtenerDatosDashboard'
import type { ClienteInicio } from '@/lib/inicio/cargar-hechos'

// Written by CampusProvider (hooks/useCampus.tsx) when the person picks a campus.
const CAMPUS_COOKIE = 'gc_campus_activo'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEMANAS_TENDENCIA = 8
const ROLES_CAMPUS = new Set(['admin', 'pastor'])

// The cookie is client-controlled, so only a well-formed uuid is accepted; it narrows the
// first paint to the selected campus and is never used for access control.
async function leerCampusInicial(): Promise<string | null> {
  const valor = (await cookies()).get(CAMPUS_COOKIE)?.value
  return valor && UUID_RE.test(valor) ? valor : null
}

export type Tablero = {
  rol: string
  widgets: Record<string, unknown>
  campusId: string | null
  contextos: ReactNode
}

export async function cargarTablero(): Promise<Tablero | null> {
  try {
    const data = await obtenerDatosDashboard(await leerCampusInicial())
    const items = await resolveDashboardContextualAccess(data.platformSession, getDashboardPlatformNavigationFlags())
    return {
      rol: data.rol,
      widgets: data.widgets,
      campusId: data.campusId ?? null,
      contextos: items.length > 0 ? <ContextosVisibles items={items} /> : null,
    }
  } catch (error) {
    console.error('Inicio: no se pudo leer el tablero:', error instanceof Error ? error.message : error)
    return null
  }
}

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const numero = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(objeto).filter((f): f is Record<string, unknown> => f !== null) : [])

const redondo = (v: number | null): number | null => (v === null ? null : Math.round(v))

/** Activo / postulado servicios of Dream Team; null when the count fails. */
async function contarServicios(supabase: ClienteInicio, estado: 'activo' | 'postulado'): Promise<number | null> {
  try {
    const { count, error } = await supabase.from('dream_team_servicios').select('id', { count: 'exact', head: true }).eq('estado', estado)
    if (error) throw new Error(error.message)
    return count ?? null
  } catch (error) {
    console.error(`Inicio: no se pudo contar Dream Team (${estado}):`, error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * The campus numbers, only when obtener_datos_dashboard answered as admin or
 * pastor: a director general's widgets are their segmentos, never shown as
 * the campus (S7).
 */
export async function cargarVisionGeneral(
  supabase: ClienteInicio,
  tablero: Pick<Tablero, 'rol' | 'widgets'> | null,
  gruposSinCasa: number,
): Promise<DatosVisionGeneral | null> {
  if (!tablero || !ROLES_CAMPUS.has(tablero.rol)) return null
  const w = tablero.widgets
  const kpis = objeto(w.kpis_globales)
  const valor = (clave: string) => numero(objeto(kpis?.[clave])?.valor)
  const [dreamTeam, postulados] = await Promise.all([contarServicios(supabase, 'activo'), contarServicios(supabase, 'postulado')])

  return {
    personas: valor('total_miembros'),
    nuevos: valor('nuevos_miembros_mes'),
    grupos: valor('grupos_activos'),
    asistencia: redondo(valor('asistencia_semanal')),
    dreamTeam,
    tendencia: lista(w.tendencia_asistencia)
      .map((s) => redondo(numero(s.porcentaje)))
      .filter((p): p is number => p !== null)
      .slice(-SEMANAS_TENDENCIA),
    gruposEnRiesgo: lista(w.grupos_en_riesgo).flatMap((g) => {
      const grupoId = typeof g.id === 'string' ? g.id : null
      const nombre = typeof g.nombre === 'string' ? g.nombre : null
      return grupoId && nombre ? [{ grupoId, nombre, asistencia: redondo(numero(g.porcentaje_asistencia)) }] : []
    }),
    gruposSinCasa,
    postulados,
  }
}
