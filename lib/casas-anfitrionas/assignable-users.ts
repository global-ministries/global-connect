import type { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { createSupabaseServerClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>
type AdminClient = ReturnType<typeof createSupabaseAdminClient>

export interface UsuarioAsignableCasaOption {
  value: string
  label: string
}

type UsuarioRow = { id: string; nombre: string | null; apellido: string | null }
type CasaOcupacionRow = { id?: string | null; usuario_id: string | null; co_anfitrion_id: string | null }

export async function obtenerUsuariosAsignablesCasaAnfitriona({
  supabase,
  adminDb,
  authId,
  currentCasaId,
  currentOwner,
}: {
  supabase: ServerClient
  adminDb: AdminClient
  authId: string
  currentCasaId?: string
  currentOwner?: UsuarioAsignableCasaOption | null
}): Promise<UsuarioAsignableCasaOption[]> {
  const [{ data: usuarios }, { data: casasExistentes }] = await Promise.all([
    adminDb.from('usuarios').select('id, nombre, apellido').order('nombre'),
    adminDb.from('casas_anfitrionas').select('id, usuario_id, co_anfitrion_id'),
  ])

  const idsOcupados = new Set(
    ((casasExistentes ?? []) as CasaOcupacionRow[])
      .filter((casa) => !currentCasaId || casa.id !== currentCasaId)
      .flatMap((casa) => [casa.usuario_id, casa.co_anfitrion_id])
      .filter((id): id is string => Boolean(id))
  )
  const currentOwnerId = currentOwner?.value
  const candidatos = ((usuarios ?? []) as UsuarioRow[])
    .filter((usuario: UsuarioRow) => usuario.id !== currentOwnerId && !idsOcupados.has(usuario.id))
    .map((usuario) => ({ value: usuario.id, label: `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim() }))

  const permisos = await Promise.all(
    candidatos.map(async (usuario) => {
      const { data, error } = await supabase.rpc('puede_crear_casa_anfitriona_para', {
        p_auth_id: authId,
        p_usuario_id: usuario.value,
      })

      return !error && data === true ? usuario : null
    })
  )

  return [currentOwner, ...permisos].filter((usuario): usuario is UsuarioAsignableCasaOption => Boolean(usuario))
}
