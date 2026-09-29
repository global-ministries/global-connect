/**
 * Grupos de Vida — /grupos-vida/directores (RSC).
 *
 * One page for the directors of Grupos de Vida: the general directors (what
 * each one sees, per segment) and the stage directors (who they answer to).
 * Admin and pastor manage; a director general sees their own card read-only.
 * The server loader (lib/platform/grupos-vida/directores-datos.ts) checks the
 * role again before reading anything and builds the serializable view model;
 * the client island (components/grupos-vida/directores/directores-client.tsx)
 * renders it and drives the saves.
 *
 * The tab lives in the URL (`?tab=generales|etapa`, default `generales`).
 * Replaces /configuracion/directores-generales, which redirects here.
 */
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { cargarVistaDirectores } from '@/lib/platform/grupos-vida/directores-datos'
import { DirectoresClient, type PestanaDirectores } from '@/components/grupos-vida/directores/directores-client'

export const metadata = {
  title: 'Directores | Grupos de Vida',
  description: 'Directores generales y de etapa de Grupos de Vida: qué ve cada uno y a quién responde',
}

const ROLES_PERMITIDOS = ['admin', 'pastor', 'director-general']

export interface DirectoresPageProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>
}

function leerPestana(valor: string | readonly string[] | undefined): PestanaDirectores {
  const primero = typeof valor === 'string' ? valor : valor?.[0]
  return primero === 'etapa' ? 'etapa' : 'generales'
}

export default async function DirectoresPage({ searchParams }: DirectoresPageProps = {}) {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData?.user) redirect('/login')

  // The role is the only gate, as in the other Grupos de Vida pages. The old
  // /configuracion/directores-generales also required a platform capability
  // that a single admin held, which locked out pastors and general directors.
  if (!userData.roles.some((rol) => ROLES_PERMITIDOS.includes(rol))) redirect('/dashboard')

  const vista = await cargarVistaDirectores({ authId: userData.user.id, roles: userData.roles })
  if (!vista) redirect('/dashboard')

  const parametros = (await searchParams) ?? {}

  return <DirectoresClient vista={vista} tabInicial={leerPestana(parametros.tab)} />
}
