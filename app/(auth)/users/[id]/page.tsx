/**
 * /users/[id] — the person's ficha (S13 of odd/tasks/sistema-diseno-v2.md,
 * T8-3). Loads everything on the server as the caller, so the database
 * decides what shows:
 * - the person, edit permission and list summary (ficha-persona.ts);
 * - the Asistencia tab's range (?desde=&hasta=; default 12 months) and, for
 *   the Grupos tab, the Grupos de Vida of the whole history, both from
 *   obtener_asistencia_persona (null = not visible);
 * - the Dream Team servicios (ficha-servicio.ts, under RLS);
 * - for admin only, the person's auth id ("Asignar contraseña"), with the
 *   service client as the edit page does.
 */
import { redirect } from 'next/navigation'

import { ErrorFicha } from '@/components/users/ficha/estado-ficha'
import { FichaUsuario } from '@/components/users/ficha/ficha-usuario'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cargarAsistenciaPersona, type AsistenciaPersona } from '@/lib/platform/usuarios/asistencia-persona'
import { cargarFichaPersona } from '@/lib/platform/usuarios/ficha-persona'
import { cargarServiciosPersona } from '@/lib/platform/usuarios/ficha-servicio'
import { leerRango, leerTab, puedeAdministrarCuenta } from '@/lib/platform/usuarios/ficha-vista'

type Parametros = Record<string, string | string[] | undefined>

/** The start of the Grupos tab's history: every membership the person ever had. */
const DESDE_SIEMPRE = '1900-01-01'

async function asistenciaOVacia(promesa: Promise<AsistenciaPersona | null>): Promise<AsistenciaPersona | null> {
  try {
    return await promesa
  } catch (error) {
    console.error('Ficha: asistencia', error)
    return null
  }
}

async function authIdDe(usuarioId: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient().from('usuarios').select('auth_id').eq('id', usuarioId).maybeSingle()
  return (data as { auth_id?: string | null } | null)?.auth_id ?? null
}

export default async function PaginaFichaUsuario({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Parametros>
}) {
  const { id } = await params
  const consulta = await searchParams
  const supabase = await createSupabaseServerClient()
  const actual = await getUserWithRoles(supabase)
  if (!actual) redirect('/login')

  const authId = actual.user.id
  const ficha = await cargarFichaPersona(supabase, { usuarioId: id, authId })
  if (!ficha.ok) return <ErrorFicha motivo={ficha.motivo} mensaje={ficha.mensaje} reintentarHref={`/users/${id}`} />

  const esAdmin = puedeAdministrarCuenta(actual.roles)
  const [asistencia, historia, servicios, authIdPersona] = await Promise.all([
    asistenciaOVacia(cargarAsistenciaPersona(supabase, { usuarioId: id, authId, ...leerRango(consulta) })),
    asistenciaOVacia(cargarAsistenciaPersona(supabase, { usuarioId: id, authId, desde: DESDE_SIEMPRE })),
    cargarServiciosPersona(supabase, id).catch(() => []),
    esAdmin ? authIdDe(id).catch(() => null) : Promise.resolve(undefined),
  ])

  return (
    <FichaUsuario
      persona={ficha.persona}
      resumen={ficha.resumen}
      puedeEditar={ficha.puedeEditar}
      visor={{ roles: actual.roles, usuarioId: actual.platformSession?.personaId ?? null }}
      tabInicial={leerTab(typeof consulta.tab === 'string' ? consulta.tab : null)}
      asistencia={asistencia}
      grupos={historia ? historia.grupos.filter((g) => g.tipo === 'gdv') : null}
      servicios={servicios}
      authIdPersona={authIdPersona}
    />
  )
}
