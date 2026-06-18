import type { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { createSupabaseServerClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>
type AdminClient = ReturnType<typeof createSupabaseAdminClient>

export interface UsuarioAsignableCasaOption {
  value: string
  label: string
  email?: string | null
  cedula?: string | null
  fotoPerfilUrl?: string | null
  yaTieneCasa?: boolean
  puedeSeleccionar?: boolean
  razonNoSeleccionable?: string
}

type UsuarioRow = {
  id: string
  nombre: string | null
  apellido: string | null
  email?: string | null
  cedula?: string | null
  foto_perfil_url?: string | null
}
type CasaOcupacionRow = { id?: string | null; usuario_id: string | null; co_anfitrion_id: string | null }
type UsuarioPermisosRow = UsuarioRow & { puede_ver?: boolean | null }

const MIN_SEARCH_LENGTH = 2
const MAX_SEARCH_RESULTS = 50
const DEFAULT_SEARCH_RESULTS = 30

function normalizarLimiteBusqueda(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_SEARCH_RESULTS

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_RESULTS)
}

function crearUsuarioOption(
  usuario: UsuarioRow,
  idsOcupados: Set<string>,
  puedeSeleccionar = true
): UsuarioAsignableCasaOption {
  const yaTieneCasa = idsOcupados.has(usuario.id)
  const noTienePermiso = !puedeSeleccionar

  return {
    value: usuario.id,
    label: `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim(),
    email: usuario.email ?? null,
    cedula: usuario.cedula ?? null,
    fotoPerfilUrl: usuario.foto_perfil_url ?? null,
    yaTieneCasa,
    puedeSeleccionar: puedeSeleccionar && !yaTieneCasa,
    razonNoSeleccionable: yaTieneCasa
      ? 'Ya tiene casa asignada'
      : noTienePermiso
        ? 'No tienes permisos para asignar esta persona'
        : undefined,
  }
}

function normalizarCurrentOwner(
  currentOwner: UsuarioAsignableCasaOption | null | undefined
): UsuarioAsignableCasaOption | null {
  if (!currentOwner) return null

  return {
    ...currentOwner,
    yaTieneCasa: currentOwner.yaTieneCasa ?? false,
    puedeSeleccionar: currentOwner.puedeSeleccionar ?? true,
  }
}

async function obtenerIdsConCasaAsignada({
  adminDb,
  usuarioIds,
  currentCasaId,
}: {
  adminDb: AdminClient
  usuarioIds: string[]
  currentCasaId?: string
}) {
  if (usuarioIds.length === 0) return new Set<string>()

  let query = adminDb
    .from('casas_anfitrionas')
    .select('id, usuario_id, co_anfitrion_id')
    .or(`usuario_id.in.(${usuarioIds.join(',')}),co_anfitrion_id.in.(${usuarioIds.join(',')})`)

  if (currentCasaId) {
    query = query.neq('id', currentCasaId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return new Set(
    ((data ?? []) as CasaOcupacionRow[])
      .flatMap((casa) => [casa.usuario_id, casa.co_anfitrion_id])
      .filter((id): id is string => Boolean(id))
  )
}

async function obtenerIdsEnGrupoActivo(adminDb: AdminClient, usuarioIds: string[]) {
  if (usuarioIds.length === 0) return new Set<string>()

  const { data, error } = await adminDb
    .from('grupo_miembros')
    .select('usuario_id, grupos!inner(id)')
    .in('usuario_id', usuarioIds)
    .is('fecha_salida', null)
    .eq('grupos.activo', true)
    .eq('grupos.eliminado', false)

  if (error) throw new Error(error.message)

  return new Set((data ?? []).map((m) => m.usuario_id).filter(Boolean))
}

async function puedeAsignarUsuario({
  supabase,
  authId,
  usuarioId,
}: {
  supabase: ServerClient
  authId: string
  usuarioId: string
}) {
  const { data, error } = await supabase.rpc('puede_crear_casa_anfitriona_para', {
    p_auth_id: authId,
    p_usuario_id: usuarioId,
  })

  if (error) return false
  return data === true
}

export async function obtenerUsuariosAsignablesCasaAnfitriona({
  supabase,
  adminDb,
  authId,
  currentCasaId,
  currentOwner,
  busqueda = '',
  limit = 30,
}: {
  supabase: ServerClient
  adminDb: AdminClient
  authId: string
  currentCasaId?: string
  currentOwner?: UsuarioAsignableCasaOption | null
  busqueda?: string
  limit?: number
}): Promise<UsuarioAsignableCasaOption[]> {
  const termino = busqueda.trim()
  const limite = normalizarLimiteBusqueda(limit)
  const currentOwnerNormalizado = normalizarCurrentOwner(currentOwner)
  const currentOwnerId = currentOwnerNormalizado?.value

  if (termino.length < MIN_SEARCH_LENGTH) {
    return [currentOwnerNormalizado].filter((usuario): usuario is UsuarioAsignableCasaOption => Boolean(usuario))
  }

  const { data: usuariosPermitidos, error: usuariosError } = await supabase.rpc('listar_usuarios_con_permisos', {
    p_auth_id: authId,
    p_busqueda: termino,
    p_roles_filtro: [],
    p_con_email: undefined,
    p_con_telefono: undefined,
    p_en_grupo: true,
    p_limite: limite,
    p_offset: 0,
    p_contexto_relacion: true,
  })

  if (usuariosError) {
    throw new Error(usuariosError.message)
  }

  const idsVisibles = ((usuariosPermitidos ?? []) as UsuarioPermisosRow[])
    .filter((usuario) => usuario.id && usuario.id !== currentOwnerId)
    .map((usuario) => usuario.id)

  if (idsVisibles.length === 0) {
    return [currentOwnerNormalizado].filter((usuario): usuario is UsuarioAsignableCasaOption => Boolean(usuario))
  }

  const [idsEnGrupoActivo, idsOcupados] = await Promise.all([
    obtenerIdsEnGrupoActivo(adminDb, idsVisibles),
    obtenerIdsConCasaAsignada({ adminDb, usuarioIds: idsVisibles, currentCasaId }),
  ])

  const candidatos = ((usuariosPermitidos ?? []) as UsuarioPermisosRow[])
    .filter((usuario) => usuario.id !== currentOwnerId && idsEnGrupoActivo.has(usuario.id))

  const permisos = await Promise.all(
    candidatos.map(async (usuario) => {
      const puedeSeleccionarPorScope = await puedeAsignarUsuario({ supabase, authId, usuarioId: usuario.id })
      if (!puedeSeleccionarPorScope) return null

      return crearUsuarioOption(usuario, idsOcupados)
    })
  )

  return [currentOwnerNormalizado, ...permisos].filter((usuario): usuario is UsuarioAsignableCasaOption => Boolean(usuario))
}
