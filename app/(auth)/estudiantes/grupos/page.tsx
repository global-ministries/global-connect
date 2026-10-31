/**
 * Estudiantes — /estudiantes/grupos (RSC), group management for Transit,
 * Inside Out and The Living Room (C2 of odd/tasks/estudiantes-fase-b.md;
 * artboards 06 / 07 / 08 of design/estudiantes-asistencia).
 *
 * Only callers who manage at least one Grupos de Chicas / Chicos sub-área
 * (estudiantes_subareas_gestionables) see it; anyone else gets the app's
 * not-found state. The data loads here (lib/platform/estudiantes/grupos-servidor.ts)
 * and the client island (components/estudiantes/grupos/gestion-grupos-client.tsx)
 * filters, sorts and drives the server actions
 * (lib/actions/estudiantes-grupos.actions.ts). The database checks every
 * change again.
 *
 * Filters come from the URL: `?ambito=&area=&metrica=&anio=&orden=&q=`;
 * `?grupo=` opens that group's drawer (the "‹ Grupos" of its leader list).
 * Not in the menu yet: C4 adds the Estudiantes tab.
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cargarGestionGrupos } from '@/lib/platform/estudiantes/grupos-servidor'
import { leerFiltrosDeUrl, type ParametrosDeUrl } from '@/lib/platform/estudiantes/grupos-vista'
import { GestionGruposClient } from '@/components/estudiantes/grupos/gestion-grupos-client'

export const metadata = { title: 'Grupos de Estudiantes' }

export interface EstudiantesGruposPageProps {
  readonly searchParams?: Promise<ParametrosDeUrl>
}

export default async function EstudiantesGruposPage({ searchParams }: EstudiantesGruposPageProps = {}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const datos = await cargarGestionGrupos(supabase)
  if (!datos) notFound()

  const parametros: ParametrosDeUrl = (await searchParams) ?? {}

  return (
    <GestionGruposClient
      grupos={datos.grupos}
      subareas={datos.subareas}
      escalas={datos.escalas}
      filtrosIniciales={leerFiltrosDeUrl(parametros)}
      grupoInicial={typeof parametros.grupo === 'string' ? parametros.grupo : null}
    />
  )
}
