/**
 * @jest-environment node
 *
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — server actions that
 * write the taller's own plantilla (taller_plantilla_clases,
 * taller_plantilla_grupos, taller_plantilla_facilitadores) and its
 * cadencia_dias/duracion_minutos. Same thin gate as updateTallerNombre
 * (flag + authenticated session only) — authorization is RLS plus, for
 * facilitadores, the NO_ES_SERVIDOR_ACTIVO_DEL_TALLER trigger (T1,
 * migration 20260926150000_talleres_plantillas_del_taller.sql).
 */

import {
  agregarFacilitador,
  crearPlantillaClase,
  crearPlantillaGrupo,
  editarPlantillaClaseTema,
  editarPlantillaGrupo,
  moverPlantillaClase,
  quitarFacilitador,
  toggleActivoPlantillaClase,
  toggleActivoPlantillaGrupo,
  updateCadenciaYDuracion,
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

const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const revalidatePathMock = jest.requireMock('next/cache').revalidatePath as jest.Mock

type Result = { data: unknown; error: unknown }

/**
 * A minimal chainable + thenable query-builder mock. Every `.from(table)`
 * call consumes the NEXT entry of `responses`, in order — one entry per
 * logical DB operation an action performs (e.g. crearPlantillaClase reads
 * the current max `numero` THEN inserts, so it needs two responses).
 * `.select/.eq/.order/.limit/.insert/.update/.delete` all return the same
 * builder (chainable); `.single()`/`.maybeSingle()` and a bare `await`
 * both resolve to that call's response (the query builder itself is
 * thenable, matching how the app code sometimes skips `.single()`).
 */
function sequentialClient(responses: readonly Result[]) {
  let call = 0
  const fromCalls: string[] = []
  const from = jest.fn((table: string) => {
    fromCalls.push(table)
    const result = responses[call] ?? { data: null, error: null }
    call += 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double
    const builder: any = {}
    for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete']) {
      builder[method] = jest.fn(() => builder)
    }
    builder.maybeSingle = jest.fn().mockResolvedValue(result)
    builder.single = jest.fn().mockResolvedValue(result)
    builder.then = (resolve: (v: Result) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject)
    return builder
  })
  return { from, fromCalls }
}

function setup(responses: readonly Result[]) {
  const client = sequentialClient(responses)
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) },
    ...client,
  })
  return client
}

const OK: Result = { data: {}, error: null }

beforeEach(() => {
  revalidatePathMock.mockReset()
})

describe('crearPlantillaClase', () => {
  it('numbers the new clase one past the current max and revalidates', async () => {
    const client = setup([{ data: { numero: 3 }, error: null }, OK])
    const result = await crearPlantillaClase({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      tema: 'Influencia',
    })
    expect(result.ok).toBe(true)
    expect(client.from).toHaveBeenNthCalledWith(2, 'taller_plantilla_clases')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })

  it('starts at numero 1 when the taller has no plantilla clases yet', async () => {
    setup([{ data: null, error: null }, OK])
    const result = await crearPlantillaClase({ tallerId: 't-1', tallerSlug: 'proximo-paso', tema: 'Sígueme' })
    expect(result.ok).toBe(true)
  })

  it('rejects an empty tema', async () => {
    setup([{ data: null, error: null }, OK])
    const result = await crearPlantillaClase({ tallerId: 't-1', tallerSlug: 'proximo-paso', tema: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

describe('editarPlantillaClaseTema', () => {
  it('updates the tema and revalidates', async () => {
    setup([OK])
    const result = await editarPlantillaClaseTema({
      tallerSlug: 'proximo-paso',
      claseId: 'c-2',
      tema: 'Intimidad con Dios',
    })
    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })

  it('rejects an empty tema', async () => {
    setup([OK])
    const result = await editarPlantillaClaseTema({ tallerSlug: 'proximo-paso', claseId: 'c-2', tema: '' })
    expect(result.ok).toBe(false)
  })
})

describe('toggleActivoPlantillaClase', () => {
  it('flips activo and revalidates', async () => {
    setup([OK])
    const result = await toggleActivoPlantillaClase({
      tallerSlug: 'proximo-paso',
      claseId: 'c-3',
      activo: false,
    })
    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

describe('moverPlantillaClase', () => {
  const CLASES = [
    { id: 'c-1', numero: 1, tema: 'Sígueme', activo: true },
    { id: 'c-2', numero: 2, tema: 'Intimidad con Dios', activo: true },
    { id: 'c-3', numero: 3, tema: 'Compañerismo', activo: true },
  ]

  it('swaps numero with the previous clase on subir', async () => {
    setup([{ data: CLASES, error: null }, OK, OK, OK])
    const result = await moverPlantillaClase({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      claseId: 'c-2',
      direccion: 'subir',
    })
    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })

  it('swaps numero with the next clase on bajar', async () => {
    setup([{ data: CLASES, error: null }, OK, OK, OK])
    const result = await moverPlantillaClase({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      claseId: 'c-2',
      direccion: 'bajar',
    })
    expect(result.ok).toBe(true)
  })

  it('no-ops when already first and asked to subir', async () => {
    setup([{ data: CLASES, error: null }])
    const result = await moverPlantillaClase({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      claseId: 'c-1',
      direccion: 'subir',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('no-op')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('no-ops when already last and asked to bajar', async () => {
    setup([{ data: CLASES, error: null }])
    const result = await moverPlantillaClase({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      claseId: 'c-3',
      direccion: 'bajar',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('no-op')
  })
})

describe('updateCadenciaYDuracion', () => {
  it('rejects a cadencia below 1', async () => {
    setup([OK])
    const result = await updateCadenciaYDuracion({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      cadenciaDias: 0,
      duracionMinutos: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('updates cadencia and duracion, and revalidates', async () => {
    setup([OK])
    const result = await updateCadenciaYDuracion({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      cadenciaDias: 14,
      duracionMinutos: 90,
    })
    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

describe('crearPlantillaGrupo', () => {
  it('orders the new grupo one past the current max and revalidates', async () => {
    const client = setup([{ data: { orden: 1 }, error: null }, OK])
    const result = await crearPlantillaGrupo({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      nombre: 'Grupo Beta',
      capacidad: 10,
    })
    expect(result.ok).toBe(true)
    expect(client.from).toHaveBeenNthCalledWith(2, 'taller_plantilla_grupos')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })

  it('rejects a non-positive capacidad', async () => {
    setup([{ data: null, error: null }, OK])
    const result = await crearPlantillaGrupo({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      nombre: 'Grupo Beta',
      capacidad: 0,
    })
    expect(result.ok).toBe(false)
  })
})

describe('editarPlantillaGrupo', () => {
  it('updates nombre and capacidad, and revalidates', async () => {
    setup([OK])
    const result = await editarPlantillaGrupo({
      tallerSlug: 'proximo-paso',
      grupoId: 'g-1',
      nombre: 'Grupo Alfa',
      capacidad: 15,
    })
    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

describe('toggleActivoPlantillaGrupo', () => {
  it('flips activo and revalidates', async () => {
    setup([OK])
    const result = await toggleActivoPlantillaGrupo({
      tallerSlug: 'proximo-paso',
      grupoId: 'g-1',
      activo: false,
    })
    expect(result.ok).toBe(true)
  })
})

describe('agregarFacilitador', () => {
  it('inserts the facilitador and revalidates', async () => {
    setup([OK])
    const result = await agregarFacilitador({
      tallerSlug: 'proximo-paso',
      plantillaGrupoId: 'g-1',
      personaId: 'p-1',
      rol: 'lider',
    })
    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })

  it('rejects an invalid rol', async () => {
    setup([OK])
    const result = await agregarFacilitador({
      tallerSlug: 'proximo-paso',
      plantillaGrupoId: 'g-1',
      personaId: 'p-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately invalid for the test
      rol: 'coordinador' as any,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('maps P0001 NO_ES_SERVIDOR_ACTIVO_DEL_TALLER to the friendly Spanish message', async () => {
    setup([{ data: null, error: { code: 'P0001', message: 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER' } }])
    const result = await agregarFacilitador({
      tallerSlug: 'proximo-paso',
      plantillaGrupoId: 'g-1',
      personaId: 'p-inactivo',
      rol: 'voluntario',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('conflict')
      expect(result.message).toMatch(/servidor activo/i)
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('quitarFacilitador', () => {
  it('deletes the facilitador and revalidates', async () => {
    setup([OK])
    const result = await quitarFacilitador({ tallerSlug: 'proximo-paso', facilitadorId: 'f-1' })
    expect(result.ok).toBe(true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})
