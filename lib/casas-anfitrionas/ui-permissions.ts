type RpcError = { message: string }

type CasasRpcName = 'obtener_permisos_casa_anfitriona' | 'puede_ver_casa_anfitriona'

type CasasRpcArgs = { p_auth_id: string; p_casa_id?: string }

export interface CasasRpcClient {
  rpc: (name: CasasRpcName, args: CasasRpcArgs) => PromiseLike<{ data: unknown; error: RpcError | null }>
}

export interface CasaPermissionFlags {
  puedeVer: boolean
  puedeCrearPropia: boolean
  puedeCrearParaOtros: boolean
  puedeAprobar: boolean
  puedeEditar: boolean
  puedeCambiarEstado: boolean
}

const DENIED_CASA_PERMISSIONS: CasaPermissionFlags = {
  puedeVer: false,
  puedeCrearPropia: false,
  puedeCrearParaOtros: false,
  puedeAprobar: false,
  puedeEditar: false,
  puedeCambiarEstado: false,
}

export async function obtenerPermisosCasaAnfitrionaUI(
  client: CasasRpcClient,
  authId: string,
  casaId?: string
): Promise<CasaPermissionFlags> {
  const args: CasasRpcArgs = { p_auth_id: authId }
  if (casaId) args.p_casa_id = casaId

  const { data, error } = await client.rpc('obtener_permisos_casa_anfitriona', args)

  if (error) return DENIED_CASA_PERMISSIONS
  return normalizeCasaPermissionFlags(data)
}

export async function puedeVerCasaAnfitrionaUI(
  client: CasasRpcClient,
  authId: string,
  casaId: string
): Promise<boolean> {
  const { data, error } = await client.rpc('puede_ver_casa_anfitriona', {
    p_auth_id: authId,
    p_casa_id: casaId,
  })

  if (error) return false
  return data === true
}

export function puedeMostrarRegistroCasa(permissions: CasaPermissionFlags): boolean {
  return permissions.puedeCrearPropia || permissions.puedeCrearParaOtros
}

function normalizeCasaPermissionFlags(raw: unknown): CasaPermissionFlags {
  if (!isPermissionPayload(raw)) return DENIED_CASA_PERMISSIONS

  return {
    puedeVer: raw.puede_ver === true,
    puedeCrearPropia: raw.puede_crear_propia === true,
    puedeCrearParaOtros: raw.puede_crear_para_otros === true,
    puedeAprobar: raw.puede_aprobar === true,
    puedeEditar: raw.puede_editar === true,
    puedeCambiarEstado: raw.puede_cambiar_estado === true,
  }
}

function isPermissionPayload(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
