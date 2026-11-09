/**
 * Server actions of /dps/configuracion (odd/tasks/dps-asistencia-pco.md,
 * T9; S6.3): horarios and llegada, planificadores and "Quién pasa
 * asistencia", through the dps_* RPCs with the session client. The database
 * decides who may write (configurators only, L17); a 'sin_autoridad' comes
 * back with its code so the screen turns read-only.
 */
const rpc = jest.fn()
const getUser = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))

import {
  agregarAListaDps,
  agregarPlanificadorDps,
  buscarPersonasDps,
  buscarPersonasListaDps,
  quitarDeListaDps,
  guardarHorariosDps,
  guardarPasanAsistenciaDps,
  quitarPlanificadorDps,
} from '@/lib/actions/dps-configuracion.actions'

const P1 = '11111111-1111-4111-8111-111111111111'
const EQUIPO = '77777777-7777-4777-8777-777777777777'
const SIN_AUTORIDAD = { code: '42501', message: 'sin_autoridad' }
const NO_CONFIGURA = {
  ok: false,
  message: 'Solo la dirección de DPS, un pastor o un administrador puede cambiar la configuración.',
  codigo: 'sin_autoridad',
}
const CONFIG = { horarios: ['09:15'], llegada: '07:00', planificadores: [{ persona_id: P1, nombre: 'Ana Rivas' }], pasan_asistencia: [] }

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('guardarHorariosDps', () => {
  it('saves the normalized horarios and llegada', async () => {
    rpc.mockResolvedValueOnce({ data: { horarios: ['09:15', '11:15'], llegada: '07:00' }, error: null })
    const r = await guardarHorariosDps({ horarios: ['11:15', '9:15'], llegada: '7:00' })
    expect(rpc).toHaveBeenCalledWith('dps_config_guardar', { p_horarios: ['09:15', '11:15'], p_llegada: '07:00' })
    expect(r).toEqual({ ok: true, data: { horarios: ['09:15', '11:15'], llegada: '07:00' } })
  })

  it('rejects bad times before calling', async () => {
    expect(await guardarHorariosDps({ horarios: ['25:00'], llegada: '07:00' })).toEqual({
      ok: false,
      message: 'Revisa los horarios: de 1 a 4, con el formato 09:15.',
      codigo: 'horarios_invalidos',
    })
    expect(await guardarHorariosDps({ horarios: ['09:15'], llegada: 'x' })).toMatchObject({ ok: false, codigo: 'llegada_invalida' })
    // T13c: a llegada after the first horario, or five horarios.
    expect(await guardarHorariosDps({ horarios: ['09:15'], llegada: '09:30' })).toEqual({
      ok: false,
      message: 'La llegada no puede ser después del primer horario.',
      codigo: 'llegada_invalida',
    })
    expect(await guardarHorariosDps({ horarios: ['08:00', '09:00', '10:00', '11:00', '12:00'], llegada: '07:00' })).toMatchObject({ codigo: 'horarios_invalidos' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns sin_autoridad for a planner who does not configure', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: SIN_AUTORIDAD })
    expect(await guardarHorariosDps({ horarios: ['09:15'], llegada: '07:00' })).toEqual(NO_CONFIGURA)
  })
})

describe('planificadores', () => {
  it('adds one and returns the fresh configuration', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: CONFIG, error: null })
    const r = await agregarPlanificadorDps({ personaId: P1 })
    expect(rpc.mock.calls).toEqual([['dps_planificador_agregar', { p_persona_id: P1 }], ['dps_config_leer', undefined]])
    expect(r).toMatchObject({ ok: true, data: { planificadores: [{ personaId: P1, nombre: 'Ana Rivas' }] } })
  })

  it('removes one', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await quitarPlanificadorDps({ personaId: P1 })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('dps_planificador_quitar', { p_persona_id: P1 })
  })

  it('rejects a bad id and returns sin_autoridad', async () => {
    expect(await agregarPlanificadorDps({ personaId: 'x' })).toMatchObject({ ok: false, codigo: null })
    rpc.mockResolvedValueOnce({ data: null, error: SIN_AUTORIDAD })
    expect(await quitarPlanificadorDps({ personaId: P1 })).toEqual(NO_CONFIGURA)
  })
})

describe('guardarPasanAsistenciaDps', () => {
  it('sends true, false or null (inherit)', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    for (const habilitado of [true, false, null]) {
      expect(await guardarPasanAsistenciaDps({ equipoId: EQUIPO, habilitado })).toEqual({ ok: true, data: null })
    }
    expect(rpc.mock.calls).toEqual([
      ['dps_pasan_asistencia_guardar', { p_equipo_id: EQUIPO, p_habilitado: true }],
      ['dps_pasan_asistencia_guardar', { p_equipo_id: EQUIPO, p_habilitado: false }],
      ['dps_pasan_asistencia_guardar', { p_equipo_id: EQUIPO, p_habilitado: null }],
    ])
  })

  it('returns sin_autoridad', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: SIN_AUTORIDAD })
    expect(await guardarPasanAsistenciaDps({ equipoId: EQUIPO, habilitado: false })).toEqual(NO_CONFIGURA)
  })
})

describe('buscarPersonasDps', () => {
  it('searches people with the shared Dream Team search', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: P1, nombre: 'Ana', apellido: 'Rivas', email: 'ana@example.com' }], error: null })
    expect(await buscarPersonasDps({ q: ' an ' })).toEqual({ ok: true, data: [{ personaId: P1, nombre: 'Ana Rivas' }] })
    expect(rpc).toHaveBeenCalledWith('talleres_buscar_personas', { p_q: 'an', p_limit: 20 })
  })

  it('does not search under two letters and explains a denied search', async () => {
    expect(await buscarPersonasDps({ q: 'a' })).toEqual({ ok: true, data: [] })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sin_autoridad_para_buscar' } })
    expect(await buscarPersonasDps({ q: 'ana' })).toEqual({ ok: false, message: 'No tienes permiso para buscar personas.', codigo: 'sin_autoridad' })
  })
})

describe('the lists by position (S12.2)', () => {
  const LISTA = { lista: 'hosts', puede_editar: true, personas: [{ persona_id: P1, nombre: 'Ana Rivas', iniciales: 'AR' }] }

  it('adds and removes a person, returning the list', async () => {
    rpc.mockResolvedValue({ data: LISTA, error: null })
    expect(await agregarAListaDps({ lista: 'hosts', personaId: P1 })).toEqual({
      ok: true,
      data: { lista: 'hosts', puedeEditar: true, personas: [{ personaId: P1, nombre: 'Ana Rivas', iniciales: 'AR' }] },
    })
    expect(await quitarDeListaDps({ lista: 'comunicadores', personaId: P1 })).toMatchObject({ ok: true })
    expect(rpc.mock.calls).toEqual([
      ['dps_lista_agregar', { p_lista: 'hosts', p_persona_id: P1 }],
      ['dps_lista_quitar', { p_lista: 'comunicadores', p_persona_id: P1 }],
    ])
  })

  it('refuses Productores, Cantantes (Dream Team, L59), an unknown list or a bad id without calling', async () => {
    expect(await agregarAListaDps({ lista: 'productores' as never, personaId: P1 })).toMatchObject({ ok: false, codigo: null })
    expect(await quitarDeListaDps({ lista: 'productores' as never, personaId: P1 })).toMatchObject({ ok: false, codigo: null })
    expect(await agregarAListaDps({ lista: 'cantantes' as never, personaId: P1 })).toMatchObject({ ok: false, codigo: null })
    expect(await agregarAListaDps({ lista: 'bajistas' as never, personaId: P1 })).toMatchObject({ ok: false, codigo: null })
    expect(await quitarDeListaDps({ lista: 'hosts', personaId: 'x' })).toMatchObject({ ok: false, codigo: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains who may change the list', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: SIN_AUTORIDAD })
    expect(await agregarAListaDps({ lista: 'hosts', personaId: P1 })).toEqual({
      ok: false,
      message: 'No tienes permiso para cambiar esta lista.',
      codigo: 'sin_autoridad',
    })
  })

  it('searches people for a list with dps_buscar_personas', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: P1, nombre: 'Ana', apellido: 'Rivas', iniciales: 'AR' }], error: null })
    expect(await buscarPersonasListaDps({ texto: ' ana ' })).toEqual({ ok: true, data: [{ personaId: P1, nombre: 'Ana Rivas', iniciales: 'AR' }] })
    expect(rpc).toHaveBeenCalledWith('dps_buscar_personas', { p_texto: 'ana', p_limite: 10 })
    expect(await buscarPersonasListaDps({ texto: 'a' })).toEqual({ ok: true, data: [] })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
