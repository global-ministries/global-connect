import type { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { prepararCedula } from '@/lib/utils/cedula'

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

export type UsuarioConfirmado = {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
  user_metadata?: Record<string, unknown> | null
}

export type ResultadoVinculo =
  | {
      estado:
        | 'sin_confirmar'
        | 'ya_vinculada'
        | 'vinculada'
        | 'creada'
        | 'ambigua'
        | 'pendiente_aprobacion'
    }
  | { estado: 'error' }

type Ficha = { id: string; auth_id: string | null; email: string | null }

/** Roles that make a ficha worth taking over: a cédula alone is not enough for them. */
const ROLES_DE_SERVICIO = new Set(['lider', 'director-etapa', 'director-general', 'pastor', 'admin'])

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

/** ILIKE pattern that matches the value literally, ignoring case only. */
function patronLiteral(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function mismoCorreo(a: string | null, b: string): boolean {
  return (a ?? '').trim().toLowerCase() === b.toLowerCase()
}

/**
 * Binds a `usuarios` ficha to an auth account. Runs only after the email is
 * confirmed, so knowing someone else's email or cédula is not enough to take
 * their ficha.
 *
 * 1. A ficha already bound to this account: nothing to do.
 * 2. Unclaimed fichas with the confirmed email (case-insensitive): exactly one is linked; several
 *    leave the account unlinked for an administrator to resolve.
 * 3. Otherwise the unclaimed ficha with the typed cédula (UNIQUE), only when it
 *    has no email or the same confirmed email. When that ficha holds a service
 *    role or an active Dream Team service, a pending request is stored for its
 *    directors to approve (vinculos_pendientes) instead of linking.
 * Fichas with an open access invitation (a spouse ficha created at a taller
 * enrollment) are never candidates in 2 or 3: that person claims the ficha
 * through /activar, which checks the invitation token and the cédula.
 *
 * 4. Otherwise a placeholder ficha is created, without the cédula when that
 *    cédula already belongs to another ficha.
 */
export async function vincularFichaConfirmada(
  admin: AdminClient,
  user: UsuarioConfirmado,
): Promise<ResultadoVinculo> {
  const email = texto(user.email).toLowerCase()
  if (!user.email_confirmed_at || !email) return { estado: 'sin_confirmar' }

  const metadata = user.user_metadata ?? {}
  const cedula = prepararCedula(texto(metadata.cedula))

  const propia = await admin.from('usuarios').select('id').eq('auth_id', user.id)
  if (propia.error) return { estado: 'error' }
  if ((propia.data ?? []).length > 0) return { estado: 'ya_vinculada' }

  const porCorreo = await admin
    .from('usuarios')
    .select('id, auth_id, email')
    .ilike('email', patronLiteral(email))
    .is('auth_id', null)
    .order('id')
  if (porCorreo.error) return { estado: 'error' }
  const candidatasCorreo = await sinInvitacionAbierta(admin, (porCorreo.data ?? []) as Ficha[])
  if (candidatasCorreo === null) return { estado: 'error' }
  if (candidatasCorreo.length > 1) return { estado: 'ambigua' }
  if (candidatasCorreo.length === 1) return vincular(admin, candidatasCorreo[0].id, user.id)

  let cedulaLibre = cedula
  if (cedula) {
    const porCedula = await admin
      .from('usuarios')
      .select('id, auth_id, email')
      .eq('cedula', cedula)
      .order('id')
    if (porCedula.error) return { estado: 'error' }
    const fichas = (porCedula.data ?? []) as Ficha[]
    const elegibles = await sinInvitacionAbierta(
      admin,
      fichas.filter((f) => !f.auth_id && (!texto(f.email) || mismoCorreo(f.email, email))),
    )
    if (elegibles === null) return { estado: 'error' }
    if (elegibles.length > 1) return { estado: 'ambigua' }
    if (elegibles.length === 1) {
      const servicio = await tieneServicio(admin, elegibles[0].id)
      if (servicio === null) return { estado: 'error' }
      if (servicio) return pedirAprobacion(admin, elegibles[0].id, user.id)
      return vincular(admin, elegibles[0].id, user.id)
    }
    if (fichas.length > 0) cedulaLibre = null
  }

  const { error } = await admin.from('usuarios').insert([
    {
      auth_id: user.id,
      nombre: texto(metadata.nombre),
      apellido: texto(metadata.apellido),
      email,
      cedula: cedulaLibre,
      fecha_nacimiento: '1900-01-01',
      genero: 'Otro',
      estado_civil: 'Soltero',
    },
  ])
  return error ? { estado: 'error' } : { estado: 'creada' }
}

/** The fichas without an open access invitation; null on error. */
async function sinInvitacionAbierta(admin: AdminClient, fichas: Ficha[]): Promise<Ficha[] | null> {
  const libres: Ficha[] = []
  for (const ficha of fichas) {
    const { data, error } = await admin.rpc('ficha_tiene_invitacion_abierta', { p_usuario_id: ficha.id })
    if (error) return null
    if (data !== true) libres.push(ficha)
  }
  return libres
}

async function vincular(admin: AdminClient, fichaId: string, authId: string): Promise<ResultadoVinculo> {
  const { error } = await admin
    .from('usuarios')
    .update({ auth_id: authId })
    .eq('id', fichaId)
    .is('auth_id', null)
  return error ? { estado: 'error' } : { estado: 'vinculada' }
}

/** true when the ficha holds a service role or an active Dream Team service; null on error. */
async function tieneServicio(admin: AdminClient, fichaId: string): Promise<boolean | null> {
  const roles = await admin
    .from('usuario_roles')
    .select('roles_sistema!usuario_roles_rol_id_fkey(nombre_interno)')
    .eq('usuario_id', fichaId)
  if (roles.error) return null
  const filas = (roles.data ?? []) as { roles_sistema: { nombre_interno: string } | null }[]
  if (filas.some((f) => ROLES_DE_SERVICIO.has(f.roles_sistema?.nombre_interno ?? ''))) return true

  const servicios = await admin
    .from('dream_team_servicios')
    .select('id')
    .eq('persona_id', fichaId)
    .eq('estado', 'activo')
  if (servicios.error) return null
  return (servicios.data ?? []).length > 0
}

async function pedirAprobacion(
  admin: AdminClient,
  fichaId: string,
  authId: string,
): Promise<ResultadoVinculo> {
  const abierta = await admin
    .from('vinculos_pendientes')
    .select('id')
    .eq('ficha_id', fichaId)
    .eq('auth_user_id', authId)
    .eq('estado', 'pendiente')
  if (abierta.error) return { estado: 'error' }
  if ((abierta.data ?? []).length > 0) return { estado: 'pendiente_aprobacion' }

  const { error } = await admin
    .from('vinculos_pendientes')
    .insert([{ ficha_id: fichaId, auth_user_id: authId }])
  return error ? { estado: 'error' } : { estado: 'pendiente_aprobacion' }
}
