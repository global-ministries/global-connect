/**
 * Estudiantes — /estudiantes/grupos/[grupoId] (RSC), the leader list of a
 * small group: Transit / Inside Out (artboard 01) and The Living Room
 * (artboard 05) of design/estudiantes-asistencia, with "Agregar visitante"
 * (artboard 02). C3b of odd/tasks/estudiantes-fase-b.md.
 *
 * Only callers who see the group in estudiantes_mis_grupos (its leaders, the
 * entrenador / director de grupo of its sub-área, the directors above, admin
 * and the campus pastor) get it; anyone else gets the app's not-found state.
 * The data loads here (lib/platform/estudiantes/lista-servidor.ts) and the
 * client island (components/estudiantes/lista/lista-lider-client.tsx) marks
 * and registers visitors through lib/actions/estudiantes-lista.actions.ts.
 * The database checks every change again.
 *
 * URL: `?fecha=&turno=` (the meeting; the newest one by default) and
 * `?desde=grupos|vivo` (where the back control goes).
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cargarListaLider } from '@/lib/platform/estudiantes/lista-servidor'
import { ListaLiderClient } from '@/components/estudiantes/lista/lista-lider-client'

export const metadata = { title: 'Lista del grupo' }

type Parametros = Readonly<Record<string, string | readonly string[] | undefined>>

const primero = (valor: string | readonly string[] | undefined): string | undefined => (typeof valor === 'string' ? valor : valor?.[0])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ListaGrupoPageProps {
  readonly params: Promise<{ readonly grupoId: string }>
  readonly searchParams?: Promise<Parametros>
}

export default async function ListaGrupoPage({ params, searchParams }: ListaGrupoPageProps) {
  const { grupoId } = await params
  if (!UUID_RE.test(grupoId)) notFound()

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parametros: Parametros = (await searchParams) ?? {}
  const datos = await cargarListaLider(supabase, {
    grupoId,
    authId: user.id,
    pedido: { fecha: primero(parametros.fecha), turno: primero(parametros.turno) },
  })
  if (!datos) notFound()

  // A new meeting starts a fresh island (filters, pending marks, the place).
  const clave = `${datos.sesion?.fecha ?? 'sin'}|${datos.sesion?.turnoId ?? ''}`
  return <ListaLiderClient key={clave} datos={datos} desde={primero(parametros.desde)} />
}
