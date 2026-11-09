/**
 * The annual programming sheet (odd/tasks/dps-asistencia-pco.md, T11; S6.4,
 * S7.1, S7.3; artboard prototipos/planificacion-dps/04-programacion-anual-hoja.html):
 * reading dps_planes_rango into sheet rows (every Sunday of the year, with
 * or without a plan, plus the special days), the cell values and what
 * dps_plan_campo receives for each column, the summary line, "Próximo",
 * and the "Nueva serie" helpers (its Sundays, the ones another series holds,
 * its color). Every name is fictitious.
 */
import {
  COLUMNAS_HOJA,
  choquesSerie,
  colorNuevaSerie,
  domingosDelAnio,
  domingosSerie,
  esDomingo,
  filasHoja,
  leerPlanHoja,
  leerPlanesHoja,
  mensajeErrorProgramacion,
  primerDomingoSugerido,
  proximoDomingo,
  resumenHoja,
  MAX_PERSONAS,
  semanaSerie,
  valorParaRpc,
  valorPersonasParaRpc,
} from '@/lib/platform/dps/programacion'

const SERIE_A = { id: 'sa', nombre: 'Empezar de nuevo', color: 'chart-1', imagen_path: null, semanas: 2, primer_domingo: '2026-01-04' }
const SERIE_B = { id: 'sb', nombre: 'Vida en comunidad', color: 'chart-2', imagen_path: null, semanas: 1, primer_domingo: '2026-01-18' }

const plan = (id: string, fecha: string, parche: Record<string, unknown> = {}) => ({
  id,
  fecha,
  tipo: 'domingo',
  titulo: null,
  semana: null,
  serie: null,
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  productor: null,
  host: null,
  comunicador: null,
  campos: {},
  ...parche,
})

const PLANES = [
  plan('p1', '2026-01-04', {
    serie: SERIE_A,
    semana: 1,
    productor: { persona_id: 'u1', texto: null, nombre: 'Ximena Rangel' },
    host: { persona_id: null, texto: 'Andrés Valero', nombre: 'Andrés Valero' },
    campos: { opener: 'Video: sala llena', canciones: ['Hogar', 'Ancla del alma'], notas: 'Bautizos' },
  }),
  plan('p2', '2026-01-11', { serie: SERIE_A, semana: 2 }),
  plan('cena', '2026-01-13', { tipo: 'cena_del_senor', horarios: ['18:45'] }),
  plan('p3', '2026-01-18', { serie: SERIE_B, semana: 1 }),
  plan('libre', '2026-12-27', { tipo: 'libre', titulo: null, horarios: ['10:00'] }),
]

describe('leerPlanHoja', () => {
  it('reads persona or text (S7.3), the creative campos and the series', () => {
    const p = leerPlanHoja(PLANES[0])!
    expect(p).toMatchObject({ id: 'p1', fecha: '2026-01-04', tipo: 'domingo', semana: 1 })
    expect(p.serie).toEqual({ id: 'sa', nombre: 'Empezar de nuevo', color: 'chart-1', semanas: 2 })
    expect(p.valores).toEqual({
      productor: 'Ximena Rangel',
      host: 'Andrés Valero',
      comunicador: '',
      opener: 'Video: sala llena',
      anuncios: '',
      cantantes: '',
      canciones: 'Hogar · Ancla del alma',
      closer: '',
      historia_vida: '',
      notas: 'Bautizos',
    })
    // Without `personas` (an older read) the single keys still fill the cells.
    expect(p.personas).toEqual({
      productor: [{ personaId: 'u1', nombre: 'Ximena Rangel' }],
      host: [{ personaId: null, nombre: 'Andrés Valero' }],
      comunicador: [],
      cantantes: [],
    })
  })

  it('reads several people per cell from `personas` (S12.4), in order, joined in the cell text', () => {
    const p = leerPlanHoja(
      plan('m', '2026-02-01', {
        productor: { persona_id: 'u1', texto: null, nombre: 'Ximena Rangel' },
        campos: { cantantes: 'Lía Soto, Coro invitado' },
        personas: {
          productor: [
            { persona_id: 'u1', texto: null, nombre: 'Ximena Rangel' },
            { persona_id: null, texto: 'Invitada Ana', nombre: 'Invitada Ana' },
          ],
          host: [],
          comunicador: [{ persona_id: 'u3', texto: null, nombre: 'Tomás Gil' }],
          cantantes: [
            { persona_id: 'u4', texto: null, nombre: 'Lía Soto' },
            { persona_id: null, texto: 'Coro invitado', nombre: 'Coro invitado' },
            { persona_id: 7, nombre: 'mala' },
          ],
        },
      }),
    )!
    expect(p.personas.productor).toEqual([
      { personaId: 'u1', nombre: 'Ximena Rangel' },
      { personaId: null, nombre: 'Invitada Ana' },
    ])
    expect(p.personas.cantantes).toEqual([
      { personaId: 'u4', nombre: 'Lía Soto' },
      { personaId: null, nombre: 'Coro invitado' },
    ])
    expect([p.valores.productor, p.valores.host, p.valores.comunicador, p.valores.cantantes]).toEqual([
      'Ximena Rangel, Invitada Ana',
      '',
      'Tomás Gil',
      'Lía Soto, Coro invitado',
    ])
  })

  it('reads an old Cantantes text as one written name', () => {
    expect(leerPlanHoja(plan('c', '2026-02-01', { campos: { cantantes: 'Ana y Luis' } }))!.personas.cantantes).toEqual([{ personaId: null, nombre: 'Ana y Luis' }])
  })

  it('reads a song list stored as text as it is, and drops rows without id or fecha', () => {
    expect(leerPlanHoja(plan('x', '2026-02-01', { campos: { canciones: 'Gracia sin fin' } }))?.valores.canciones).toBe('Gracia sin fin')
    expect(leerPlanHoja({ fecha: '2026-02-01' })).toBeNull()
    expect(leerPlanesHoja([{ id: 'a' }, PLANES[1], 'x'])).toHaveLength(1)
    expect(leerPlanesHoja(null)).toEqual([])
  })
})

describe('the columns', () => {
  it('Productor, Host, Comunicador and Cantantes take people (S12.4): up to 3, Cantantes up to 8', () => {
    expect(COLUMNAS_HOJA.filter((c) => c.tipo === 'persona').map((c) => c.id)).toEqual(['productor', 'host', 'comunicador', 'cantantes'])
    expect(MAX_PERSONAS).toEqual({ productor: 3, host: 3, comunicador: 3, cantantes: 8 })
  })

  it('are the ten of the artboard, Productor to Notas, mapped to dps_plan_campo', () => {
    expect(COLUMNAS_HOJA.map((c) => [c.id, c.etiqueta])).toEqual([
      ['productor', 'Productor'],
      ['host', 'Host'],
      ['comunicador', 'Comunicador'],
      ['opener', 'Opener'],
      ['anuncios', 'Anuncios'],
      ['cantantes', 'Cantantes'],
      ['canciones', 'Canciones'],
      ['closer', 'Closer'],
      ['historia_vida', 'Historia de vida'],
      ['notas', 'Notas'],
    ])
  })
})

describe('domingosDelAnio and filasHoja', () => {
  it('lists every Sunday of the year', () => {
    const d = domingosDelAnio(2026)
    expect(d).toHaveLength(52)
    expect(d[0]).toBe('2026-01-04')
    expect(d[d.length - 1]).toBe('2026-12-27')
    expect(domingosDelAnio(2028)).toHaveLength(53)
  })

  it('makes one row per Sunday (a plan or none yet) and one per special day, in date order', () => {
    const filas = filasHoja(leerPlanesHoja(PLANES), 2026)
    // 52 Sundays; the free Sunday 27 Dec takes its Sunday's place; one Cena del Señor.
    expect(filas).toHaveLength(53)
    expect(filas.slice(0, 5).map((f) => [f.clase, f.fecha, f.plan?.id ?? null])).toEqual([
      ['domingo', '2026-01-04', 'p1'],
      ['domingo', '2026-01-11', 'p2'],
      ['especial', '2026-01-13', 'cena'],
      ['domingo', '2026-01-18', 'p3'],
      ['domingo', '2026-01-25', null],
    ])
    const ultima = filas[filas.length - 1]
    expect([ultima.clase, ultima.fecha, ultima.plan?.id]).toEqual(['especial', '2026-12-27', 'libre'])
    expect(filas.filter((f) => f.fecha === '2026-12-27')).toHaveLength(1)
    expect(new Set(filas.map((f) => f.clave)).size).toBe(filas.length)
    expect(filas[4].clave).toBe('fecha:2026-01-25')
    expect(filas[0].mes).toBe(0)
  })

  it('leaves out the plans of other years', () => {
    expect(filasHoja(leerPlanesHoja([plan('z', '2027-01-03')]), 2026).some((f) => f.plan?.id === 'z')).toBe(false)
  })
})

describe('semanaSerie', () => {
  it('reads "n/m", or "n" when the series has no length', () => {
    expect(semanaSerie(leerPlanHoja(PLANES[1])!)).toBe('2/2')
    expect(semanaSerie(leerPlanHoja(plan('y', '2026-02-01', { serie: { ...SERIE_A, semanas: null }, semana: 3 }))!)).toBe('3')
    expect(semanaSerie(leerPlanHoja(PLANES[2])!)).toBe('')
  })
})

describe('valorParaRpc', () => {
  it('sends productor, host and comunicador as written text, or null when emptied', () => {
    expect(valorParaRpc('productor', '  Elena Garrido ')).toEqual({ ok: true, valor: { texto: 'Elena Garrido' } })
    expect(valorParaRpc('host', '   ')).toEqual({ ok: true, valor: null })
  })

  it('sends the creative fields as text, or null', () => {
    expect(valorParaRpc('opener', ' Drama corto ')).toEqual({ ok: true, valor: 'Drama corto' })
    expect(valorParaRpc('notas', '')).toEqual({ ok: true, valor: null })
  })

  it('splits the songs by «·» or «;» into a list, or null', () => {
    expect(valorParaRpc('canciones', 'Hogar · Ancla del alma; Tu nombre es fiel')).toEqual({ ok: true, valor: ['Hogar', 'Ancla del alma', 'Tu nombre es fiel'] })
    expect(valorParaRpc('canciones', ' · ')).toEqual({ ok: true, valor: null })
  })

  it('refuses what dps_plan_campo would refuse', () => {
    expect(valorParaRpc('productor', 'x'.repeat(121))).toEqual({ ok: false, mensaje: 'Máximo 120 caracteres.' })
    expect(valorParaRpc('opener', 'x'.repeat(4001))).toEqual({ ok: false, mensaje: 'Máximo 4000 caracteres.' })
    expect(valorParaRpc('canciones', Array.from({ length: 11 }, (_, i) => `C${i}`).join(' · '))).toEqual({ ok: false, mensaje: 'Máximo 10 canciones.' })
    expect(valorParaRpc('canciones', 'x'.repeat(201))).toEqual({ ok: false, mensaje: 'Cada canción, máximo 200 caracteres.' })
  })
})

describe('valorPersonasParaRpc (S12.3, S12.4)', () => {
  const U1 = '11111111-1111-4111-8111-111111111111'
  const U2 = '22222222-2222-4222-8222-222222222222'

  it('sends the people of a cell in order: a persona by id, a written name as text; empty is null', () => {
    expect(
      valorPersonasParaRpc('productor', [
        { personaId: U1, nombre: 'Ximena Rangel' },
        { personaId: null, nombre: '  Invitada Ana ' },
      ]),
    ).toEqual({ ok: true, valor: [{ persona_id: U1 }, { texto: 'Invitada Ana' }] })
    expect(valorPersonasParaRpc('host', [])).toEqual({ ok: true, valor: null })
    expect(valorPersonasParaRpc('host', [{ personaId: null, nombre: '   ' }])).toEqual({ ok: true, valor: null })
  })

  it('keeps a repeated person or name once', () => {
    expect(
      valorPersonasParaRpc('host', [
        { personaId: U1, nombre: 'Ximena Rangel' },
        { personaId: U1, nombre: 'Ximena Rangel' },
        { personaId: null, nombre: 'Pedro' },
        { personaId: null, nombre: 'pedro' },
      ]),
    ).toEqual({ ok: true, valor: [{ persona_id: U1 }, { texto: 'Pedro' }] })
  })

  it('refuses more than 3 people (8 in Cantantes) and long written names, as dps_plan_campo', () => {
    const escritas = (n: number) => Array.from({ length: n }, (_, i) => ({ personaId: null, nombre: `Persona ${i}` }))
    expect(valorPersonasParaRpc('comunicador', escritas(4))).toEqual({ ok: false, mensaje: 'Máximo 3 personas en Comunicador.' })
    expect(valorPersonasParaRpc('cantantes', escritas(8))).toMatchObject({ ok: true })
    expect(valorPersonasParaRpc('cantantes', escritas(9))).toEqual({ ok: false, mensaje: 'Máximo 8 personas en Cantantes.' })
    expect(valorPersonasParaRpc('productor', [{ personaId: null, nombre: 'x'.repeat(121) }])).toEqual({ ok: false, mensaje: 'Máximo 120 caracteres por nombre.' })
    expect(valorPersonasParaRpc('cantantes', [{ personaId: null, nombre: 'x'.repeat(200) }])).toMatchObject({ ok: true })
    expect(valorPersonasParaRpc('productor', [{ personaId: U2, nombre: '' }, { personaId: 'nope', nombre: 'X' }])).toEqual({
      ok: false,
      mensaje: 'Esa persona no es válida. Búscala de nuevo.',
    })
  })
})

describe('resumenHoja and proximoDomingo', () => {
  it('counts Sundays, series, special days and the unassigned productor, host and comunicador from today to the end of the year', () => {
    const filas = filasHoja(leerPlanesHoja(PLANES), 2026)
    // 51 Sundays (the free one is a special day); after 2026-12-01: 6, 13, 20 Dec × 3 empty roles.
    expect(resumenHoja(filas, '2026-12-01', 2026)).toEqual({ domingos: 51, series: 2, especiales: 2, sinAsignar: 9 })
    // Before the year: p1 has productor and host, so 2 + 3 × 50.
    expect(resumenHoja(filas, '2025-06-01', 2026).sinAsignar).toBe(1 + 3 * 50)
    // A past year has nothing left to assign.
    expect(resumenHoja(filas, '2027-02-01', 2026).sinAsignar).toBe(0)
  })

  it('finds the next Sunday after today (today excluded)', () => {
    const filas = filasHoja(leerPlanesHoja(PLANES), 2026)
    expect(proximoDomingo(filas, '2026-01-10')).toBe('p2')
    expect(proximoDomingo(filas, '2026-01-11')).toBe('p3')
    expect(proximoDomingo(filas, '2026-01-18')).toBe('fecha:2026-01-25')
    expect(proximoDomingo(filas, '2026-12-28')).toBeNull()
  })
})

describe('Nueva serie', () => {
  it('lists the Sundays of the series, one week apart', () => {
    expect(domingosSerie('2026-11-29', 3)).toEqual(['2026-11-29', '2026-12-06', '2026-12-13'])
    expect(domingosSerie('2026-11-29', 0)).toEqual([])
  })

  it('says which Sundays another series already holds', () => {
    const planes = leerPlanesHoja(PLANES)
    expect(choquesSerie(planes, '2026-01-11', 2)).toEqual([
      { fecha: '2026-01-11', serie: 'Empezar de nuevo' },
      { fecha: '2026-01-18', serie: 'Vida en comunidad' },
    ])
    expect(choquesSerie(planes, '2026-01-25', 4)).toEqual([])
  })

  it('picks a color different from the series right before and right after', () => {
    const planes = leerPlanesHoja(PLANES)
    // After B (chart-2): the next one in rotation.
    expect(colorNuevaSerie(planes, '2026-01-25', 2)).toBe('chart-3')
    // Between A (chart-1) and B (chart-2), none of them.
    expect(colorNuevaSerie(leerPlanesHoja([PLANES[0], plan('q', '2026-01-25', { serie: { ...SERIE_B, color: 'chart-2' }, semana: 1 })]), '2026-01-11', 2)).toBe('chart-3')
    expect(colorNuevaSerie([], '2026-01-04', 4)).toBe('chart-1')
    expect(colorNuevaSerie(leerPlanesHoja([plan('w', '2026-01-04', { serie: { ...SERIE_A, color: 'chart-5' }, semana: 1 })]), '2026-01-11', 1)).toBe('chart-1')
  })

  it('suggests the Sunday after the last series Sunday of the year, else the next Sunday', () => {
    const planes = leerPlanesHoja(PLANES)
    expect(primerDomingoSugerido(planes, '2026-01-02', 2026)).toBe('2026-01-25')
    expect(primerDomingoSugerido([], '2026-11-04', 2026)).toBe('2026-11-08')
    expect(primerDomingoSugerido([], '2026-11-08', 2026)).toBe('2026-11-08')
    expect(primerDomingoSugerido([], '2026-11-04', 2027)).toBe('2027-01-03')
  })

  it('tells a Sunday', () => {
    expect(esDomingo('2026-11-08')).toBe(true)
    expect(esDomingo('2026-11-09')).toBe(false)
    expect(esDomingo('nada')).toBe(false)
  })
})

describe('mensajeErrorProgramacion', () => {
  it('names the Sunday another series holds', () => {
    expect(mensajeErrorProgramacion({ message: 'domingo_ocupado', details: '2026-11-08' })).toBe(
      'El domingo 8 de noviembre ya es de otra serie. Elige otro primer domingo o menos semanas.',
    )
    expect(mensajeErrorProgramacion({ message: 'domingo_ocupado' })).toBe('Uno de esos domingos ya es de otra serie. Elige otro primer domingo o menos semanas.')
  })

  it('maps the rest of the codes of the sheet and of the new series', () => {
    expect(mensajeErrorProgramacion({ code: '42501', message: 'sin_autoridad' })).toBe('Solo quienes arman el plan pueden cambiar la programación.')
    expect(mensajeErrorProgramacion({ message: 'fecha_invalida' })).toBe('El primer domingo tiene que caer en domingo.')
    expect(mensajeErrorProgramacion({ message: 'nombre_invalido' })).toBe('Escribe el nombre de la serie (máximo 120 caracteres).')
    expect(mensajeErrorProgramacion({ message: 'semanas_invalidas' })).toBe('Las semanas van de 1 a 52.')
    expect(mensajeErrorProgramacion({ message: 'valor_invalido' })).toBe('Ese valor es muy largo o no es válido.')
    expect(mensajeErrorProgramacion({ message: 'persona_o_texto' })).toBe('Ese valor es muy largo o no es válido.')
    expect(mensajeErrorProgramacion({ message: 'plan_invalido' })).toBe('Ese plan ya no existe. Actualiza la página.')
    expect(mensajeErrorProgramacion({ message: 'boom' })).toBe('No se pudo guardar la programación. Intenta de nuevo.')
  })

  it('explains the lists and the limits of a cell (S12.3, S12.4)', () => {
    expect(mensajeErrorProgramacion({ message: 'persona_fuera_de_lista' })).toBe(
      'Esa persona no está en la lista de esta columna. Revisa Configuración › Listas o escribe su nombre sin cuenta.',
    )
    expect(mensajeErrorProgramacion({ message: 'demasiadas_personas' })).toBe('Son demasiadas personas para esta celda: hasta 3, y hasta 8 en Cantantes.')
  })

  it('says a picked person is gone and maps the search errors (S11)', () => {
    expect(mensajeErrorProgramacion({ message: 'persona_invalida' })).toBe('Esa persona ya no está en la plataforma. Búscala de nuevo.')
    expect(mensajeErrorProgramacion({ message: 'busqueda_invalida' })).toBe('La búsqueda es muy larga (máximo 100 caracteres).')
  })
})
