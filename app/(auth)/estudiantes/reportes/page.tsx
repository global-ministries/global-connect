/**
 * Estudiantes — /estudiantes/reportes (RSC), "Reportes de asistencia" (C6d3
 * of odd/tasks/estudiantes-fase-b.md, S17–S20; artboards 11 / 12 of
 * design/estudiantes-asistencia), in the planning style of
 * odd/tasks/estudiantes-estilo-dps.md (S7; design/estudiantes-dps 15 / 16).
 *
 * Who (S19, level >= 2 on a sub-área, within the campus): the sub-áreas of
 * estudiantes_subareas_gestionables (level 3, the same source as
 * /estudiantes/grupos and /estudiantes/promocion) plus the active groups of
 * estudiantes_mis_grupos seen at level >= 2 (`puede_ver_vivo`), which is the
 * only existing source that also covers a The Living Room entrenador
 * (estudiantes_acceso().vivo is Transit / Inside Out only). Nothing → the
 * app's not-found state. Campus names come from the first source, else from
 * `campus` (as /ninos/reportes).
 *
 * Data: estudiantes_reporte_asistencia for every ámbito of the campus (the
 * ámbito cards show each one's %), Transit → Inside Out → The Living Room
 * (S20); the ones that answer sin_autoridad are left out, and none left →
 * not found. Then estudiantes_reporte_embudo for the selected ámbito and,
 * only when it is The Living Room, estudiantes_reporte_conexiones for the
 * same range and sub-área (the 4 connections of S21, C7c); when that call
 * fails the attendance report still renders, without the extra columns. The
 * client island (components/estudiantes/reportes/reportes-client.tsx) loads
 * the drawers through lib/actions/estudiantes-reportes.actions.ts.
 *
 * URL: `?campus&ambito&subarea` (scope), `?rango` or `?desde&hasta` (last 8
 * weeks ending today by default), `?tab&metrica&orden&q` (list) and
 * `?grupo` / `?persona` (the drawer that opens on load).
 */
import { notFound, redirect } from 'next/navigation'

import { ReportesClient, type ContenidoReportes } from '@/components/estudiantes/reportes/reportes-client'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import {
  ambitosDeCampus,
  campusDeReportes,
  campusSinNombre,
  codigoErrorReportes,
  elegirCampusReporte,
  leerEmbudo,
  leerFiltrosReportes,
  leerReporteAsistencia,
  mensajeErrorReportes,
  opcionesReportes,
  resolverRango,
  tarjetaAmbito,
  SIN_CARGAR_REPORTE,
  type Embudo,
  type ParametrosReportes,
  type TarjetaAmbitoReporte,
} from '@/lib/platform/estudiantes/reportes'
import { leerReporteConexiones, type ReporteConexiones } from '@/lib/platform/estudiantes/conexiones'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Reportes — Estudiantes' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const primero = (valor: string | readonly string[] | undefined): string | undefined => (Array.isArray(valor) ? valor[0] : (valor as string | undefined))
const uuid = (valor: string | readonly string[] | undefined): string | null => {
  const v = primero(valor)
  return v && UUID_RE.test(v) ? v : null
}

export interface EstudiantesReportesPageProps {
  readonly searchParams?: Promise<ParametrosReportes>
}

export default async function EstudiantesReportesPage({ searchParams }: EstudiantesReportesPageProps = {}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [gestionables, misGrupos, parametros] = await Promise.all([
    supabase.rpc('estudiantes_subareas_gestionables'),
    supabase.rpc('estudiantes_mis_grupos'),
    searchParams,
  ])
  if (gestionables.error) console.error('[estudiantes/reportes] subareas_gestionables failed', gestionables.error)
  if (misGrupos.error) console.error('[estudiantes/reportes] mis_grupos failed', misGrupos.error)
  const opciones = opcionesReportes(gestionables.data ?? [], misGrupos.data ?? [])
  if (opciones.length === 0) notFound()

  const sinNombre = campusSinNombre(opciones)
  const nombres: Record<string, string> = {}
  if (sinNombre.length) {
    const { data } = await supabase.from('campus').select('id, nombre').in('id', sinNombre)
    for (const c of data ?? []) nombres[c.id] = c.nombre
  }
  const campus = campusDeReportes(opciones, nombres)
  const query = parametros ?? {}
  const elegido = elegirCampusReporte(campus, primero(query.campus))
  if (!elegido) notFound()

  const ambitos = ambitosDeCampus(opciones, elegido.id)
  const hoy = hoyEnCaracas()
  const rango = resolverRango(query, hoy)
  const pedido = ambitos.find((a) => a.id === uuid(query.ambito)) ?? ambitos[0]
  const subareaPedida = pedido?.subareas.find((s) => s.id === uuid(query.subarea))?.id ?? null

  const respuestas = await Promise.all(
    ambitos.map((a) =>
      supabase.rpc('estudiantes_reporte_asistencia', {
        p_ambito_id: a.id,
        p_campus_id: elegido.id,
        p_desde: rango.desde,
        p_hasta: rango.hasta,
        ...(a.id === pedido?.id && subareaPedida ? { p_subarea_id: subareaPedida } : {}),
      }),
    ),
  )
  const visibles = ambitos.flatMap((a, i) => (codigoErrorReportes(respuestas[i].error) === 'sin_autoridad' ? [] : [{ ambito: a, respuesta: respuestas[i] }]))
  if (visibles.length === 0) notFound()

  const actual = visibles.find((v) => v.ambito.id === pedido?.id) ?? visibles[0]
  const subareaId = actual.ambito.id === pedido?.id ? subareaPedida : null

  let contenido: ContenidoReportes
  if (actual.respuesta.error) {
    if (!codigoErrorReportes(actual.respuesta.error)) console.error('[estudiantes/reportes] reporte_asistencia failed', actual.ambito.id, actual.respuesta.error)
    contenido = { tipo: 'error', mensaje: mensajeErrorReportes(actual.respuesta.error) }
  } else {
    const reporte = leerReporteAsistencia(actual.respuesta.data)
    contenido = reporte ? { tipo: 'reporte', reporte } : { tipo: 'error', mensaje: SIN_CARGAR_REPORTE }
  }

  const tarjetas: TarjetaAmbitoReporte[] = visibles.map(({ ambito, respuesta }) => {
    const reporte = respuesta.error ? null : leerReporteAsistencia(respuesta.data)
    return reporte ? tarjetaAmbito(ambito, reporte) : { id: ambito.id, nombre: ambito.nombre, grupos: 0, porcentaje: null, insignias: [] }
  })

  const livingRoom = actual.ambito.experiencia === 'the_living_room'
  const [embudoRes, conexionesRes] = await Promise.all([
    supabase.rpc('estudiantes_reporte_embudo', {
      p_ambito_id: actual.ambito.id,
      p_campus_id: elegido.id,
      ...(subareaId ? { p_subarea_id: subareaId } : {}),
    }),
    livingRoom && contenido.tipo === 'reporte'
      ? supabase.rpc('estudiantes_reporte_conexiones', {
          p_ambito_id: actual.ambito.id,
          p_campus_id: elegido.id,
          p_desde: rango.desde,
          p_hasta: rango.hasta,
          ...(subareaId ? { p_subarea_id: subareaId } : {}),
        })
      : null,
  ])
  let embudo: Embudo | null = null
  let errorEmbudo: string | null = null
  if (embudoRes.error) {
    if (!codigoErrorReportes(embudoRes.error)) console.error('[estudiantes/reportes] reporte_embudo failed', actual.ambito.id, embudoRes.error)
    errorEmbudo = mensajeErrorReportes(embudoRes.error)
  } else {
    embudo = leerEmbudo(embudoRes.data)
    if (!embudo) errorEmbudo = SIN_CARGAR_REPORTE
  }

  // Fail soft: without the connections the Personas tab is the one of Transit / Inside Out.
  let conexiones: ReporteConexiones | null = null
  if (conexionesRes?.error) console.error('[estudiantes/reportes] reporte_conexiones failed', actual.ambito.id, conexionesRes.error)
  else if (conexionesRes) conexiones = leerReporteConexiones(conexionesRes.data)

  return (
    // Another campus starts a fresh island; the ámbito, sub-área and range keep the list filters.
    <ReportesClient
      key={elegido.id}
      campus={campus}
      campusId={elegido.id}
      ambitos={tarjetas}
      ambitoId={actual.ambito.id}
      subareaId={subareaId}
      rango={rango}
      hoy={hoy}
      contenido={contenido}
      embudo={embudo}
      errorEmbudo={errorEmbudo}
      livingRoom={livingRoom}
      conexiones={conexiones}
      filtrosIniciales={leerFiltrosReportes(query)}
      detalleInicial={{ grupoId: uuid(query.grupo), personaId: uuid(query.persona) }}
    />
  )
}
