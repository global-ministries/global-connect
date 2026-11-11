/**
 * @jest-environment node
 *
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — server actions for
 * /talleres/[taller]'s own mutations (cabecera, plantilla clases/grupos/
 * facilitadores). The gate is intentionally thin — flag + authenticated
 * session only, same philosophy as requireTalleresApiAuthenticated /
 * talleres_asignar_inscripciones_a_grupo's route (asignar-grupo/route.ts):
 * authorization stays in the DB (RLS on the plantilla tables, the
 * NO_ES_SERVIDOR_ACTIVO_DEL_TALLER trigger), never re-implemented here.
 *
 * This file covers updateTallerNombre and updateTallerDescripcion — the
 * two cabecera fields, both plain `talleres` table UPDATEs gated by the
 * SAME talleres_update_director RLS policy (there is no dedicated
 * `editar_taller` RPC — verified empty on staging via `pg_proc`;
 * "editar_taller" is only the capability-boolean field name
 * talleres_mis_permisos() returns). The plantilla clase/grupo/
 * facilitador actions are added alongside their own components later in
 * T3 (see the components' own tests for that coverage).
 */

import {
  crearEdicion,
  updateTallerConfiguracion,
  updateTallerDescripcion,
  updateTallerNombre,
} from '@/app/(auth)/talleres/[taller]/actions'

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

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  updateResult?: { data: unknown; error: { message?: string; code?: string } | null }
}

function setup(opts: SetupOpts): void {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const single = jest.fn().mockResolvedValue(
    opts.updateResult ?? { data: { nombre: 'Nuevo nombre' }, error: null },
  )
  const select = jest.fn().mockReturnValue({ single })
  const eq = jest.fn().mockReturnValue({ select })
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
}

const validInput = { tallerId: 't-1', tallerSlug: 'proximo-paso', nombre: 'Nuevo nombre' }

beforeEach(() => {
  revalidatePathMock.mockReset()
})

describe('updateTallerNombre — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setup({ isEnabled: false })
    const result = await updateTallerNombre(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setup({ user: null })
    const result = await updateTallerNombre(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('updateTallerNombre — input validation', () => {
  it('rejects a nombre shorter than 2 characters', async () => {
    setup({})
    const result = await updateTallerNombre({ ...validInput, nombre: 'A' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('trims the nombre before sending it', async () => {
    setup({})
    await updateTallerNombre({ ...validInput, nombre: '  Nuevo nombre  ' })
    const client = await createSupabaseServerClientMock.mock.results[0].value
    expect(client.from).toHaveBeenCalledWith('talleres')
    expect(client.from('talleres').update).toHaveBeenCalledWith({ nombre: 'Nuevo nombre' })
  })
})

describe('updateTallerNombre — happy path', () => {
  it('updates the row and revalidates the taller page', async () => {
    setup({})
    const result = await updateTallerNombre(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.nombre).toBe('Nuevo nombre')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

describe('updateTallerNombre — RLS denial', () => {
  it('maps a bare 42501 to a friendly forbidden message', async () => {
    setup({
      updateResult: {
        data: null,
        error: { code: '42501', message: 'new row violates row-level security policy' },
      },
    })
    const result = await updateTallerNombre(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/permisos/i)
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

const validDescripcionInput = {
  tallerId: 't-1',
  tallerSlug: 'proximo-paso',
  descripcion: 'Un taller de ejemplo.',
}

describe('updateTallerDescripcion — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setup({ isEnabled: false, updateResult: { data: { descripcion: 'x' }, error: null } })
    const result = await updateTallerDescripcion(validDescripcionInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setup({ user: null, updateResult: { data: { descripcion: 'x' }, error: null } })
    const result = await updateTallerDescripcion(validDescripcionInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('updateTallerDescripcion — input validation', () => {
  it('rejects a descripcion longer than 2000 characters (the DB CHECK)', async () => {
    setup({ updateResult: { data: { descripcion: 'x' }, error: null } })
    const result = await updateTallerDescripcion({ ...validDescripcionInput, descripcion: 'a'.repeat(2001) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('normalizes an empty/whitespace-only descripcion to null (clears it)', async () => {
    setup({ updateResult: { data: { descripcion: null }, error: null } })
    await updateTallerDescripcion({ ...validDescripcionInput, descripcion: '   ' })
    const client = await createSupabaseServerClientMock.mock.results[0].value
    expect(client.from('talleres').update).toHaveBeenCalledWith({ descripcion: null })
  })

  it('trims the descripcion before sending it', async () => {
    setup({ updateResult: { data: { descripcion: 'Un taller de ejemplo.' }, error: null } })
    await updateTallerDescripcion({ ...validDescripcionInput, descripcion: '  Un taller de ejemplo.  ' })
    const client = await createSupabaseServerClientMock.mock.results[0].value
    expect(client.from('talleres').update).toHaveBeenCalledWith({ descripcion: 'Un taller de ejemplo.' })
  })
})

describe('updateTallerDescripcion — happy path', () => {
  it('updates the row and revalidates the taller page', async () => {
    setup({ updateResult: { data: { descripcion: 'Un taller de ejemplo.' }, error: null } })
    const result = await updateTallerDescripcion(validDescripcionInput)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.descripcion).toBe('Un taller de ejemplo.')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

describe('updateTallerDescripcion — RLS denial', () => {
  it('maps a bare 42501 to a friendly forbidden message', async () => {
    setup({
      updateResult: {
        data: null,
        error: { code: '42501', message: 'new row violates row-level security policy' },
      },
    })
    const result = await updateTallerDescripcion(validDescripcionInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/permisos/i)
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

// ─── updateTallerConfiguracion (T4, odd/tasks/talleres-temporadas-y-ediciones.md) ──

/** `.from('talleres').update(...).eq('id', x).select('id')` — array result, no `.single()`. */
function setupConfiguracion(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  selectResult?: { data: unknown; error: { message?: string; code?: string } | null }
}): { updateMock: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const select = jest.fn().mockResolvedValue(opts.selectResult ?? { data: [{ id: 't-1' }], error: null })
  const eq = jest.fn().mockReturnValue({ select })
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
  return { updateMock: update }
}

const validConfiguracionInput = {
  tallerId: 't-1',
  tallerSlug: 'proximo-paso',
  tipo: 'pareja' as const,
  vinculo: 'matrimonio' as const,
  regimen: 'temporada' as const,
  cierreInscripcionOffsetDias: -3,
  intervaloEdicionesDias: null,
  clasesMinimasParaCompletar: null,
}

describe('updateTallerConfiguracion — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setupConfiguracion({ isEnabled: false })
    const result = await updateTallerConfiguracion(validConfiguracionInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setupConfiguracion({ user: null })
    const result = await updateTallerConfiguracion(validConfiguracionInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('updateTallerConfiguracion — input validation', () => {
  it('rejects an invalid tipo', async () => {
    setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, tipo: 'otro' as never })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects an invalid regimen', async () => {
    setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, regimen: 'otro' as never })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects a vinculo that is not matrimonio/novios', async () => {
    setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, vinculo: 'otro' as never })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects a cierreInscripcionOffsetDias outside -60..60', async () => {
    setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, cierreInscripcionOffsetDias: 61 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects a non-integer cierreInscripcionOffsetDias', async () => {
    setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, cierreInscripcionOffsetDias: 1.5 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects an intervaloEdicionesDias outside 1..365', async () => {
    setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, intervaloEdicionesDias: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('accepts intervaloEdicionesDias: null (no adelantar)', async () => {
    setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, intervaloEdicionesDias: null })
    expect(result.ok).toBe(true)
  })

  it('normalizes vinculo to null when tipo is individual, even if a vinculo was sent', async () => {
    const { updateMock } = setupConfiguracion({})
    await updateTallerConfiguracion({
      ...validConfiguracionInput,
      tipo: 'individual',
      vinculo: 'matrimonio',
    })
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'individual', vinculo: null }))
  })
})

describe('updateTallerConfiguracion — happy path', () => {
  it('updates the row and revalidates the taller page', async () => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion(validConfiguracionInput)
    expect(result.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith({
      tipo: 'pareja',
      vinculo: 'matrimonio',
      regimen: 'temporada',
      cierre_inscripcion_offset_dias: -3,
      intervalo_ediciones_dias: null,
      ancla_ediciones: null,
      clases_minimas_para_completar: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

// T1 (odd/tasks/proximo-paso.md, S1) — "Primer domingo de cada mes" vs
// "Cada N días": the anchor and the intervalo never coexist (the DB CHECKs
// refuse it), so the action normalizes before writing.
describe('updateTallerConfiguracion — ancla de ediciones', () => {
  const cadencia = { ...validConfiguracionInput, regimen: 'cadencia' as const }

  it('persists the anchor and clears the intervalo for a cadencia taller', async () => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({
      ...cadencia,
      anclaEdiciones: 'primer_domingo_mes',
      intervaloEdicionesDias: 28,
    })
    expect(result.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ ancla_ediciones: 'primer_domingo_mes', intervalo_ediciones_dias: null }),
    )
  })

  it('keeps the intervalo and writes no anchor when "Cada N días" is chosen', async () => {
    const { updateMock } = setupConfiguracion({})
    await updateTallerConfiguracion({ ...cadencia, anclaEdiciones: null, intervaloEdicionesDias: 28 })
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ ancla_ediciones: null, intervalo_ediciones_dias: 28 }),
    )
  })

  it('clears the anchor for a régimen=temporada taller', async () => {
    const { updateMock } = setupConfiguracion({})
    await updateTallerConfiguracion({ ...validConfiguracionInput, anclaEdiciones: 'primer_domingo_mes' })
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ regimen: 'temporada', ancla_ediciones: null }))
  })

  it('rejects an unknown anchor without touching the row', async () => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...cadencia, anclaEdiciones: 'ultimo_domingo' as never })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('invalid-input')
      expect(result.message).toBe('El inicio de cada edición no es válido.')
    }
    expect(updateMock).not.toHaveBeenCalled()
  })
})

// T2b (odd/tasks/proximo-paso.md, L6.2) — inscripción automática si hay
// cupo: written only for an individual taller, and only when sent.
describe('updateTallerConfiguracion — inscripción automática', () => {
  const individual = { ...validConfiguracionInput, tipo: 'individual' as const, vinculo: null }

  it.each([true, false])('writes inscripcion_automatica=%s for an individual taller', async (valor) => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...individual, inscripcionAutomatica: valor })
    expect(result.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ inscripcion_automatica: valor }))
  })

  it('leaves the column alone when it is not sent or the taller is for couples', async () => {
    const { updateMock } = setupConfiguracion({})
    await updateTallerConfiguracion(individual)
    await updateTallerConfiguracion({ ...validConfiguracionInput, inscripcionAutomatica: true })
    expect(updateMock.mock.calls[0][0]).not.toHaveProperty('inscripcion_automatica')
    expect(updateMock.mock.calls[1][0]).not.toHaveProperty('inscripcion_automatica')
  })

  it('rejects a value that is not true or false without touching the row', async () => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...individual, inscripcionAutomatica: 'si' as never })
    expect(result).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'La inscripción automática debe estar activada o desactivada.',
    })
    expect(updateMock).not.toHaveBeenCalled()
  })
})

// Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — the
// taller's own completion rule: null means "every clase dictada", a number
// is the minimum attended clases (1..50) talleres_cerrar_edicion applies.
describe('updateTallerConfiguracion — clases mínimas para completar', () => {
  it('persists null (empty field = todas las clases dictadas)', async () => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, clasesMinimasParaCompletar: null })
    expect(result.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ clases_minimas_para_completar: null }))
  })

  it.each([1, 6, 50])('persists the integer %i', async (valor) => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, clasesMinimasParaCompletar: valor })
    expect(result.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ clases_minimas_para_completar: valor }))
  })

  it.each([0, 51, -1, 2.5, Number.NaN])('rejects %p without touching the row', async (valor) => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, clasesMinimasParaCompletar: valor })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('invalid-input')
      expect(result.message).toMatch(/entre 1 y 50/)
    }
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('updateTallerConfiguracion — RLS-empty (forbidden)', () => {
  it('treats an empty .select() result as forbidden, same as the other taller mutations', async () => {
    setupConfiguracion({ selectResult: { data: [], error: null } })
    const result = await updateTallerConfiguracion(validConfiguracionInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/permisos/i)
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

// ─── crearEdicion (T4) ────────────────────────────────────────────────────

function setupCrearEdicion(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  rpcResult?: { data: unknown; error: { message?: string; code?: string } | null }
}): { rpcMock: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const rpcMock = jest.fn().mockResolvedValue(
    opts.rpcResult ?? {
      data: { ediciones: [{ edicion_id: 'e-1', nombre: 'Otoño 2026' }] },
      error: null,
    },
  )
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    rpc: rpcMock,
  })
  return { rpcMock }
}

const crearEdicionPorTemporada = {
  tallerId: 't-1',
  tallerSlug: 'proximo-paso',
  fechaInicio: null,
  temporadaId: 'temp-1',
  adelantar: 0,
}

describe('crearEdicion — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setupCrearEdicion({ isEnabled: false })
    const result = await crearEdicion(crearEdicionPorTemporada)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setupCrearEdicion({ user: null })
    const result = await crearEdicion(crearEdicionPorTemporada)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('crearEdicion — calls the RPC with the exact args by regimen', () => {
  it('sends p_temporada_id and p_fecha_inicio:null for a temporada pick', async () => {
    const { rpcMock } = setupCrearEdicion({})
    await crearEdicion(crearEdicionPorTemporada)
    expect(rpcMock).toHaveBeenCalledWith('talleres_crear_edicion', {
      p_taller_id: 't-1',
      p_fecha_inicio: null,
      p_temporada_id: 'temp-1',
      p_adelantar: 0,
    })
  })

  it('sends p_fecha_inicio and p_adelantar for a cadencia pick', async () => {
    const { rpcMock } = setupCrearEdicion({})
    await crearEdicion({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      fechaInicio: '2027-03-01',
      temporadaId: null,
      adelantar: 3,
    })
    expect(rpcMock).toHaveBeenCalledWith('talleres_crear_edicion', {
      p_taller_id: 't-1',
      p_fecha_inicio: '2027-03-01',
      p_temporada_id: null,
      p_adelantar: 3,
    })
  })
})

describe('crearEdicion — happy path', () => {
  it('returns every created edición and revalidates the taller page', async () => {
    setupCrearEdicion({
      rpcResult: {
        data: {
          ediciones: [
            { edicion_id: 'e-1', nombre: 'Marzo 2027' },
            { edicion_id: 'e-2', nombre: 'Abril 2027' },
          ],
        },
        error: null,
      },
    })
    const result = await crearEdicion(crearEdicionPorTemporada)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.ediciones).toEqual([
        { edicionId: 'e-1', nombre: 'Marzo 2027' },
        { edicionId: 'e-2', nombre: 'Abril 2027' },
      ])
    }
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

describe('crearEdicion — RPC error mapping', () => {
  it.each([
    ['TEMPORADA_REQUERIDA', 'P0001', 'invalid-input'],
    ['EDICION_YA_EXISTE', 'P0001', 'conflict'],
    ['ADELANTAR_MAXIMO_6', 'P0001', 'invalid-input'],
    ['SIN_INTERVALO', 'P0001', 'conflict'],
  ] as const)('maps %s to error %s', async (message, code, expectedError) => {
    setupCrearEdicion({ rpcResult: { data: null, error: { code, message } } })
    const result = await crearEdicion(crearEdicionPorTemporada)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(expectedError)
  })

  it('maps sin_permisos_para_este_taller (42501) to forbidden', async () => {
    setupCrearEdicion({
      rpcResult: { data: null, error: { code: '42501', message: 'sin_permisos_para_este_taller' } },
    })
    const result = await crearEdicion(crearEdicionPorTemporada)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })
})

describe('updateTallerConfiguracion — momento del envío del acceso al cónyuge nuevo', () => {
  it('saves momento_envio_acceso when it is sent', async () => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, momentoEnvioAcceso: 'al_inscribirse' })
    expect(result.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ momento_envio_acceso: 'al_inscribirse' }))
  })

  it('leaves the column alone when a stale client omits it', async () => {
    const { updateMock } = setupConfiguracion({})
    await updateTallerConfiguracion(validConfiguracionInput)
    expect(updateMock.mock.calls[0][0]).not.toHaveProperty('momento_envio_acceso')
  })

  it('rejects an unknown value', async () => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, momentoEnvioAcceso: 'nunca' as never })
    expect(result).toMatchObject({ ok: false, error: 'invalid-input' })
    expect(updateMock).not.toHaveBeenCalled()
  })
})

// T9 (odd/tasks/talleres-reserva-publica.md, S8 S9 S17, L16) — «Mínimo de
// inscritos para abrir» and «Recuperar clases aparte» save with the rest of
// the configuration (one «Guardar configuración»), through the same update
// and RLS. Omitted keys leave the columns as they are (see the happy path).
describe('updateTallerConfiguracion — mínimo de inscritos y recuperar clases', () => {
  it('persists minimoInscritos and permiteRecuperarClases with the rest', async () => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({
      ...validConfiguracionInput,
      minimoInscritos: 12,
      permiteRecuperarClases: false,
    })
    expect(result.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ minimo_inscritos: 12, permite_recuperar_clases: false }),
    )
  })

  it.each([1, 500])('accepts the mínimo %i', async (valor) => {
    const { updateMock } = setupConfiguracion({})
    expect((await updateTallerConfiguracion({ ...validConfiguracionInput, minimoInscritos: valor })).ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ minimo_inscritos: valor }))
  })

  it('persists minimoInscritos: null (no minimum)', async () => {
    const { updateMock } = setupConfiguracion({})
    await updateTallerConfiguracion({ ...validConfiguracionInput, minimoInscritos: null })
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ minimo_inscritos: null }))
  })

  it.each([0, 501, 2.5, Number.NaN])('rejects the mínimo %p without touching the row', async (valor) => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, minimoInscritos: valor })
    expect(result).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'El mínimo de inscritos debe ser un entero entre 1 y 500, o vacío para no tener mínimo.',
    })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('rejects a non-boolean permiteRecuperarClases without touching the row', async () => {
    const { updateMock } = setupConfiguracion({})
    const result = await updateTallerConfiguracion({ ...validConfiguracionInput, permiteRecuperarClases: 'si' as never })
    expect(result).toEqual({ ok: false, error: 'invalid-input', message: 'Valor inválido para recuperar clases aparte.' })
    expect(updateMock).not.toHaveBeenCalled()
  })
})

// ─── crearEdicion — lugar e indicaciones (T10) ────────────────────────────
//
// odd/tasks/talleres-reserva-publica.md T10, S6: talleres_crear_edicion has
// no lugar/indicaciones parameters, so they are written right after it on
// every edición created, through the taller_ediciones_update RLS.

function setupCrearEdicionConDatos(opts: {
  rpcResult?: { data: unknown; error: { message?: string; code?: string } | null }
  updateResult?: { data: unknown; error: { message?: string; code?: string } | null }
}): { rpcMock: jest.Mock; fromMock: jest.Mock; updateMock: jest.Mock; inMock: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(true)
  const rpcMock = jest.fn().mockResolvedValue(
    opts.rpcResult ?? {
      data: {
        ediciones: [
          { edicion_id: 'e-1', nombre: 'Marzo 2027' },
          { edicion_id: 'e-2', nombre: 'Abril 2027' },
        ],
      },
      error: null,
    },
  )
  const select = jest.fn().mockResolvedValue(opts.updateResult ?? { data: [{ id: 'e-1' }, { id: 'e-2' }], error: null })
  const inMock = jest.fn().mockReturnValue({ select })
  const updateMock = jest.fn().mockReturnValue({ in: inMock })
  const fromMock = jest.fn().mockReturnValue({ update: updateMock })
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) },
    rpc: rpcMock,
    from: fromMock,
  })
  return { rpcMock, fromMock, updateMock, inMock }
}

const crearConDatos = {
  tallerId: 't-1',
  tallerSlug: 'proximo-paso',
  fechaInicio: '2027-03-01',
  temporadaId: null,
  adelantar: 1,
}

describe('crearEdicion — lugar e indicaciones (T10)', () => {
  it('writes the trimmed lugar and indicaciones on every edición created', async () => {
    const { rpcMock, fromMock, updateMock, inMock } = setupCrearEdicionConDatos({})
    const result = await crearEdicion({ ...crearConDatos, lugar: '  Salón 2 ', indicaciones: ' Trae tu Biblia ' })
    expect(result).toEqual({
      ok: true,
      ediciones: [
        { edicionId: 'e-1', nombre: 'Marzo 2027' },
        { edicionId: 'e-2', nombre: 'Abril 2027' },
      ],
    })
    expect(rpcMock).toHaveBeenCalledWith('talleres_crear_edicion', {
      p_taller_id: 't-1',
      p_fecha_inicio: '2027-03-01',
      p_temporada_id: null,
      p_adelantar: 1,
    })
    expect(fromMock).toHaveBeenCalledWith('taller_ediciones')
    expect(updateMock).toHaveBeenCalledWith({ lugar: 'Salón 2', indicaciones: 'Trae tu Biblia' })
    expect(inMock).toHaveBeenCalledWith('id', ['e-1', 'e-2'])
  })

  it('writes only what was filled (the other one as null)', async () => {
    const { updateMock } = setupCrearEdicionConDatos({})
    await crearEdicion({ ...crearConDatos, lugar: '   ', indicaciones: 'Estaciona en la calle de atrás' })
    expect(updateMock).toHaveBeenCalledWith({ lugar: null, indicaciones: 'Estaciona en la calle de atrás' })
  })

  it('does not touch taller_ediciones when both are blank', async () => {
    const { fromMock } = setupCrearEdicionConDatos({})
    const result = await crearEdicion({ ...crearConDatos, lugar: ' ', indicaciones: '' })
    expect(result.ok).toBe(true)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('refuses a lugar over 200 characters before creating anything', async () => {
    const { rpcMock, fromMock } = setupCrearEdicionConDatos({})
    const result = await crearEdicion({ ...crearConDatos, lugar: 'l'.repeat(201) })
    expect(result).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'El lugar no puede superar los 200 caracteres.',
    })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('refuses indicaciones over 500 characters before creating anything', async () => {
    const { rpcMock } = setupCrearEdicionConDatos({})
    const result = await crearEdicion({ ...crearConDatos, indicaciones: 'i'.repeat(501) })
    expect(result).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'Las indicaciones no pueden superar los 500 caracteres.',
    })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it.each([
    ['an error', { data: null, error: { code: '42501', message: 'denied' } }],
    ['zero rows (RLS)', { data: [], error: null }],
  ])('keeps ok with an advertencia when the second write gives %s', async (_caso, updateResult) => {
    setupCrearEdicionConDatos({ updateResult })
    const result = await crearEdicion({ ...crearConDatos, lugar: 'Salón 2' })
    expect(result).toEqual({
      ok: true,
      ediciones: [
        { edicionId: 'e-1', nombre: 'Marzo 2027' },
        { edicionId: 'e-2', nombre: 'Abril 2027' },
      ],
      advertencia:
        'La edición se creó, pero no pudimos guardar el lugar y las indicaciones. Agrégalos desde la edición.',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })

  it('does not write them when the RPC fails', async () => {
    const { fromMock } = setupCrearEdicionConDatos({
      rpcResult: { data: null, error: { code: 'P0001', message: 'EDICION_YA_EXISTE' } },
    })
    const result = await crearEdicion({ ...crearConDatos, lugar: 'Salón 2' })
    expect(result.ok).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })
})
