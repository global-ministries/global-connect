/**
 * Estudiantes — /estudiantes/promocion (RSC), "Promover temporada" (C6b3 of
 * odd/tasks/estudiantes-fase-b.md, S11–S15; artboards 09 / 10 of
 * design/estudiantes-asistencia).
 *
 * Campus: the ones where the caller manages a Transit / Inside Out sub-área
 * (estudiantes_subareas_gestionables, as /estudiantes/grupos), kept to those
 * where estudiantes_promocion_vista does not answer sin_autoridad (level 3 on
 * every Transit and Inside Out sub-área of the campus, S15). None left → the
 * app's not-found state. `?campus=` picks one (the first by name otherwise);
 * the client island shows a campus select when there is more than one.
 * escala_invalida (no year scale) becomes an empty state.
 *
 * The client island (components/estudiantes/promocion/promocion-client.tsx)
 * holds the 3er año choices and applies through
 * lib/actions/estudiantes-promocion.actions.ts; the database checks it all
 * again. URL: `?campus&ambito&metrica&q`.
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { aSubareas } from '@/lib/platform/estudiantes/grupos-datos'
import {
  MENSAJES_ERROR_PROMOCION,
  campusDePromocion,
  codigoErrorPromocion,
  elegirCampus,
  leerFiltrosPromocion,
  leerVistaPromocion,
  type ContenidoPromocion,
  type ParametrosPromocion,
} from '@/lib/platform/estudiantes/promocion'
import { PromocionClient } from '@/components/estudiantes/promocion/promocion-client'

export const metadata = { title: 'Promover temporada — Estudiantes' }

const SIN_CARGAR = 'No se pudo cargar la promoción. Recarga la página.'

export interface EstudiantesPromocionPageProps {
  readonly searchParams?: Promise<ParametrosPromocion>
}

export default async function EstudiantesPromocionPage({ searchParams }: EstudiantesPromocionPageProps = {}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: filas, error } = await supabase.rpc('estudiantes_subareas_gestionables')
  if (error) console.error('[estudiantes/promocion] subareas_gestionables failed', error)
  const candidatos = campusDePromocion(aSubareas(filas ?? []))
  if (candidatos.length === 0) notFound()

  const [parametros, respuestas] = await Promise.all([
    searchParams,
    Promise.all(candidatos.map((c) => supabase.rpc('estudiantes_promocion_vista', { p_campus_id: c.id }))),
  ])
  const conAutoridad = candidatos.flatMap((c, i) => (codigoErrorPromocion(respuestas[i].error) === 'sin_autoridad' ? [] : [{ campus: c, respuesta: respuestas[i] }]))
  const query = parametros ?? {}
  const pedido = Array.isArray(query.campus) ? query.campus[0] : query.campus
  const elegido = elegirCampus(
    conAutoridad.map((x) => x.campus),
    pedido,
  )
  if (!elegido) notFound()

  const { respuesta } = conAutoridad.find((x) => x.campus.id === elegido.id)!
  let contenido: ContenidoPromocion
  if (respuesta.error) {
    const codigo = codigoErrorPromocion(respuesta.error)
    if (codigo === 'escala_invalida') contenido = { tipo: 'sin_escala' }
    else {
      if (!codigo) console.error('[estudiantes/promocion] promocion_vista failed', elegido.id, respuesta.error)
      contenido = { tipo: 'error', mensaje: codigo ? MENSAJES_ERROR_PROMOCION[codigo] : SIN_CARGAR }
    }
  } else {
    const vista = leerVistaPromocion(respuesta.data)
    contenido = vista ? { tipo: 'vista', vista } : { tipo: 'error', mensaje: SIN_CARGAR }
  }

  return (
    // Another campus starts a fresh island (choices, filters, drawer).
    <PromocionClient
      key={elegido.id}
      campus={conAutoridad.map((x) => x.campus)}
      campusId={elegido.id}
      contenido={contenido}
      filtrosIniciales={leerFiltrosPromocion(query)}
    />
  )
}
