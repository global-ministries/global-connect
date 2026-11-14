/**
 * DPS configuration rules (odd/tasks/dps-asistencia-pco.md, T9; S6.2, S6.3):
 * reading dps_config_leer, checking the horarios and llegada before saving,
 * and the "Quién pasa asistencia" inheritance (no row = the nearest ancestor
 * with one, true at the top), recomputed in place after a change.
 */
import {
  leerConfig,
  normalizarHorarios,
  recalcularPasanAsistencia,
  validarLlegada,
  type ConfigDps,
} from '@/lib/platform/dps/configuracion'

const CONFIG_JSON = {
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  planificadores: [{ persona_id: 'u1', nombre: 'Ana Rivas', agregado_at: '2026-11-07T10:00:00Z' }],
  pasan_asistencia: [
    { equipo_id: 'dps', equipo: 'DPS', ruta: 'DPS', profundidad: 0, habilitado: true, explicito: null },
    { equipo_id: 'pt', equipo: 'Producción Técnica', ruta: 'DPS › Producción Técnica', profundidad: 1, habilitado: false, explicito: false },
    { equipo_id: 'audio', equipo: 'Audio', ruta: 'DPS › Producción Técnica › Audio', profundidad: 2, habilitado: false, explicito: null },
    { equipo_id: 'pt2', equipo: 'Producción Técnica 2', ruta: 'DPS › Producción Técnica 2', profundidad: 1, habilitado: true, explicito: null },
  ],
}

const config = (): ConfigDps => leerConfig(CONFIG_JSON)

describe('leerConfig', () => {
  it('reads horarios, llegada, planners and the teams', () => {
    const c = config()
    expect(c.horarios).toEqual(['09:15', '11:15'])
    expect(c.llegada).toBe('07:00')
    expect(c.planificadores).toEqual([{ personaId: 'u1', nombre: 'Ana Rivas' }])
    expect(c.pasanAsistencia[2]).toEqual({ equipoId: 'audio', equipo: 'Audio', ruta: 'DPS › Producción Técnica › Audio', profundidad: 2, habilitado: false, explicito: null })
  })

  it('falls back to the defaults for an empty answer', () => {
    expect(leerConfig(null)).toEqual({ horarios: [], llegada: '', planificadores: [], pasanAsistencia: [] })
  })

  it('reads the reminder by e-mail when the database sends it (T16c, S14.3)', () => {
    expect(leerConfig({ ...CONFIG_JSON, recordatorio: { activo: true, dias: 4, hora: '10:00', puede_editar: false, proximo: null, ultimo: null } }).recordatorio).toEqual({
      activo: true,
      dias: 4,
      hora: '10:00',
      puedeEditar: false,
      proximo: null,
      ultimo: null,
    })
    expect(config().recordatorio).toBeUndefined()
  })
})

describe('normalizarHorarios', () => {
  it('sorts, drops repeats and blanks', () => {
    expect(normalizarHorarios(['11:15', ' 09:15', '', '09:15'])).toEqual({ ok: true, horarios: ['09:15', '11:15'] })
  })

  it('accepts 9:15 and pads it', () => {
    expect(normalizarHorarios(['9:15'])).toEqual({ ok: true, horarios: ['09:15'] })
  })

  it('rejects a bad time, none or more than four (as dps_plan_horarios_guardar, T13c)', () => {
    expect(normalizarHorarios(['25:00'])).toEqual({ ok: false, mensaje: 'Revisa los horarios: de 1 a 4, con el formato 09:15.' })
    expect(normalizarHorarios([])).toMatchObject({ ok: false })
    expect(normalizarHorarios(['07:00', '08:00', '09:00', '10:00'])).toEqual({ ok: true, horarios: ['07:00', '08:00', '09:00', '10:00'] })
    expect(normalizarHorarios(['07:00', '08:00', '09:00', '10:00', '11:00'])).toMatchObject({ ok: false })
  })
})

describe('validarLlegada', () => {
  it('pads and checks the arrival time', () => {
    expect(validarLlegada('7:00')).toEqual({ ok: true, llegada: '07:00' })
    expect(validarLlegada('07:60')).toEqual({ ok: false, mensaje: 'Revisa la hora de llegada, con el formato 07:00.' })
  })

  it('refuses a llegada after the first horario (T13c); at it is fine', () => {
    expect(validarLlegada('09:16', '09:15')).toEqual({ ok: false, mensaje: 'La llegada no puede ser después del primer horario.' })
    expect(validarLlegada('9:15', '09:15')).toEqual({ ok: true, llegada: '09:15' })
  })
})

describe('recalcularPasanAsistencia', () => {
  it('turning a parent on makes its inheriting children follow', () => {
    const r = recalcularPasanAsistencia(config().pasanAsistencia, 'pt', true)
    expect(r.map((e) => [e.equipoId, e.habilitado, e.explicito])).toEqual([
      ['dps', true, null],
      ['pt', true, true],
      ['audio', true, null],
      ['pt2', true, null],
    ])
  })

  it('inherit drops the explicit value; a sibling with a similar name is not a child', () => {
    const conRaizApagada = recalcularPasanAsistencia(config().pasanAsistencia, 'dps', false)
    expect(conRaizApagada.map((e) => e.habilitado)).toEqual([false, false, false, false])
    const r = recalcularPasanAsistencia(conRaizApagada, 'pt', null)
    expect(r.find((e) => e.equipoId === 'pt')).toMatchObject({ explicito: null, habilitado: false })
    expect(recalcularPasanAsistencia(config().pasanAsistencia, 'pt', null).map((e) => e.habilitado)).toEqual([true, true, true, true])
  })
})
