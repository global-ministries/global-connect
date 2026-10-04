import { obtenerSugerenciasDireccionFamiliar } from '@/lib/actions/direccion-familiar.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))

const authId = '11111111-1111-1111-1111-111111111111'
const usuarioId = '22222222-2222-2222-2222-222222222222'
const conyugeId = '33333333-3333-3333-3333-333333333333'
const direccionId = '44444444-4444-4444-4444-444444444444'

function sessionClient(permitido: boolean, user: { id: string } | null = { id: authId }) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    rpc: jest.fn().mockResolvedValue({ data: permitido, error: null }),
    from: jest.fn(() => {
      throw new Error('the session client must not read tables here')
    }),
  }
}

function adminClient() {
  const tables: Record<string, unknown> = {
    relaciones_usuarios: [{ usuario1_id: usuarioId, usuario2_id: conyugeId, tipo_relacion: 'conyuge' }],
    usuarios: [{ id: conyugeId, nombre: 'Ana', apellido: 'Pérez', direccion_id: direccionId }],
    direcciones: [{
      id: direccionId, calle: 'Av. 1', barrio: 'Centro', codigo_postal: null, referencia: null,
      latitud: 10.5, longitud: -66.9, parroquia_id: null,
    }],
  }
  const from = jest.fn((table: string) => {
    const result = Promise.resolve({ data: tables[table], error: null })
    const chain = { select: () => chain, or: () => result, in: () => result }
    return chain
  })
  return { from }
}

describe('obtenerSugerenciasDireccionFamiliar', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns the relatives addresses through the service client when the caller may edit the person', async () => {
    const sesion = sessionClient(true)
    const admin = adminClient()
    createSupabaseServerClient.mockResolvedValue(sesion)
    createSupabaseAdminClient.mockReturnValue(admin)

    const { sugerencias } = await obtenerSugerenciasDireccionFamiliar(usuarioId)

    expect(sesion.rpc).toHaveBeenCalledWith('puede_editar_usuario', { p_auth_id: authId, p_target_user_id: usuarioId })
    expect(sugerencias).toHaveLength(1)
    expect(sugerencias[0]).toMatchObject({ familiar_id: conyugeId, relacion: 'conyuge', direccion: { calle: 'Av. 1', direccion_id: direccionId } })
  })

  it('returns nothing and reads nothing when the caller may not edit the person', async () => {
    createSupabaseServerClient.mockResolvedValue(sessionClient(false))

    await expect(obtenerSugerenciasDireccionFamiliar(usuarioId)).resolves.toEqual({ sugerencias: [] })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('returns nothing without a session', async () => {
    createSupabaseServerClient.mockResolvedValue(sessionClient(true, null))

    await expect(obtenerSugerenciasDireccionFamiliar(usuarioId)).resolves.toEqual({ sugerencias: [] })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })
})
