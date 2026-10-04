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
  | { estado: 'sin_confirmar' | 'ya_vinculada' | 'vinculada' | 'creada' | 'ambigua' }
  | { estado: 'error' }

type Ficha = { id: string; auth_id: string | null; email: string | null }

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
 *    has no email or the same confirmed email.
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
  const candidatasCorreo = (porCorreo.data ?? []) as Ficha[]
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
    const elegibles = fichas.filter(
      (f) => !f.auth_id && (!texto(f.email) || mismoCorreo(f.email, email)),
    )
    if (elegibles.length > 1) return { estado: 'ambigua' }
    if (elegibles.length === 1) return vincular(admin, elegibles[0].id, user.id)
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

async function vincular(admin: AdminClient, fichaId: string, authId: string): Promise<ResultadoVinculo> {
  const { error } = await admin
    .from('usuarios')
    .update({ auth_id: authId })
    .eq('id', fichaId)
    .is('auth_id', null)
  return error ? { estado: 'error' } : { estado: 'vinculada' }
}
