/**
 * @jest-environment node
 *
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — server actions for
 * /talleres/[taller]/[edicion]'s instantiated-grupo mutations: editing a
 * grupo in place (talleres_editar_grupo) and adding/removing a
 * facilitador (taller_grupo_asignaciones insert/delete) through the SAME
 * bounded picker T3 built for the plantilla — never talleres_buscar_personas.
 *
 * Gate mirrors app/(auth)/talleres/[taller]/actions.ts's thin gate (flag +
 * authenticated session only); authorization stays in the DB
 * (talleres_editar_grupo's own capability check, taller_grupo_
 * asignaciones' RLS and its NO_ES_SERVIDOR_ACTIVO_DEL_TALLER trigger).
 */

import {
  agregarFacilitadorGrupo,
  editarGrupoInstanciado,
  quitarFacilitadorGrupo,
} from '@/app/(auth)/talleres/[taller]/[edicion]/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const revalidatePathMock = jest.requireMock('next/cache').revalidatePath as jest.Mock

interface RpcSetup {
  isEnabled?: boolean
  user?: { id: string } | null
  rpcResult?: { data: unknown; error: { message?: string; code?: string } | null }
}

function setupRpc(opts: RpcSetup): { rpc: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const rpc = jest.fn().mockResolvedValue(opts.rpcResult ?? { data: { id: 'g-1' }, error: null })

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    rpc,
  })
  return { rpc }
}

interface InsertSetup {
  isEnabled?: boolean
  user?: { id: string } | null
  insertResult?: { data: unknown; error: { message?: string; code?: string } | null }
}

function setupInsert(opts: InsertSetup): { insert: jest.Mock; from: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const insert = jest.fn().mockResolvedValue(opts.insertResult ?? { data: null, error: null })
  const from = jest.fn().mockReturnValue({ insert })

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    from,
  })
  return { insert, from }
}

interface DeleteSetup {
  isEnabled?: boolean
  user?: { id: string } | null
  deleteResult?: { data: unknown; error: { message?: string; code?: string } | null }
}

function setupDelete(opts: DeleteSetup): { eq: jest.Mock; from: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const eq = jest.fn().mockResolvedValue(opts.deleteResult ?? { data: null, error: null })
  const del = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ delete: del })

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    from,
  })
  return { eq, from }
}

beforeEach(() => {
  revalidatePathMock.mockReset()
})

const validGrupoInput = { tallerSlug: 'proximo-paso', edicionId: 'e-1', grupoId: 'g-1', nombre: 'Grupo Alfa', capacidad: 12 }

describe('editarGrupoInstanciado — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setupRpc({ isEnabled: false })
    const result = await editarGrupoInstanciado(validGrupoInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setupRpc({ user: null })
    const result = await editarGrupoInstanciado(validGrupoInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('editarGrupoInstanciado — input validation', () => {
  it('rejects a blank nombre', async () => {
    setupRpc({})
    const result = await editarGrupoInstanciado({ ...validGrupoInput, nombre: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects a non-positive capacidad', async () => {
    setupRpc({})
    const result = await editarGrupoInstanciado({ ...validGrupoInput, capacidad: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

describe('editarGrupoInstanciado — happy path', () => {
  it('calls talleres_editar_grupo and revalidates the edición page', async () => {
    const { rpc } = setupRpc({})
    const result = await editarGrupoInstanciado(validGrupoInput)
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('talleres_editar_grupo', {
      p_grupo_id: 'g-1',
      p_nombre: 'Grupo Alfa',
      p_capacidad: 12,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
  })
})

describe('editarGrupoInstanciado — RLS denial', () => {
  it('maps sin_permisos_para_este_taller (42501) to a friendly forbidden message', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: '42501', message: 'sin_permisos_para_este_taller' } } })
    const result = await editarGrupoInstanciado(validGrupoInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/no tenés permisos/i)
    }
  })
})

const validFacilitadorInput = {
  tallerSlug: 'proximo-paso',
  edicionId: 'e-1',
  grupoId: 'g-1',
  personaId: 'p-1',
  rol: 'lider' as const,
}

describe('agregarFacilitadorGrupo — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setupInsert({ isEnabled: false })
    const result = await agregarFacilitadorGrupo(validFacilitadorInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })
})

describe('agregarFacilitadorGrupo — input validation', () => {
  it('rejects a blank personaId', async () => {
    setupInsert({})
    const result = await agregarFacilitadorGrupo({ ...validFacilitadorInput, personaId: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

describe('agregarFacilitadorGrupo — happy path', () => {
  it('inserts into taller_grupo_asignaciones and revalidates', async () => {
    const { from, insert } = setupInsert({})
    const result = await agregarFacilitadorGrupo(validFacilitadorInput)
    expect(result.ok).toBe(true)
    expect(from).toHaveBeenCalledWith('taller_grupo_asignaciones')
    expect(insert).toHaveBeenCalledWith({ grupo_id: 'g-1', persona_id: 'p-1', rol: 'lider' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
  })
})

describe('agregarFacilitadorGrupo — servidor inactivo', () => {
  it('maps NO_ES_SERVIDOR_ACTIVO_DEL_TALLER to the friendly Spanish message', async () => {
    setupInsert({
      insertResult: { data: null, error: { code: 'P0001', message: 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER' } },
    })
    const result = await agregarFacilitadorGrupo(validFacilitadorInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(
        'Esa persona no es un servidor activo de este taller. Asignala primero en Dream Team → Servidores.',
      )
    }
  })
})

describe('quitarFacilitadorGrupo', () => {
  it('deletes the asignación by id and revalidates', async () => {
    const { from, eq } = setupDelete({})
    const result = await quitarFacilitadorGrupo({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      facilitadorId: 'a-1',
    })
    expect(result.ok).toBe(true)
    expect(from).toHaveBeenCalledWith('taller_grupo_asignaciones')
    expect(eq).toHaveBeenCalledWith('id', 'a-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
  })

  it('returns not-found when the talleres flag is off', async () => {
    setupDelete({ isEnabled: false })
    const result = await quitarFacilitadorGrupo({ tallerSlug: 'proximo-paso', edicionId: 'e-1', facilitadorId: 'a-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })
})
