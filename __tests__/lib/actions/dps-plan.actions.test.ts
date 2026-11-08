/**
 * @jest-environment node
 */
/**
 * Server actions of /dps/plan, Plan del domingo · Equipos
 * (odd/tasks/dps-asistencia-pco.md, T10; S6.2, S6.4, S7.4): reload the
 * teams, search candidates, convocar / quitar, the previous plan and
 * "Copiar del domingo anterior", and the series cover. Every RPC goes
 * through the session client, so the database enforces who may edit; the
 * cover is uploaded with the service role only after checking the type, the
 * size and that the caller edits the plan, and removed again when
 * dps_serie_imagen refuses it. Nothing is revalidated: the client applies
 * the changes in place.
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()
const upload = jest.fn()
const remove = jest.fn()
const from = jest.fn(() => ({ upload, remove }))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ storage: { from } }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import {
  buscarCandidatosDps,
  cambiarPortadaDps,
  cargarEquiposDps,
  convocarDps,
  copiarPlanDps,
  desconvocarDps,
  planAnteriorDps,
  quitarPortadaDps,
} from '@/lib/actions/dps-plan.actions'

const PLAN = '66666666-6666-4666-8666-666666666666'
const ANTERIOR = '55555555-5555-4555-8555-555555555555'
const PUESTO = '77777777-7777-4777-8777-777777777777'
const SERVICIO = '88888888-8888-4888-8888-888888888888'
const PERSONA = '11111111-1111-4111-8111-111111111111'
const SERIE = '99999999-9999-4999-8999-999999999999'
const DATOS_INVALIDOS = { ok: false, message: 'Revisa los datos e inténtalo de nuevo.', codigo: null }
const SIN_SESION = { ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.', codigo: null }

const respuestas = (mapa: Record<string, { data: unknown; error: unknown }>) =>
  rpc.mockImplementation(async (nombre: string) => mapa[nombre] ?? { data: null, error: null })

const planLeido = (parche: Record<string, unknown> = {}) => ({
  id: PLAN,
  fecha: '2026-11-08',
  tipo: 'domingo',
  titulo: null,
  semana: 3,
  serie: { id: SERIE, nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: `${SERIE}/100.png`, semanas: 4 },
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  puede_editar: true,
  ...parche,
})

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  upload.mockReset()
  remove.mockReset()
  from.mockClear()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  upload.mockResolvedValue({ data: { path: 'x' }, error: null })
  remove.mockResolvedValue({ data: [], error: null })
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co'
})

describe('cargarEquiposDps', () => {
  it('reads the teams of the plan', async () => {
    respuestas({ dps_plan_equipos: { data: { plan_id: PLAN, puede_editar: true, equipos: [] }, error: null } })
    expect(await cargarEquiposDps({ planId: PLAN })).toEqual({ ok: true, data: { planId: PLAN, puedeEditar: true, equipos: [] } })
    expect(rpc).toHaveBeenCalledWith('dps_plan_equipos', { p_plan_id: PLAN })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a bad id before calling and asks to sign in again without a session', async () => {
    expect(await cargarEquiposDps({ planId: 'x' })).toEqual(DATOS_INVALIDOS)
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await cargarEquiposDps({ planId: PLAN })).toEqual(SIN_SESION)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains a removed plan', async () => {
    respuestas({ dps_plan_equipos: { data: null, error: { code: '22023', message: 'plan_invalido' } } })
    expect(await cargarEquiposDps({ planId: PLAN })).toEqual({ ok: false, message: 'Ese plan ya no existe. Actualiza la página.', codigo: 'plan_invalido' })
  })
})

describe('buscarCandidatosDps', () => {
  it('searches the puesto team with a trimmed text (null when empty)', async () => {
    respuestas({
      dps_candidatos_puesto: {
        data: [{ servicio_id: SERVICIO, persona_id: PERSONA, nombre: 'Irene', apellido: 'Saavedra', equipo: 'Video', rol: 'Servidor', puestos_del_dia: [] }],
        error: null,
      },
    })
    const r = await buscarCandidatosDps({ planId: PLAN, puestoId: PUESTO, busqueda: '  ire ' })
    expect(rpc).toHaveBeenCalledWith('dps_candidatos_puesto', { p_puesto_id: PUESTO, p_plan_id: PLAN, p_busqueda: 'ire' })
    expect(r).toMatchObject({ ok: true, data: [{ servicioId: SERVICIO, personaId: PERSONA, nombre: 'Irene' }] })
    await buscarCandidatosDps({ planId: PLAN, puestoId: PUESTO, busqueda: '   ' })
    expect(rpc).toHaveBeenLastCalledWith('dps_candidatos_puesto', { p_puesto_id: PUESTO, p_plan_id: PLAN, p_busqueda: null })
  })

  it('refuses a search over 100 characters without calling', async () => {
    expect(await buscarCandidatosDps({ planId: PLAN, puestoId: PUESTO, busqueda: 'a'.repeat(101) })).toEqual({
      ok: false,
      message: 'La búsqueda es muy larga (máximo 100 caracteres).',
      codigo: 'busqueda_invalida',
    })
    expect(await buscarCandidatosDps({ planId: PLAN, puestoId: 'x', busqueda: '' })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains a caller who does not arm the plan', async () => {
    respuestas({ dps_candidatos_puesto: { data: null, error: { code: '42501', message: 'sin_autoridad' } } })
    expect(await buscarCandidatosDps({ planId: PLAN, puestoId: PUESTO, busqueda: '' })).toEqual({
      ok: false,
      message: 'Solo quienes arman el plan pueden cambiar los convocados.',
      codigo: 'sin_autoridad',
    })
  })
})

describe('convocarDps / desconvocarDps', () => {
  it('convoca the servicio in the puesto and returns the stored id', async () => {
    respuestas({ dps_convocar: { data: 'conv-1', error: null } })
    expect(await convocarDps({ planId: PLAN, puestoId: PUESTO, servicioId: SERVICIO })).toEqual({ ok: true, data: { convocadoId: 'conv-1' } })
    expect(rpc).toHaveBeenCalledWith('dps_convocar', { p_plan_id: PLAN, p_puesto_id: PUESTO, p_servicio_id: SERVICIO })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['servicio_invalido', 'Esa persona ya no sirve en este equipo. Busca de nuevo.'],
    ['puesto_invalido', 'Ese puesto ya no está activo. Actualiza la página.'],
  ])('explains %s', async (codigo, mensaje) => {
    respuestas({ dps_convocar: { data: null, error: { code: '22023', message: codigo } } })
    expect(await convocarDps({ planId: PLAN, puestoId: PUESTO, servicioId: SERVICIO })).toEqual({ ok: false, message: mensaje, codigo })
  })

  it('removes the person from the puesto', async () => {
    respuestas({ dps_desconvocar: { data: true, error: null } })
    expect(await desconvocarDps({ planId: PLAN, puestoId: PUESTO, personaId: PERSONA })).toEqual({ ok: true, data: { quitado: true } })
    expect(rpc).toHaveBeenCalledWith('dps_desconvocar', { p_plan_id: PLAN, p_puesto_id: PUESTO, p_persona_id: PERSONA })
  })

  it('checks the ids before calling', async () => {
    expect(await convocarDps({ planId: PLAN, puestoId: PUESTO, servicioId: 'x' })).toEqual(DATOS_INVALIDOS)
    expect(await desconvocarDps({ planId: PLAN, puestoId: 'x', personaId: PERSONA })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('planAnteriorDps / copiarPlanDps', () => {
  it('finds the previous plan of the same tipo and reads it', async () => {
    respuestas({
      dps_plan_anterior: { data: ANTERIOR, error: null },
      dps_plan_leer: { data: planLeido({ id: ANTERIOR, fecha: '2026-11-01', semana: 2 }), error: null },
    })
    const r = await planAnteriorDps({ planId: PLAN })
    expect(rpc).toHaveBeenNthCalledWith(1, 'dps_plan_anterior', { p_plan_id: PLAN })
    expect(rpc).toHaveBeenNthCalledWith(2, 'dps_plan_leer', { p_plan_id: ANTERIOR })
    expect(r).toMatchObject({ ok: true, data: { id: ANTERIOR, fecha: '2026-11-01', semana: 2 } })
  })

  it('is null when there is no previous plan', async () => {
    respuestas({ dps_plan_anterior: { data: null, error: null } })
    expect(await planAnteriorDps({ planId: PLAN })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('copies and returns the counts', async () => {
    respuestas({ dps_copiar_plan: { data: { copiados: 12, omitidos: 2 }, error: null } })
    expect(await copiarPlanDps({ origenId: ANTERIOR, destinoId: PLAN, reemplazar: false })).toEqual({ ok: true, data: { copiados: 12, omitidos: 2 } })
    expect(rpc).toHaveBeenCalledWith('dps_copiar_plan', { p_origen_id: ANTERIOR, p_destino_id: PLAN, p_reemplazar: false })
  })

  it('says when the plan already has convocados, so the screen can ask to replace', async () => {
    respuestas({ dps_copiar_plan: { data: null, error: { code: '22023', message: 'destino_con_convocados' } } })
    expect(await copiarPlanDps({ origenId: ANTERIOR, destinoId: PLAN, reemplazar: false })).toEqual({
      ok: false,
      message: 'Este plan ya tiene convocados. Elige si quieres reemplazarlos.',
      codigo: 'destino_con_convocados',
    })
  })

  it('refuses copying a plan onto itself and a non-boolean replace before calling', async () => {
    expect(await copiarPlanDps({ origenId: PLAN, destinoId: PLAN, reemplazar: false })).toEqual(DATOS_INVALIDOS)
    expect(await copiarPlanDps({ origenId: ANTERIOR, destinoId: PLAN, reemplazar: 'si' as unknown as boolean })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
  })
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

const formulario = (archivo: Blob | string | null, planId = PLAN) => {
  const datos = new FormData()
  datos.set('planId', planId)
  if (archivo instanceof Blob) datos.set('imagen', archivo, 'portada')
  else if (archivo !== null) datos.set('imagen', archivo)
  return datos
}
const imagen = (bytes: Uint8Array, type: string) => new File([bytes as BlobPart], 'portada', { type })
const IMAGEN_INVALIDA = { ok: false, message: 'La imagen debe ser JPG, PNG o WebP de hasta 5 MB.', codigo: 'imagen_invalida' }

describe('cambiarPortadaDps', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(1762600000000))
  afterEach(() => jest.restoreAllMocks())

  it.each([
    ['png', PNG, 'image/png'],
    ['jpg', JPEG, 'image/jpeg'],
    ['webp', WEBP, 'image/webp'],
  ] as const)('uploads a %s to <serie>/<timestamp>.<ext>, saves it with the user client and removes the old cover', async (ext, bytes, type) => {
    respuestas({ dps_plan_leer: { data: planLeido(), error: null }, dps_serie_imagen: { data: null, error: null } })
    const ruta = `${SERIE}/1762600000000.${ext}`
    const r = await cambiarPortadaDps(formulario(imagen(bytes, type)))
    expect(r).toEqual({ ok: true, data: { imagenPath: ruta, url: `https://demo.supabase.co/storage/v1/object/public/dps-series/${ruta}` } })
    expect(from).toHaveBeenCalledWith('dps-series')
    expect(upload).toHaveBeenCalledWith(ruta, expect.anything(), expect.objectContaining({ contentType: type, upsert: false }))
    expect(rpc).toHaveBeenCalledWith('dps_plan_leer', { p_plan_id: PLAN })
    expect(rpc).toHaveBeenCalledWith('dps_serie_imagen', { p_serie_id: SERIE, p_path: ruta })
    expect(remove).toHaveBeenCalledWith([`${SERIE}/100.png`])
  })

  it.each<[string, Blob | string | null]>([
    ['no file', null],
    ['a text field', 'hola'],
    ['an empty file', imagen(new Uint8Array(), 'image/png')],
    ['a gif', imagen(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]), 'image/gif')],
    ['a file whose bytes are not the declared type', imagen(JPEG, 'image/png')],
    ['a script named as an image', imagen(new TextEncoder().encode('<svg onload=alert(1)>'), 'image/webp')],
    ['a file over 5 MB', imagen(new Uint8Array(5 * 1024 * 1024 + 1).fill(0xff), 'image/jpeg')],
  ])('refuses %s before uploading anything', async (_caso, archivo) => {
    expect(await cambiarPortadaDps(formulario(archivo))).toEqual(IMAGEN_INVALIDA)
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts exactly 5 MB', async () => {
    respuestas({ dps_plan_leer: { data: planLeido(), error: null }, dps_serie_imagen: { data: null, error: null } })
    const bytes = new Uint8Array(5 * 1024 * 1024)
    bytes.set(JPEG)
    expect(await cambiarPortadaDps(formulario(imagen(bytes, 'image/jpeg')))).toMatchObject({ ok: true })
  })

  it('checks the plan id and the session before reading anything', async () => {
    expect(await cambiarPortadaDps(formulario(imagen(PNG, 'image/png'), 'x'))).toEqual(DATOS_INVALIDOS)
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await cambiarPortadaDps(formulario(imagen(PNG, 'image/png')))).toEqual(SIN_SESION)
    expect(rpc).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it('does not upload for someone who cannot edit, nor for a plan without a series', async () => {
    respuestas({ dps_plan_leer: { data: planLeido({ puede_editar: false }), error: null } })
    expect(await cambiarPortadaDps(formulario(imagen(PNG, 'image/png')))).toEqual({
      ok: false,
      message: 'Solo quienes arman el plan pueden cambiar la portada.',
      codigo: 'sin_autoridad',
    })
    respuestas({ dps_plan_leer: { data: planLeido({ serie: null }), error: null } })
    expect(await cambiarPortadaDps(formulario(imagen(PNG, 'image/png')))).toEqual({
      ok: false,
      message: 'Este plan no es de una serie: no tiene portada.',
      codigo: 'serie_invalida',
    })
    expect(upload).not.toHaveBeenCalled()
  })

  it('deletes the uploaded file when dps_serie_imagen refuses it, and keeps the old cover', async () => {
    respuestas({
      dps_plan_leer: { data: planLeido(), error: null },
      dps_serie_imagen: { data: null, error: { code: '42501', message: 'sin_autoridad' } },
    })
    expect(await cambiarPortadaDps(formulario(imagen(PNG, 'image/png')))).toEqual({
      ok: false,
      message: 'Solo quienes arman el plan pueden cambiar la portada.',
      codigo: 'sin_autoridad',
    })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith([`${SERIE}/1762600000000.png`])
  })

  it('stops when the upload fails, without touching the series', async () => {
    respuestas({ dps_plan_leer: { data: planLeido(), error: null } })
    upload.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await cambiarPortadaDps(formulario(imagen(PNG, 'image/png')))).toEqual({
      ok: false,
      message: 'No se pudo cambiar la portada. Intenta de nuevo.',
      codigo: null,
    })
    expect(rpc).not.toHaveBeenCalledWith('dps_serie_imagen', expect.anything())
    expect(remove).not.toHaveBeenCalled()
  })

  it('keeps an old cover outside the series folder', async () => {
    respuestas({
      dps_plan_leer: { data: planLeido({ serie: { id: SERIE, nombre: 'S', color: 'chart-1', imagen_path: 'otra/1.png', semanas: 4 } }), error: null },
      dps_serie_imagen: { data: null, error: null },
    })
    expect(await cambiarPortadaDps(formulario(imagen(PNG, 'image/png')))).toMatchObject({ ok: true })
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('quitarPortadaDps', () => {
  it('clears the cover with the user client, then removes the file', async () => {
    respuestas({ dps_plan_leer: { data: planLeido(), error: null }, dps_serie_imagen: { data: null, error: null } })
    expect(await quitarPortadaDps({ planId: PLAN })).toEqual({ ok: true, data: { imagenPath: null, url: null } })
    expect(rpc).toHaveBeenCalledWith('dps_serie_imagen', { p_serie_id: SERIE, p_path: null })
    expect(remove).toHaveBeenCalledWith([`${SERIE}/100.png`])
  })

  it('keeps the file when the RPC refuses', async () => {
    respuestas({
      dps_plan_leer: { data: planLeido(), error: null },
      dps_serie_imagen: { data: null, error: { code: '22023', message: 'serie_invalida' } },
    })
    expect(await quitarPortadaDps({ planId: PLAN })).toEqual({ ok: false, message: 'Esa serie ya no existe. Actualiza la página.', codigo: 'serie_invalida' })
    expect(remove).not.toHaveBeenCalled()
  })
})
