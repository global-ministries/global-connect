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
  agregarInscripcion,
  buscarPersonasParaInscribir,
  cancelarEdicion,
  cerrarEdicion,
  editarGrupoInstanciado,
  inscribirSobreCupo,
  previsualizarCierreEdicion,
  quitarFacilitadorGrupo,
  reprogramarEdicion,
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

function setupDelete(opts: DeleteSetup): { eq: jest.Mock; select: jest.Mock; from: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  // B1 correction (T7) — quitarFacilitadorGrupo now chains `.select('id')`
  // after `.eq(...)` so an RLS-filtered-to-empty DELETE can be told apart
  // from a genuine delete; the default here is a realistic 1-row success.
  const select = jest.fn().mockResolvedValue(opts.deleteResult ?? { data: [{ id: 'a-1' }], error: null })
  const eq = jest.fn().mockReturnValue({ select })
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
  return { eq, select, from }
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
  it('calls talleres_editar_grupo and revalidates the edición AND grupo pages', async () => {
    const { rpc } = setupRpc({})
    const result = await editarGrupoInstanciado(validGrupoInput)
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('talleres_editar_grupo', {
      p_grupo_id: 'g-1',
      p_nombre: 'Grupo Alfa',
      p_capacidad: 12,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1/g-1')
  })
})

describe('editarGrupoInstanciado — RLS denial', () => {
  it('maps sin_permisos_para_este_taller (42501) to a friendly forbidden message', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: '42501', message: 'sin_permisos_para_este_taller' } } })
    const result = await editarGrupoInstanciado(validGrupoInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/no tienes permisos/i)
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
  it('inserts into taller_grupo_asignaciones and revalidates the edición AND grupo pages', async () => {
    const { from, insert } = setupInsert({})
    const result = await agregarFacilitadorGrupo(validFacilitadorInput)
    expect(result.ok).toBe(true)
    expect(from).toHaveBeenCalledWith('taller_grupo_asignaciones')
    expect(insert).toHaveBeenCalledWith({ grupo_id: 'g-1', persona_id: 'p-1', rol: 'lider' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1/g-1')
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
        'Esa persona no es un servidor activo de este taller. Asígnala primero en Dream Team → Servidores.',
      )
    }
  })
})

describe('quitarFacilitadorGrupo', () => {
  it('deletes the asignación by id and revalidates the edición AND grupo pages', async () => {
    const { from, eq } = setupDelete({})
    const result = await quitarFacilitadorGrupo({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      grupoId: 'g-1',
      facilitadorId: 'a-1',
    })
    expect(result.ok).toBe(true)
    expect(from).toHaveBeenCalledWith('taller_grupo_asignaciones')
    expect(eq).toHaveBeenCalledWith('id', 'a-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1/g-1')
  })

  it('returns not-found when the talleres flag is off', async () => {
    setupDelete({ isEnabled: false })
    const result = await quitarFacilitadorGrupo({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      grupoId: 'g-1',
      facilitadorId: 'a-1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  // B1 correction (T7, odd/tasks/talleres-configuracion-del-taller.md) —
  // RLS's USING clause silently filters a DELETE to zero affected rows
  // instead of raising an error; this must NOT report success.
  it('reports forbidden, not success, when RLS silently filters the row', async () => {
    setupDelete({ deleteResult: { data: [], error: null } })
    const result = await quitarFacilitadorGrupo({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      grupoId: 'g-1',
      facilitadorId: 'a-1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/permisos/i)
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

// ─── cancelarEdicion (T4, odd/tasks/talleres-temporadas-y-ediciones.md) ───

interface UpdateSetup {
  isEnabled?: boolean
  user?: { id: string } | null
  selectResult?: { data: unknown; error: { message?: string; code?: string } | null }
}

function setupCancelar(opts: UpdateSetup): { update: jest.Mock; eq: jest.Mock; in: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const select = jest.fn().mockResolvedValue(opts.selectResult ?? { data: [{ id: 'e-1' }], error: null })
  const inFn = jest.fn().mockReturnValue({ select })
  const eq = jest.fn().mockReturnValue({ in: inFn })
  const update = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ update })

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    from,
  })
  return { update, eq, in: inFn }
}

describe('cancelarEdicion — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setupCancelar({ isEnabled: false })
    const result = await cancelarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setupCancelar({ user: null })
    const result = await cancelarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('cancelarEdicion — happy path', () => {
  it('updates estado=cancelado, scoped to borrador/abierto, and revalidates both pages', async () => {
    const { update, eq, in: inFn } = setupCancelar({})
    const result = await cancelarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(true)
    expect(update).toHaveBeenCalledWith({ estado: 'cancelado' })
    expect(eq).toHaveBeenCalledWith('id', 'e-1')
    expect(inFn).toHaveBeenCalledWith('estado', ['borrador', 'abierto'])
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

describe('cancelarEdicion — not in borrador/abierto (RLS-empty)', () => {
  it('reports forbidden when the state predicate excludes the row', async () => {
    setupCancelar({ selectResult: { data: [], error: null } })
    const result = await cancelarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/permisos/i)
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

// ─── T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — cupo ──────

describe('buscarPersonasParaInscribir — kill switch & short query', () => {
  it('returns ok:false when the talleres flag is off', async () => {
    const { rpc } = setupRpc({ isEnabled: false })
    const result = await buscarPersonasParaInscribir('juan')
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never calls the RPC for a query shorter than 2 characters', async () => {
    const { rpc } = setupRpc({})
    const result = await buscarPersonasParaInscribir('j')
    expect(result.ok).toBe(true)
    expect(result.personas).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('buscarPersonasParaInscribir — happy path & error', () => {
  it('calls talleres_buscar_personas and maps the rows', async () => {
    const { rpc } = setupRpc({
      rpcResult: {
        data: [{ id: 'p-1', nombre: 'Juan', apellido: 'Pérez', email: 'juan@example.com' }],
        error: null,
      },
    })
    const result = await buscarPersonasParaInscribir('juan')
    expect(rpc).toHaveBeenCalledWith('talleres_buscar_personas', { p_q: 'juan', p_limit: 20 })
    expect(result.ok).toBe(true)
    expect(result.personas).toEqual([
      { id: 'p-1', nombre: 'Juan', apellido: 'Pérez', email: 'juan@example.com' },
    ])
  })

  it('maps a 42501 denial to a friendly message', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: '42501', message: 'sin_autoridad_para_buscar' } } })
    const result = await buscarPersonasParaInscribir('juan')
    expect(result.ok).toBe(false)
    expect(result.personas).toEqual([])
  })
})

function setupInsertSelectSingle(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  singleResult?: { data: unknown; error: { message?: string; code?: string } | null }
}): { insert: jest.Mock; select: jest.Mock; single: jest.Mock; from: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const single = jest.fn().mockResolvedValue(opts.singleResult ?? { data: { id: 'i-1' }, error: null })
  const select = jest.fn().mockReturnValue({ single })
  const insert = jest.fn().mockReturnValue({ select })
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
  return { insert, select, single, from }
}

describe('agregarInscripcion — kill switch, auth & validation', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setupInsertSelectSingle({ isEnabled: false })
    const result = await agregarInscripcion({ tallerSlug: 's', edicionId: 'e-1', cohorteId: 'c-1', personaId: 'p-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns invalid-input when personaId is blank', async () => {
    setupInsertSelectSingle({})
    const result = await agregarInscripcion({ tallerSlug: 's', edicionId: 'e-1', cohorteId: 'c-1', personaId: '  ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

describe('agregarInscripcion — happy path & cupo lleno', () => {
  it('inserts estado=pendiente and revalidates the edición page on success', async () => {
    const { insert } = setupInsertSelectSingle({ singleResult: { data: { id: 'i-1' }, error: null } })
    const result = await agregarInscripcion({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      cohorteId: 'c-1',
      personaId: 'p-1',
    })
    expect(insert).toHaveBeenCalledWith({
      taller_id: 'e-1',
      cohorte_id: 'c-1',
      persona_principal_id: 'p-1',
      estado: 'pendiente',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.inscripcionId).toBe('i-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
  })

  it('maps a CUPO_LLENO refusal to error: "cupo-lleno" (its own distinct code)', async () => {
    setupInsertSelectSingle({
      singleResult: { data: null, error: { code: 'P0001', message: 'CUPO_LLENO' } },
    })
    const result = await agregarInscripcion({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      cohorteId: 'c-1',
      personaId: 'p-1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('cupo-lleno')
      expect(result.message.length).toBeGreaterThan(0)
    }
  })
})

describe('inscribirSobreCupo — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setupRpc({ isEnabled: false })
    const result = await inscribirSobreCupo({ tallerSlug: 's', edicionId: 'e-1', personaId: 'p-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })
})

describe('inscribirSobreCupo — happy path & errors', () => {
  it('calls talleres_inscribir_sobre_cupo and maps the jsonb result, then revalidates', async () => {
    const { rpc } = setupRpc({
      rpcResult: {
        data: { inscripcion_id: 'i-2', cupo: 2, ocupados: 3, sobre_cupo: true },
        error: null,
      },
    })
    const result = await inscribirSobreCupo({ tallerSlug: 'proximo-paso', edicionId: 'e-1', personaId: 'p-1' })
    expect(rpc).toHaveBeenCalledWith('talleres_inscribir_sobre_cupo', {
      p_edicion_id: 'e-1',
      p_persona_id: 'p-1',
      p_companero_id: null,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.inscripcionId).toBe('i-2')
      expect(result.cupo).toBe(2)
      expect(result.ocupados).toBe(3)
      expect(result.sobreCupo).toBe(true)
    }
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
  })

  // T7 hardening (odd/tasks/talleres-temporadas-y-ediciones.md, item 8,
  // 20260928140000_talleres_paso6_hardening.sql) — companeroId, when given,
  // is forwarded as p_companero_id (required by the RPC for a pareja
  // edición; ignored for an individual one).
  it('forwards companeroId as p_companero_id when given', async () => {
    const { rpc } = setupRpc({
      rpcResult: {
        data: { inscripcion_id: 'i-3', cupo: 12, ocupados: 12, sobre_cupo: true },
        error: null,
      },
    })
    await inscribirSobreCupo({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      personaId: 'p-1',
      companeroId: 'p-2',
    })
    expect(rpc).toHaveBeenCalledWith('talleres_inscribir_sobre_cupo', {
      p_edicion_id: 'e-1',
      p_persona_id: 'p-1',
      p_companero_id: 'p-2',
    })
  })

  it('maps YA_INSCRITO to a conflict message', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: 'P0001', message: 'YA_INSCRITO' } } })
    const result = await inscribirSobreCupo({ tallerSlug: 's', edicionId: 'e-1', personaId: 'p-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('conflict')
  })

  it('maps a 42501 refusal to forbidden', async () => {
    setupRpc({
      rpcResult: { data: null, error: { code: '42501', message: 'sin_permisos_para_este_taller' } },
    })
    const result = await inscribirSobreCupo({ tallerSlug: 's', edicionId: 'e-1', personaId: 'p-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })
})

// ─── reprogramarEdicion (T7b, odd/tasks/talleres-temporadas-y-ediciones.md) ─
//
// Thin gate: shapes the talleres_reprogramar_edicion call and translates its
// result. All business rules (authority, EDICION_NO_REPROGRAMABLE,
// NADA_QUE_CAMBIAR, CIERRE_POSTERIOR_AL_FIN, EDICION_YA_EMPEZO, the actual
// writes) live in the RPC; this action only validates the two dates are
// well-formed ISO strings and the motivo fits.

const validReprogramarInput = {
  tallerSlug: 'proximo-paso',
  edicionId: 'e-1',
  fechaInicio: null,
  cierreInscripcion: '2026-10-05',
  motivo: null,
}

describe('reprogramarEdicion — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setupRpc({ isEnabled: false })
    const result = await reprogramarEdicion(validReprogramarInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setupRpc({ user: null })
    const result = await reprogramarEdicion(validReprogramarInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('reprogramarEdicion — input validation', () => {
  it('rejects a malformed fechaInicio', async () => {
    setupRpc({})
    const result = await reprogramarEdicion({ ...validReprogramarInput, fechaInicio: '05-10-2026', cierreInscripcion: null })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects a malformed cierreInscripcion', async () => {
    setupRpc({})
    const result = await reprogramarEdicion({ ...validReprogramarInput, cierreInscripcion: 'not-a-date' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects a motivo longer than 300 characters', async () => {
    setupRpc({})
    const result = await reprogramarEdicion({ ...validReprogramarInput, motivo: 'x'.repeat(301) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('accepts a motivo of exactly 300 characters', async () => {
    const { rpc } = setupRpc({
      rpcResult: {
        data: {
          edicion_id: 'e-1',
          fecha_inicio: '2026-09-01',
          fecha_fin: '2026-10-27',
          cierre_inscripcion: '2026-10-05',
          estado: 'abierto',
          clases_movidas: 0,
        },
        error: null,
      },
    })
    const result = await reprogramarEdicion({ ...validReprogramarInput, motivo: 'x'.repeat(300) })
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('talleres_reprogramar_edicion', expect.objectContaining({ p_motivo: 'x'.repeat(300) }))
  })
})

describe('reprogramarEdicion — happy path', () => {
  it('extend-only: calls the RPC with p_fecha_inicio null and revalidates edición + taller', async () => {
    const { rpc } = setupRpc({
      rpcResult: {
        data: {
          edicion_id: 'e-1',
          fecha_inicio: '2026-09-01',
          fecha_fin: '2026-10-27',
          cierre_inscripcion: '2026-10-05',
          estado: 'abierto',
          clases_movidas: 0,
        },
        error: null,
      },
    })
    const result = await reprogramarEdicion(validReprogramarInput)
    expect(rpc).toHaveBeenCalledWith('talleres_reprogramar_edicion', {
      p_edicion_id: 'e-1',
      p_fecha_inicio: null,
      p_cierre_inscripcion: '2026-10-05',
      p_motivo: null,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reprogramacion).toEqual({
        edicionId: 'e-1',
        fechaInicio: '2026-09-01',
        fechaFin: '2026-10-27',
        cierreInscripcion: '2026-10-05',
        estado: 'abierto',
        clasesMovidas: 0,
      })
    }
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })

  it('move mode: forwards p_fecha_inicio and trims a blank motivo to null', async () => {
    const { rpc } = setupRpc({
      rpcResult: {
        data: {
          edicion_id: 'e-1',
          fecha_inicio: '2026-09-08',
          fecha_fin: '2026-11-03',
          cierre_inscripcion: '2026-09-08',
          estado: 'abierto',
          clases_movidas: 4,
        },
        error: null,
      },
    })
    const result = await reprogramarEdicion({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      fechaInicio: '2026-09-08',
      cierreInscripcion: null,
      motivo: '   ',
    })
    expect(rpc).toHaveBeenCalledWith('talleres_reprogramar_edicion', {
      p_edicion_id: 'e-1',
      p_fecha_inicio: '2026-09-08',
      p_cierre_inscripcion: null,
      p_motivo: null,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reprogramacion.clasesMovidas).toBe(4)
  })
})

describe('reprogramarEdicion — error mapping', () => {
  it('maps EDICION_YA_EMPEZO to a conflict message', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: 'P0001', message: 'EDICION_YA_EMPEZO' } } })
    const result = await reprogramarEdicion({ ...validReprogramarInput, fechaInicio: '2026-09-08', cierreInscripcion: null })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('conflict')
      expect(result.message).toMatch(/primera clase/i)
    }
  })

  it('maps NADA_QUE_CAMBIAR to invalid-input', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: 'P0001', message: 'NADA_QUE_CAMBIAR' } } })
    const result = await reprogramarEdicion({ ...validReprogramarInput, cierreInscripcion: null })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('maps CIERRE_POSTERIOR_AL_FIN to invalid-input', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: 'P0001', message: 'CIERRE_POSTERIOR_AL_FIN' } } })
    const result = await reprogramarEdicion(validReprogramarInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('maps EDICION_NO_REPROGRAMABLE to conflict', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: 'P0001', message: 'EDICION_NO_REPROGRAMABLE' } } })
    const result = await reprogramarEdicion(validReprogramarInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('conflict')
  })

  it('maps sin_permisos_para_esta_edicion (42501) to forbidden', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: '42501', message: 'sin_permisos_para_esta_edicion' } } })
    const result = await reprogramarEdicion(validReprogramarInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })
})

// ─── reprogramarEdicion (T7b, odd/tasks/talleres-temporadas-y-ediciones.md) ──

const REPROGRAMAR_RPC_DATA = {
  edicion_id: 'e-1',
  fecha_inicio: '2026-10-05',
  fecha_fin: '2026-10-26',
  cierre_inscripcion: '2026-10-05',
  estado: 'abierto',
  clases_movidas: 4,
}

interface ReprogramarSetup {
  isEnabled?: boolean
  user?: { id: string } | null
  rpcResult?: { data: unknown; error: { message?: string; code?: string } | null }
  cohorteResult?: { data: unknown; error: unknown }
  gruposResult?: { data: unknown; error: unknown }
}

function setupReprogramar(opts: ReprogramarSetup): { rpc: jest.Mock; from: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const rpc = jest.fn().mockResolvedValue(opts.rpcResult ?? { data: REPROGRAMAR_RPC_DATA, error: null })

  const maybeSingle = jest.fn().mockResolvedValue(opts.cohorteResult ?? { data: { id: 'c-1' }, error: null })
  const eqCohorte = jest.fn().mockReturnValue({ maybeSingle })
  const selectCohorte = jest.fn().mockReturnValue({ eq: eqCohorte })

  const eqGrupos = jest.fn().mockResolvedValue(opts.gruposResult ?? { data: [{ id: 'g-1' }, { id: 'g-2' }], error: null })
  const selectGrupos = jest.fn().mockReturnValue({ eq: eqGrupos })

  const from = jest.fn((table: string) => {
    if (table === 'talleres_crecimiento_cohortes') return { select: selectCohorte }
    if (table === 'taller_grupos') return { select: selectGrupos }
    throw new Error(`setupReprogramar: unexpected table ${table}`)
  })

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    rpc,
    from,
  })
  return { rpc, from }
}

const validReprogramarExtender = {
  tallerSlug: 'proximo-paso',
  edicionId: 'e-1',
  fechaInicio: null,
  cierreInscripcion: '2026-10-12',
  motivo: null,
}

describe('reprogramarEdicion — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setupReprogramar({ isEnabled: false })
    const result = await reprogramarEdicion(validReprogramarExtender)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setupReprogramar({ user: null })
    const result = await reprogramarEdicion(validReprogramarExtender)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('reprogramarEdicion — input validation', () => {
  it('rejects a malformed fechaInicio', async () => {
    const { rpc } = setupReprogramar({})
    const result = await reprogramarEdicion({ ...validReprogramarExtender, fechaInicio: '05/10/2026' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects a malformed cierreInscripcion', async () => {
    const { rpc } = setupReprogramar({})
    const result = await reprogramarEdicion({ ...validReprogramarExtender, cierreInscripcion: 'not-a-date' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects a motivo longer than 300 characters', async () => {
    const { rpc } = setupReprogramar({})
    const result = await reprogramarEdicion({ ...validReprogramarExtender, motivo: 'x'.repeat(301) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts a motivo of exactly 300 characters', async () => {
    const { rpc } = setupReprogramar({})
    const motivo = 'x'.repeat(300)
    const result = await reprogramarEdicion({ ...validReprogramarExtender, motivo })
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('talleres_reprogramar_edicion', expect.objectContaining({ p_motivo: motivo }))
  })

  it('collapses a blank motivo to null', async () => {
    const { rpc } = setupReprogramar({})
    await reprogramarEdicion({ ...validReprogramarExtender, motivo: '   ' })
    expect(rpc).toHaveBeenCalledWith('talleres_reprogramar_edicion', expect.objectContaining({ p_motivo: null }))
  })
})

describe('reprogramarEdicion — arg mapping', () => {
  it('extend-only: sends p_fecha_inicio null and p_cierre_inscripcion set', async () => {
    const { rpc } = setupReprogramar({})
    await reprogramarEdicion({ ...validReprogramarExtender, motivo: 'Ajuste de agenda' })
    expect(rpc).toHaveBeenCalledWith('talleres_reprogramar_edicion', {
      p_edicion_id: 'e-1',
      p_fecha_inicio: null,
      p_cierre_inscripcion: '2026-10-12',
      p_motivo: 'Ajuste de agenda',
    })
  })

  it('move-start: sends both p_fecha_inicio and p_cierre_inscripcion (null when not overridden)', async () => {
    const { rpc } = setupReprogramar({})
    await reprogramarEdicion({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      fechaInicio: '2026-10-05',
      cierreInscripcion: null,
      motivo: null,
    })
    expect(rpc).toHaveBeenCalledWith('talleres_reprogramar_edicion', {
      p_edicion_id: 'e-1',
      p_fecha_inicio: '2026-10-05',
      p_cierre_inscripcion: null,
      p_motivo: null,
    })
  })
})

describe('reprogramarEdicion — happy path', () => {
  it('maps the jsonb result, revalidates the edición and taller pages, and every grupo page', async () => {
    const result = await (async () => {
      setupReprogramar({})
      return reprogramarEdicion(validReprogramarExtender)
    })()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reprogramacion).toEqual({
        edicionId: 'e-1',
        fechaInicio: '2026-10-05',
        fechaFin: '2026-10-26',
        cierreInscripcion: '2026-10-05',
        estado: 'abierto',
        clasesMovidas: 4,
      })
    }
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1/g-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1/g-2')
  })

  it('still succeeds when there is no cohorte (nothing extra to revalidate)', async () => {
    setupReprogramar({ cohorteResult: { data: null, error: null } })
    const result = await reprogramarEdicion(validReprogramarExtender)
    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

describe('reprogramarEdicion — error mapping', () => {
  it.each([
    ['NADA_QUE_CAMBIAR', 'invalid-input'],
    ['EDICION_NO_REPROGRAMABLE', 'conflict'],
    ['CIERRE_POSTERIOR_AL_FIN', 'invalid-input'],
    ['EDICION_YA_EMPEZO', 'conflict'],
  ])('maps %s to error %s', async (code, expectedError) => {
    setupReprogramar({ rpcResult: { data: null, error: { code: 'P0001', message: code } } })
    const result = await reprogramarEdicion(validReprogramarExtender)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(expectedError)
      expect(result.message.length).toBeGreaterThan(0)
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('maps sin_permisos_para_esta_edicion (42501) to forbidden', async () => {
    setupReprogramar({
      rpcResult: { data: null, error: { code: '42501', message: 'sin_permisos_para_esta_edicion' } },
    })
    const result = await reprogramarEdicion(validReprogramarExtender)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/no tienes permisos/i)
    }
  })
})

// ─── Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) ──────
//
// Thin gate around talleres_previsualizar_cierre (read-only, never
// revalidates) and talleres_cerrar_edicion (revalidates the edición and the
// taller). The RPCs own authority and every business rule; these actions
// only shape the call, parse the jsonb answer and translate errors.

const VISTA_PREVIA_RPC = {
  clases_sin_dictar: 2,
  reportes_sin_enviar: 1,
  clases_minimas: null,
  filas: [
    {
      inscripcion_id: 'i-1',
      persona_nombre: 'Ana Gómez',
      companero_nombre: null,
      grupo_nombre: 'Grupo Alfa',
      clases_presente: 7,
      clases_total: 8,
      minimo: 8,
      resultado: 'no_completado',
    },
  ],
}

const RESUMEN_RPC = {
  ok: true,
  completados: 5,
  no_completados: 2,
  abandonos: 1,
  certificados_emitidos: 5,
  clases_cerradas: 6,
  clases_canceladas: 2,
  grupos_completados: 2,
  reportes_cerrados: 1,
  reportes_sin_enviar: 1,
}

describe('previsualizarCierreEdicion — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    const { rpc } = setupRpc({ isEnabled: false })
    const result = await previsualizarCierreEdicion('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns unauthorized when there is no session', async () => {
    const { rpc } = setupRpc({ user: null })
    const result = await previsualizarCierreEdicion('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('previsualizarCierreEdicion — happy path', () => {
  it('calls talleres_previsualizar_cierre with p_edicion_id and returns the parsed preview, without revalidating', async () => {
    const { rpc } = setupRpc({ rpcResult: { data: VISTA_PREVIA_RPC, error: null } })
    const result = await previsualizarCierreEdicion('e-1')
    expect(rpc).toHaveBeenCalledWith('talleres_previsualizar_cierre', { p_edicion_id: 'e-1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.vistaPrevia.clasesSinDictar).toBe(2)
      expect(result.vistaPrevia.reportesSinEnviar).toBe(1)
      expect(result.vistaPrevia.clasesMinimas).toBeNull()
      expect(result.vistaPrevia.filas[0]).toEqual(
        expect.objectContaining({ inscripcionId: 'i-1', clasesPresente: 7, minimo: 8, resultado: 'no_completado' }),
      )
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('previsualizarCierreEdicion — errors', () => {
  it('translates EDICION_YA_CERRADA', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: 'P0001', message: 'EDICION_YA_CERRADA' } } })
    const result = await previsualizarCierreEdicion('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('conflict')
      expect(result.message).toBe('Esta edición ya está cerrada.')
    }
  })

  it('translates a 42501 denial to forbidden', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: '42501', message: 'permission denied' } } })
    const result = await previsualizarCierreEdicion('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('fails with a generic message when the answer does not match the contract', async () => {
    setupRpc({ rpcResult: { data: { filas: 'nope' }, error: null } })
    const result = await previsualizarCierreEdicion('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('internal')
      expect(result.message).toMatch(/vista previa/i)
    }
  })
})

describe('cerrarEdicion — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    const { rpc } = setupRpc({ isEnabled: false })
    const result = await cerrarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns unauthorized when there is no session', async () => {
    const { rpc } = setupRpc({ user: null })
    const result = await cerrarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('cerrarEdicion — happy path', () => {
  it('calls talleres_cerrar_edicion with p_edicion_id, returns the parsed summary and revalidates edición + taller', async () => {
    const { rpc } = setupRpc({ rpcResult: { data: RESUMEN_RPC, error: null } })
    const result = await cerrarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(rpc).toHaveBeenCalledWith('talleres_cerrar_edicion', { p_edicion_id: 'e-1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resumen).toEqual({
        completados: 5,
        noCompletados: 2,
        abandonos: 1,
        certificadosEmitidos: 5,
        clasesCerradas: 6,
        clasesCanceladas: 2,
        gruposCompletados: 2,
        reportesCerrados: 1,
        reportesSinEnviar: 1,
      })
    }
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })

  it('still reports success (resumen null) when the edición closed but the summary does not match the contract', async () => {
    setupRpc({ rpcResult: { data: { ok: true }, error: null } })
    const result = await cerrarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.resumen).toBeNull()
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1')
  })
})

describe('cerrarEdicion — errors', () => {
  it('translates EDICION_NO_CERRABLE and never revalidates', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: 'P0001', message: 'EDICION_NO_CERRABLE' } } })
    const result = await cerrarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('conflict')
      expect(result.message).toBe('Una edición en borrador o cancelada no se puede cerrar.')
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('translates EDICION_YA_CERRADA', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: 'P0001', message: 'EDICION_YA_CERRADA' } } })
    const result = await cerrarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('Esta edición ya está cerrada.')
  })

  it('translates a 42501 denial to forbidden', async () => {
    setupRpc({ rpcResult: { data: null, error: { code: '42501', message: 'permission denied' } } })
    const result = await cerrarEdicion({ tallerSlug: 'proximo-paso', edicionId: 'e-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })
})
