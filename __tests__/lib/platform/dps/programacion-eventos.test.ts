/**
 * Special events on the annual programming sheet (odd/tasks/dps-asistencia-pco.md,
 * T11b; S9, L44): reading `evento` and `con_asistencia` of the plan JSON,
 * «<Título> · Día N de M», the days a new event takes, the warnings of
 * «Nuevo evento», why a plan cannot be moved or deleted, and the Spanish
 * messages of dps_evento_crear / dps_plan_mover / dps_plan_eliminar. Every
 * name is fictitious.
 */
import { codigoErrorDps, mensajeErrorDps } from '@/lib/platform/dps/errores'
import {
  avisoEvento,
  bloqueoEliminar,
  bloqueoMover,
  choquesEvento,
  diasDelEvento,
  diasEvento,
  filasHoja,
  leerPlanHoja,
  leerPlanesHoja,
  MAX_DIAS_EVENTO,
  mensajeErrorEvento,
  nombreEspecial,
  TIPOS_EVENTO,
} from '@/lib/platform/dps/programacion'

const plan = (id: string, fecha: string, parche: Record<string, unknown> = {}) => ({
  id,
  fecha,
  tipo: 'especial',
  titulo: 'Conferencia Familias',
  semana: null,
  serie: null,
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  productor: null,
  host: null,
  comunicador: null,
  campos: {},
  evento: null,
  con_asistencia: false,
  ...parche,
})

const EV = 'ev-1'
const PLANES = leerPlanesHoja([
  plan('d1', '2026-11-20', { evento: { id: EV, dia: 1, dias: 3 } }),
  plan('d2', '2026-11-21', { evento: { id: EV, dia: 2, dias: 3 }, con_asistencia: true }),
  plan('d3', '2026-11-22', { evento: { id: EV, dia: 3, dias: 3 } }),
  plan('cena', '2026-11-24', { tipo: 'cena_del_senor', titulo: null }),
  plan('solo', '2026-11-27', { titulo: 'Bautizos', evento: { id: 'ev-2', dia: 1, dias: 1 } }),
  plan('dom', '2026-11-29', { tipo: 'domingo', titulo: null }),
])
const porId = (id: string) => PLANES.find((p) => p.id === id)!

describe('reading the plan JSON', () => {
  it('reads evento and con_asistencia', () => {
    expect(porId('d2')).toMatchObject({ evento: { id: EV, dia: 2, dias: 3 }, conAsistencia: true })
    expect(porId('cena')).toMatchObject({ evento: null, conAsistencia: false })
  })

  it('drops a malformed evento and reads a missing con_asistencia as false (older payloads)', () => {
    expect(leerPlanHoja(plan('x', '2026-11-20', { evento: { id: 3, dia: 'a' } }))?.evento).toBeNull()
    const { con_asistencia: _sin, evento: _ev, ...viejo } = plan('y', '2026-11-20')
    expect(leerPlanHoja(viejo)).toMatchObject({ evento: null, conAsistencia: false })
  })
})

describe('nombreEspecial', () => {
  it('names the day of a multi-day event «Título · Día N de M»', () => {
    expect(nombreEspecial(porId('d1'))).toBe('Conferencia Familias · Día 1 de 3')
    expect(nombreEspecial(porId('d3'))).toBe('Conferencia Familias · Día 3 de 3')
  })

  it('keeps a one-day event and a plan without título as before', () => {
    expect(nombreEspecial(porId('solo'))).toBe('Bautizos')
    expect(nombreEspecial(porId('cena'))).toBe('Cena del Señor')
  })

  it('shows the event days together, by date, in the sheet', () => {
    const especiales = filasHoja(PLANES, 2026).filter((f) => f.clase === 'especial')
    expect(especiales.map((f) => f.clave)).toEqual(['d1', 'd2', 'd3', 'cena', 'solo'])
  })
})

describe('Nuevo evento', () => {
  it('offers the three tipos of an event', () => {
    expect(TIPOS_EVENTO).toEqual([
      { valor: 'especial', etiqueta: 'Servicio especial' },
      { valor: 'cena_del_senor', etiqueta: 'Cena del Señor' },
      { valor: 'noche_adoracion', etiqueta: 'Noche de adoración' },
    ])
    expect(MAX_DIAS_EVENTO).toBe(14)
  })

  it('lists the days from Del to Al (Al empty = one day)', () => {
    expect(diasEvento('2026-11-20', '')).toEqual(['2026-11-20'])
    expect(diasEvento('2026-11-20', '2026-11-20')).toEqual(['2026-11-20'])
    expect(diasEvento('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
    expect(diasEvento('2026-11-22', '2026-11-20')).toEqual([])
    expect(diasEvento('', '')).toEqual([])
    expect(diasEvento('2026-02-30', '')).toEqual([])
  })

  it('warns about a missing date, an inverted range and more than 14 days', () => {
    expect(avisoEvento('', '')).toBe('Elige la fecha del evento.')
    expect(avisoEvento('2026-11-20', '2026-13-01')).toBe('Revisa la fecha del último día.')
    expect(avisoEvento('2026-11-22', '2026-11-20')).toBe('El último día no puede ser antes del primero.')
    expect(avisoEvento('2026-11-01', '2026-11-15')).toBe('Un evento dura como máximo 14 días.')
    expect(avisoEvento('2026-11-01', '2026-11-14')).toBeNull()
    expect(avisoEvento('2026-11-01', '')).toBeNull()
  })

  it('finds the days that already have an event of that tipo and título (case and spaces ignored)', () => {
    expect(choquesEvento(PLANES, 'especial', '  conferencia familias ', ['2026-11-19', '2026-11-20', '2026-11-21'])).toEqual(['2026-11-20', '2026-11-21'])
    expect(choquesEvento(PLANES, 'noche_adoracion', 'Conferencia Familias', ['2026-11-20'])).toEqual([])
    expect(choquesEvento(PLANES, 'especial', '', ['2026-11-20'])).toEqual([])
  })
})

describe('moving and deleting', () => {
  it('says why a plan cannot be moved', () => {
    expect(bloqueoMover(porId('dom'), '2026-11-10')).toBe('Los domingos de la programación no se mueven.')
    expect(bloqueoMover(porId('d1'), '2026-11-21')).toBe('Este día ya pasó: no se puede mover.')
    expect(bloqueoMover(porId('d2'), '2026-11-10')).toBe('Este día ya tiene asistencia marcada: no se puede mover.')
    expect(bloqueoMover(porId('d1'), '2026-11-20')).toBeNull()
  })

  it('says why a plan cannot be deleted', () => {
    expect(bloqueoEliminar(porId('dom'))).toBe('Los domingos de la programación no se eliminan.')
    expect(bloqueoEliminar(porId('d2'))).toBe('Este día ya tiene asistencia marcada: no se puede eliminar.')
    expect(bloqueoEliminar(porId('d1'))).toBeNull()
  })

  it('finds the days of the same event, by date', () => {
    expect(diasDelEvento(PLANES, porId('d3')).map((p) => p.id)).toEqual(['d1', 'd2', 'd3'])
    expect(diasDelEvento(PLANES, porId('cena')).map((p) => p.id)).toEqual(['cena'])
  })
})

describe('error messages', () => {
  it('knows the new codes', () => {
    for (const codigo of ['tipo_invalido', 'plan_domingo', 'plan_pasado', 'fecha_pasada', 'plan_con_asistencia']) {
      expect(codigoErrorDps({ message: codigo })).toBe(codigo)
    }
  })

  it('maps every refusal of the three RPCs', () => {
    expect(mensajeErrorEvento({ message: 'plan_duplicado', details: '2026-11-21' })).toBe('Ya hay un evento de ese tipo con ese título el 21 de noviembre.')
    expect(mensajeErrorEvento({ message: 'plan_duplicado' })).toBe('Ya hay un evento de ese tipo con ese título en esa fecha.')
    expect(mensajeErrorEvento({ code: '42501', message: 'sin_autoridad' })).toBe('Solo quienes arman el plan pueden crear, mover o eliminar eventos.')
    expect(mensajeErrorEvento({ message: 'tipo_invalido' })).toBe('Elige servicio especial, Cena del Señor o Noche de adoración.')
    expect(mensajeErrorEvento({ message: 'titulo_invalido' })).toBe('Escribe el título del evento (máximo 120 caracteres).')
    expect(mensajeErrorEvento({ message: 'fecha_invalida' })).toBe('Elige la fecha del evento.')
    expect(mensajeErrorEvento({ message: 'rango_invalido' })).toBe('Un evento dura de 1 a 14 días. Revisa las fechas.')
    expect(mensajeErrorEvento({ message: 'plan_invalido' })).toBe('Ese plan ya no existe. Actualiza la página.')
    expect(mensajeErrorEvento({ message: 'plan_domingo' })).toBe('Los domingos de la programación no se mueven ni se eliminan.')
    expect(mensajeErrorEvento({ message: 'plan_pasado' })).toBe('Este día ya pasó: no se puede mover.')
    expect(mensajeErrorEvento({ message: 'fecha_pasada' })).toBe('Elige una fecha de hoy en adelante.')
    expect(mensajeErrorEvento({ message: 'plan_con_asistencia' })).toBe('Ya tiene asistencia marcada: no se puede mover ni eliminar.')
    expect(mensajeErrorEvento({ message: 'boom' })).toBe('No se pudo guardar el evento. Intenta de nuevo.')
  })

  it('leaves the other screens as they were', () => {
    expect(mensajeErrorDps({ message: 'fecha_invalida' }, 'programacion')).toBe('El primer domingo tiene que caer en domingo.')
    expect(mensajeErrorDps({ message: 'rango_invalido' }, 'plan')).toBe('Revisa las fechas e inténtalo de nuevo.')
    expect(mensajeErrorDps({ message: 'titulo_invalido' }, 'programacion')).toBe('Ese valor es muy largo o no es válido.')
  })
})
