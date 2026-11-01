/**
 * Estudiantes — /estudiantes/vivo (RSC), the live view of a Transit / Inside
 * Out meeting for entrenadores, directores de grupo and the directors above
 * (C4b of odd/tasks/estudiantes-fase-b.md; artboards 03 desktop and 04 phone
 * of design/estudiantes-asistencia; S5, Q5).
 *
 * Callers with no meeting to open and no live view (estudiantes_acceso().vivo)
 * get the app's not-found state, as /estudiantes/grupos. The data loads here
 * (lib/platform/estudiantes/vivo-servidor.ts) and the client island
 * (components/estudiantes/vivo/vivo-client.tsx) refreshes it every 15 s
 * through lib/actions/estudiantes-vivo.actions.ts, filters and sorts it.
 *
 * URL: `?ambito&campus&fecha&turno` (the meeting; today or the newest by
 * default; date and turno alone are enough) and the filters
 * `?area&metrica&estado&orden&q`.
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cargarVivo } from '@/lib/platform/estudiantes/vivo-servidor'
import { leerFiltrosVivo, primerParametro, type ParametrosVivo } from '@/lib/platform/estudiantes/vivo-vista'
import { VivoClient } from '@/components/estudiantes/vivo/vivo-client'

export const metadata = { title: 'Estudiantes en vivo' }

export interface EstudiantesVivoPageProps {
  readonly searchParams?: Promise<ParametrosVivo>
}

export default async function EstudiantesVivoPage({ searchParams }: EstudiantesVivoPageProps = {}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parametros: ParametrosVivo = (await searchParams) ?? {}
  const pagina = await cargarVivo(supabase, {
    ambito: primerParametro(parametros.ambito),
    campus: primerParametro(parametros.campus),
    fecha: primerParametro(parametros.fecha),
    turno: primerParametro(parametros.turno),
  })
  if (!pagina) notFound()

  const { opcion } = pagina
  // Another meeting starts a fresh island (data, refresh loop, open drawer).
  const clave = opcion ? `${opcion.ambitoId}|${opcion.campusId}|${opcion.fecha}|${opcion.turnoId}` : 'sin'
  return (
    <VivoClient
      key={clave}
      opciones={pagina.opciones}
      opcion={opcion}
      datos={pagina.datos}
      error={pagina.error}
      filtrosIniciales={leerFiltrosVivo(parametros)}
    />
  )
}
