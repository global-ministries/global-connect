/**
 * @jest-environment node
 */
/**
 * Server actions of the «Orden» tab of /dps/plan (odd/tasks/dps-asistencia-pco.md,
 * T13, S10): read the order, start it from the template, add / save / move /
 * remove a row, copy the previous plan's order and save the plan's own
 * horarios. Every RPC goes through the session client, so the database
 * decides who edits (supabase/migrations/20261108208000_dps_orden_servicio.sql);
 * malformed input is refused before calling, and invalid horarios with the
 * same code the RPC would raise. Nothing is revalidated.
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import {
  agregarFilaOrdenDps,
  cargarOrdenDps,
  copiarOrdenDps,
  guardarFilaOrdenDps,
  guardarHorariosDps,
  moverFilaOrdenDps,
  plantillaOrdenDps,
  quitarFilaOrdenDps,
} from '@/lib/actions/dps-orden.actions'

const PLAN = '66666666-6666-4666-8666-666666666666'
const ANTERIOR = '55555555-5555-4555-8555-555555555555'
const ITEM = '77777777-7777-4777-8777-777777777777'
const DATOS_INVALIDOS = { ok: false, message: 'Revisa los datos e inténtalo de nuevo.', codigo: null }
const SIN_SESION = { ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.', codigo: null }
const SIN_AUTORIDAD = { ok: false, message: 'Solo quienes arman el plan pueden cambiar el orden del servicio.', codigo: 'sin_autoridad' }

const respuestas = (mapa: Record<string, { data: unknown; error: unknown }>) =>
  rpc.mockImplementation(async (nombre: string) => mapa[nombre] ?? { data: null, error: null })
const negado = { data: null, error: { code: '42501', message: 'sin_autoridad' } }

const itemJson = (parche: Record<string, unknown> = {}) => ({
  id: ITEM,
  posicion: 3,
  tipo: 'item',
  titulo: 'Mensaje',
  duracion_seg: 2100,
  notas: null,
  responsable: 'Comunicador',
  fase: null,
  ...parche,
})
const fila = { id: ITEM, posicion: 3, tipo: 'item', titulo: 'Mensaje', duracionSeg: 2100, notas: null, responsable: 'Comunicador', fase: null }

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('cargarOrdenDps / plantillaOrdenDps', () => {
  it('reads the order of the plan', async () => {
    respuestas({ dps_orden_leer: { data: { plan_id: PLAN, puede_editar: false, items: [itemJson()] }, error: null } })
    expect(await cargarOrdenDps({ planId: PLAN })).toEqual({ ok: true, data: { planId: PLAN, puedeEditar: false, filas: [fila] } })
    expect(rpc).toHaveBeenCalledWith('dps_orden_leer', { p_plan_id: PLAN })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('starts an empty order from the template', async () => {
    respuestas({ dps_orden_plantilla: { data: { plan_id: PLAN, puede_editar: true, items: [itemJson({ posicion: 0 })] }, error: null } })
    expect(await plantillaOrdenDps({ planId: PLAN })).toEqual({ ok: true, data: { planId: PLAN, puedeEditar: true, filas: [{ ...fila, posicion: 0 }] } })
    expect(rpc).toHaveBeenCalledWith('dps_orden_plantilla', { p_plan_id: PLAN })
  })

  it('explains an order that is not empty any more', async () => {
    respuestas({ dps_orden_plantilla: { data: null, error: { code: '22023', message: 'destino_con_orden' } } })
    expect(await plantillaOrdenDps({ planId: PLAN })).toEqual({
      ok: false,
      message: 'Este plan ya tiene orden. Elige si quieres reemplazarlo.',
      codigo: 'destino_con_orden',
    })
  })

  it('rejects a bad id before calling and asks to sign in again without a session', async () => {
    expect(await cargarOrdenDps({ planId: 'x' })).toEqual(DATOS_INVALIDOS)
    expect(await plantillaOrdenDps({ planId: '' })).toEqual(DATOS_INVALIDOS)
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await cargarOrdenDps({ planId: PLAN })).toEqual(SIN_SESION)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('agregarFilaOrdenDps', () => {
  it('adds an item at a posicion and a header with its fase', async () => {
    respuestas({ dps_orden_agregar: { data: itemJson(), error: null } })
    expect(await agregarFilaOrdenDps({ planId: PLAN, tipo: 'item', titulo: 'Mensaje', duracionSeg: 2100, posicion: 3, fase: null })).toEqual({ ok: true, data: fila })
    expect(rpc).toHaveBeenCalledWith('dps_orden_agregar', {
      p_plan_id: PLAN,
      p_tipo: 'item',
      p_titulo: 'Mensaje',
      p_duracion_seg: 2100,
      p_posicion: 3,
      p_fase: null,
    })
    await agregarFilaOrdenDps({ planId: PLAN, tipo: 'encabezado', titulo: 'Nuevo encabezado', duracionSeg: 0, posicion: null, fase: 'servicio' })
    expect(rpc).toHaveBeenLastCalledWith('dps_orden_agregar', {
      p_plan_id: PLAN,
      p_tipo: 'encabezado',
      p_titulo: 'Nuevo encabezado',
      p_duracion_seg: 0,
      p_posicion: null,
      p_fase: 'servicio',
    })
  })

  it.each([
    [{ planId: 'x', tipo: 'item', titulo: 'A', duracionSeg: 60, posicion: null, fase: null }],
    [{ planId: PLAN, tipo: 'nota', titulo: 'A', duracionSeg: 60, posicion: null, fase: null }],
    [{ planId: PLAN, tipo: 'item', titulo: 7, duracionSeg: 60, posicion: null, fase: null }],
    [{ planId: PLAN, tipo: 'item', titulo: 'A', duracionSeg: 1.5, posicion: null, fase: null }],
    [{ planId: PLAN, tipo: 'item', titulo: 'A', duracionSeg: 60, posicion: 'fin', fase: null }],
    [{ planId: PLAN, tipo: 'encabezado', titulo: 'A', duracionSeg: 0, posicion: null, fase: 'luego' }],
  ])('refuses malformed input before calling (%#)', async (input) => {
    expect(await agregarFilaOrdenDps(input as never)).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains a full order and a caller who does not arm the plan', async () => {
    respuestas({ dps_orden_agregar: { data: null, error: { code: '22023', message: 'orden_lleno' } } })
    expect(await agregarFilaOrdenDps({ planId: PLAN, tipo: 'item', titulo: 'A', duracionSeg: 60, posicion: null, fase: null })).toEqual({
      ok: false,
      message: 'El orden llegó al máximo de 150 filas.',
      codigo: 'orden_lleno',
    })
    respuestas({ dps_orden_agregar: negado })
    expect(await agregarFilaOrdenDps({ planId: PLAN, tipo: 'item', titulo: 'A', duracionSeg: 60, posicion: null, fase: null })).toEqual(SIN_AUTORIDAD)
  })
})

describe('guardarFilaOrdenDps', () => {
  it('saves the whole row', async () => {
    respuestas({ dps_orden_item_guardar: { data: itemJson({ notas: 'Video corto' }), error: null } })
    expect(
      await guardarFilaOrdenDps({ itemId: ITEM, titulo: 'Mensaje', duracionSeg: 2100, notas: 'Video corto', responsable: 'Comunicador', fase: null }),
    ).toEqual({ ok: true, data: { ...fila, notas: 'Video corto' } })
    expect(rpc).toHaveBeenCalledWith('dps_orden_item_guardar', {
      p_item_id: ITEM,
      p_titulo: 'Mensaje',
      p_duracion_seg: 2100,
      p_notas: 'Video corto',
      p_responsable: 'Comunicador',
      p_fase: null,
    })
  })

  it('explains a bad duración and a removed row', async () => {
    respuestas({ dps_orden_item_guardar: { data: null, error: { code: '22023', message: 'duracion_invalida' } } })
    expect(await guardarFilaOrdenDps({ itemId: ITEM, titulo: 'A', duracionSeg: 60, notas: null, responsable: null, fase: null })).toMatchObject({
      ok: false,
      codigo: 'duracion_invalida',
    })
    respuestas({ dps_orden_item_guardar: { data: null, error: { code: '22023', message: 'item_invalido' } } })
    expect(await guardarFilaOrdenDps({ itemId: ITEM, titulo: 'A', duracionSeg: 60, notas: null, responsable: null, fase: null })).toEqual({
      ok: false,
      message: 'Ese elemento ya no está en el orden. Actualiza la página.',
      codigo: 'item_invalido',
    })
  })

  it('refuses malformed input before calling', async () => {
    expect(await guardarFilaOrdenDps({ itemId: 'x', titulo: 'A', duracionSeg: 60, notas: null, responsable: null, fase: null })).toEqual(DATOS_INVALIDOS)
    expect(await guardarFilaOrdenDps({ itemId: ITEM, titulo: 'A', duracionSeg: 60, notas: 3 as never, responsable: null, fase: null })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('moverFilaOrdenDps / quitarFilaOrdenDps', () => {
  it('moves a row and returns its new posicion', async () => {
    respuestas({ dps_orden_mover: { data: 2, error: null } })
    expect(await moverFilaOrdenDps({ itemId: ITEM, posicion: 2 })).toEqual({ ok: true, data: { posicion: 2 } })
    expect(rpc).toHaveBeenCalledWith('dps_orden_mover', { p_item_id: ITEM, p_posicion: 2 })
  })

  it('removes a row', async () => {
    respuestas({ dps_orden_eliminar: { data: true, error: null } })
    expect(await quitarFilaOrdenDps({ itemId: ITEM })).toEqual({ ok: true, data: { quitado: true } })
    expect(rpc).toHaveBeenCalledWith('dps_orden_eliminar', { p_item_id: ITEM })
  })

  it('refuses malformed input before calling and explains a refusal', async () => {
    expect(await moverFilaOrdenDps({ itemId: ITEM, posicion: -1 })).toEqual(DATOS_INVALIDOS)
    expect(await moverFilaOrdenDps({ itemId: ITEM, posicion: 1.5 })).toEqual(DATOS_INVALIDOS)
    expect(await quitarFilaOrdenDps({ itemId: 'x' })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
    respuestas({ dps_orden_eliminar: negado })
    expect(await quitarFilaOrdenDps({ itemId: ITEM })).toEqual(SIN_AUTORIDAD)
  })
})

describe('copiarOrdenDps', () => {
  it('copies the previous order and says how many rows', async () => {
    respuestas({ dps_orden_copiar: { data: 25, error: null } })
    expect(await copiarOrdenDps({ origenId: ANTERIOR, destinoId: PLAN, reemplazar: false })).toEqual({ ok: true, data: { copiados: 25 } })
    expect(rpc).toHaveBeenCalledWith('dps_orden_copiar', { p_origen_id: ANTERIOR, p_destino_id: PLAN, p_reemplazar: false })
  })

  it('asks to replace when the plan already has an order', async () => {
    respuestas({ dps_orden_copiar: { data: null, error: { code: '22023', message: 'destino_con_orden' } } })
    expect(await copiarOrdenDps({ origenId: ANTERIOR, destinoId: PLAN, reemplazar: false })).toMatchObject({ ok: false, codigo: 'destino_con_orden' })
  })

  it('refuses the same plan or a bad flag before calling', async () => {
    expect(await copiarOrdenDps({ origenId: PLAN, destinoId: PLAN, reemplazar: true })).toEqual(DATOS_INVALIDOS)
    expect(await copiarOrdenDps({ origenId: ANTERIOR, destinoId: PLAN, reemplazar: 'si' as never })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('guardarHorariosDps', () => {
  const planLeido = { id: PLAN, fecha: '2026-11-10', tipo: 'cena_del_senor', titulo: 'Cena del Señor', semana: null, serie: null, horarios: ['19:00'], llegada: '18:00' }

  it('saves one evening service and returns the plan header', async () => {
    respuestas({ dps_plan_horarios_guardar: { data: planLeido, error: null } })
    expect(await guardarHorariosDps({ planId: PLAN, horarios: ['19:00'], llegada: '18:00' })).toMatchObject({
      ok: true,
      data: { id: PLAN, tipo: 'cena_del_senor', horarios: ['19:00'], llegada: '18:00' },
    })
    expect(rpc).toHaveBeenCalledWith('dps_plan_horarios_guardar', { p_plan_id: PLAN, p_horarios: ['19:00'], p_llegada: '18:00' })
  })

  it('refuses invalid horarios with the code of the database, before calling', async () => {
    expect(await guardarHorariosDps({ planId: PLAN, horarios: ['11:15', '09:15'], llegada: '07:00' })).toEqual({
      ok: false,
      message: 'Revisa los servicios: de 1 a 4, cada uno después del anterior, con el formato 09:15.',
      codigo: 'horarios_invalidos',
    })
    expect(await guardarHorariosDps({ planId: PLAN, horarios: ['19:00'], llegada: '19:30' })).toEqual({
      ok: false,
      message: 'La llegada del equipo tiene que ser antes del primer servicio.',
      codigo: 'llegada_invalida',
    })
    expect(await guardarHorariosDps({ planId: PLAN, horarios: 'x' as never, llegada: '07:00' })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains a caller who does not arm the plan', async () => {
    respuestas({ dps_plan_horarios_guardar: negado })
    expect(await guardarHorariosDps({ planId: PLAN, horarios: ['19:00'], llegada: '18:00' })).toEqual({
      ok: false,
      message: 'Solo quienes arman el plan pueden cambiar los horarios.',
      codigo: 'sin_autoridad',
    })
  })
})
