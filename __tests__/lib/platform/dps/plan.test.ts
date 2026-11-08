/**
 * The pure rules of /dps/plan, Plan del domingo · Equipos
 * (odd/tasks/dps-asistencia-pco.md, T10; S6.2, S6.4, S6.5, S7.1, S7.4):
 * the header title per tipo, the date pill and its previous / next plan,
 * the cover URL, the team columns read from dps_plan_equipos with their
 * "Falta" counts, the optimistic convocar / quitar, the candidates of
 * dps_candidatos_puesto with the "Ya sirve ese día en …" flag and the copy
 * result sentence.
 */
import {
  avisoCandidato,
  contarEquipoPlan,
  convocarEnPlan,
  elegirProximoPlan,
  etiquetaFechaPlan,
  faltaPuesto,
  fechaHablada,
  leerCandidatos,
  leerEquiposPlan,
  leerPlanCabecera,
  leerPlanesCabecera,
  lineaEquipo,
  metaHorarios,
  quitarDePlan,
  textoCopia,
  tituloCabecera,
  totalesPlan,
  urlPortada,
  vecinosPlan,
  type PlanCabecera,
} from '@/lib/platform/dps/plan'

const planJson = (parche: Record<string, unknown> = {}) => ({
  id: 'p1',
  fecha: '2026-11-08',
  tipo: 'domingo',
  titulo: null,
  semana: 3,
  serie: { id: 's1', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: 's1/123.png', semanas: 4 },
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  ...parche,
})

const plan = (parche: Record<string, unknown> = {}): PlanCabecera => leerPlanCabecera(planJson(parche))!

describe('leerPlanCabecera', () => {
  it('reads a plan of dps_plan_json with its series', () => {
    expect(plan()).toEqual({
      id: 'p1',
      fecha: '2026-11-08',
      tipo: 'domingo',
      titulo: null,
      semana: 3,
      serie: { id: 's1', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagenPath: 's1/123.png', semanas: 4 },
      horarios: ['09:15', '11:15'],
      llegada: '07:00',
    })
  })

  it('is null without an id or a fecha, and tolerates a plan without a series', () => {
    expect(leerPlanCabecera({ fecha: '2026-11-08' })).toBeNull()
    expect(leerPlanCabecera(null)).toBeNull()
    expect(plan({ serie: null, semana: null }).serie).toBeNull()
  })
})

describe('tituloCabecera', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['a series Sunday', {}, 'Tu casa tiene influencers · Semana 3 de 4'],
    ['a series Sunday without a week', { semana: null }, 'Tu casa tiene influencers'],
    ['a plan with its own title', { serie: null, titulo: 'Bautizos' }, 'Bautizos'],
    ['a Cena del Señor', { serie: null, tipo: 'cena_del_senor' }, 'Cena del Señor'],
    ['a Noche de adoración', { serie: null, tipo: 'noche_adoracion' }, 'Noche de adoración'],
    ['a special service', { serie: null, tipo: 'especial' }, 'Servicio especial'],
    ['a free Sunday', { serie: null, tipo: 'libre' }, 'Domingo libre'],
    ['a Sunday without series nor title', { serie: null }, 'Domingo'],
  ])('titles %s', (_caso, parche, esperado) => {
    expect(tituloCabecera(plan(parche))).toBe(esperado)
  })
})

describe('dates and times', () => {
  it('labels the date pill and speaks the date', () => {
    expect(etiquetaFechaPlan('2026-11-08')).toBe('Domingo 8 nov 2026')
    expect(etiquetaFechaPlan('2026-12-01')).toBe('Martes 1 dic 2026')
    expect(fechaHablada('2026-11-01')).toBe('domingo 1 de noviembre')
  })

  it('gives the horarios and the arrival', () => {
    expect(metaHorarios(plan())).toBe('9:15 y 11:15 · llegada 7:00')
    expect(metaHorarios(plan({ horarios: ['18:45'], llegada: '17:30' }))).toBe('18:45 · llegada 17:30')
  })
})

describe('the plan of the screen and its neighbours', () => {
  const planes = leerPlanesCabecera([
    planJson({ id: 'cena', fecha: '2026-11-03', tipo: 'cena_del_senor', serie: null }),
    planJson({ id: 'd15', fecha: '2026-11-15' }),
    planJson({ id: 'esp8', fecha: '2026-11-08', tipo: 'especial', titulo: 'Bautizos', serie: null }),
    planJson({ id: 'd8', fecha: '2026-11-08' }),
    planJson({ id: 'd1', fecha: '2026-11-01' }),
  ])

  it('orders by date with the Sunday plan first on its date', () => {
    expect(planes.map((p) => p.id)).toEqual(['d1', 'cena', 'd8', 'esp8', 'd15'])
  })

  it('opens the next plan from today, else the most recent one', () => {
    expect(elegirProximoPlan(planes, '2026-11-04')?.id).toBe('d8')
    expect(elegirProximoPlan(planes, '2026-11-08')?.id).toBe('d8')
    expect(elegirProximoPlan(planes, '2026-12-01')?.id).toBe('d15')
    expect(elegirProximoPlan([], '2026-11-08')).toBeNull()
  })

  it('steps to the previous and the next plan, whatever their tipo', () => {
    expect(vecinosPlan(planes, 'd8')).toMatchObject({ anterior: { id: 'cena' }, siguiente: { id: 'esp8' } })
    expect(vecinosPlan(planes, 'd1')).toMatchObject({ anterior: null, siguiente: { id: 'cena' } })
    expect(vecinosPlan(planes, 'd15')).toMatchObject({ anterior: { id: 'esp8' }, siguiente: null })
    expect(vecinosPlan(planes, 'otro')).toEqual({ anterior: null, siguiente: null })
  })
})

describe('urlPortada', () => {
  it('is the public URL of the dps-series bucket, or null', () => {
    expect(urlPortada('s1/123.png', 'https://x.supabase.co/')).toBe('https://x.supabase.co/storage/v1/object/public/dps-series/s1/123.png')
    expect(urlPortada(null, 'https://x.supabase.co')).toBeNull()
    expect(urlPortada('s1/a.png', undefined)).toBeNull()
  })
})

const convocado = (id: string, nombre: string) => ({ convocado_id: `c-${id}`, persona_id: id, servicio_id: `sv-${id}`, nombre, iniciales: 'XX' })

const EQUIPOS_JSON = {
  plan_id: 'p1',
  puede_editar: true,
  convocados: 3,
  falta: 3,
  equipos: [
    {
      equipo_id: 'audio',
      equipo: 'Audio',
      ruta: 'dps/audio',
      profundidad: 1,
      convocados: 2,
      falta: 1,
      puestos: [
        { puesto_id: 'foh', nombre: 'Audio FOH', cantidad: 1, orden: 1, activo: true, convocados: [convocado('rc', 'Rubén Carvajal')], falta: 0 },
        { puesto_id: 'mon', nombre: 'Monitores', cantidad: 2, orden: 2, activo: true, convocados: [convocado('li', 'Lorena Ibarra')], falta: 1 },
      ],
    },
    {
      equipo_id: 'video',
      equipo: 'Video',
      ruta: 'dps/video',
      profundidad: 1,
      convocados: 1,
      falta: 2,
      puestos: [
        { puesto_id: 'cam1', nombre: 'Cámara 1', cantidad: 1, orden: 1, activo: true, convocados: [convocado('rc', 'Rubén Carvajal')], falta: 0 },
        { puesto_id: 'pant', nombre: 'Pantallas', cantidad: 2, orden: 2, activo: true, convocados: [], falta: 2 },
        { puesto_id: 'viejo', nombre: 'Proyector', cantidad: 3, orden: 3, activo: false, convocados: [convocado('gp', 'Gisela Ponce')], falta: 2 },
      ],
    },
  ],
}

describe('leerEquiposPlan and the counts', () => {
  const eq = leerEquiposPlan(EQUIPOS_JSON)

  it('reads the teams, puestos and convocados', () => {
    expect(eq.planId).toBe('p1')
    expect(eq.puedeEditar).toBe(true)
    expect(eq.equipos.map((e) => e.equipo)).toEqual(['Audio', 'Video'])
    expect(eq.equipos[0].puestos[1]).toEqual({
      puestoId: 'mon',
      nombre: 'Monitores',
      cantidad: 2,
      activo: true,
      convocados: [{ convocadoId: 'c-li', personaId: 'li', servicioId: 'sv-li', nombre: 'Lorena Ibarra' }],
    })
    expect(leerEquiposPlan(null)).toEqual({ planId: '', puedeEditar: false, equipos: [] })
  })

  it('counts what is missing per puesto: never below zero, none for a deactivated puesto', () => {
    const [audio, video] = eq.equipos
    expect(audio.puestos.map(faltaPuesto)).toEqual([0, 1])
    expect(video.puestos.map(faltaPuesto)).toEqual([0, 2, 0])
    expect(faltaPuesto({ ...audio.puestos[0], convocados: [...audio.puestos[0].convocados, ...audio.puestos[1].convocados] })).toBe(0)
  })

  it('counts each person once per team and over the plan', () => {
    expect(eq.equipos.map(contarEquipoPlan)).toEqual([
      { convocados: 2, falta: 1 },
      { convocados: 2, falta: 2 },
    ])
    expect(totalesPlan(eq)).toEqual({ convocados: 3, equipos: 2, falta: 3 })
  })

  it('writes the team line', () => {
    expect(lineaEquipo({ convocados: 2, falta: 1 })).toBe('2 convocados · 1 falta')
    expect(lineaEquipo({ convocados: 1, falta: 3 })).toBe('1 convocado · 3 faltan')
    expect(lineaEquipo({ convocados: 4, falta: 0 })).toBe('4 convocados · completo')
  })
})

describe('convocarEnPlan / quitarDePlan', () => {
  const eq = leerEquiposPlan(EQUIPOS_JSON)
  const nuevo = { convocadoId: 'tmp', personaId: 'ab', servicioId: 'sv-ab', nombre: 'Adriana Bello' }

  it('adds the person to the puesto, in name order, once', () => {
    const despues = convocarEnPlan(eq, 'mon', nuevo)
    expect(despues.equipos[0].puestos[1].convocados.map((c) => c.nombre)).toEqual(['Adriana Bello', 'Lorena Ibarra'])
    expect(faltaPuesto(despues.equipos[0].puestos[1])).toBe(0)
    expect(convocarEnPlan(despues, 'mon', nuevo)).toBe(despues)
    expect(eq.equipos[0].puestos[1].convocados).toHaveLength(1)
  })

  it('removes the person from that puesto only', () => {
    const despues = quitarDePlan(eq, 'foh', 'rc')
    expect(despues.equipos[0].puestos[0].convocados).toEqual([])
    expect(despues.equipos[1].puestos[0].convocados.map((c) => c.personaId)).toEqual(['rc'])
    expect(totalesPlan(despues)).toEqual({ convocados: 3, equipos: 2, falta: 4 })
  })
})

const candidato = (id: string, parche: Record<string, unknown> = {}) => ({
  servicio_id: `sv-${id}`,
  persona_id: id,
  nombre: 'Irene',
  apellido: 'Saavedra',
  iniciales: 'IS',
  equipo_id: 'video',
  equipo: 'Video',
  rol: 'Servidor',
  ya_convocado_en_plan: false,
  en_este_puesto: false,
  puestos_del_dia: [],
  ...parche,
})

describe('leerCandidatos / avisoCandidato', () => {
  it('reads the candidates with the people not convocado in the plan first', () => {
    const lista = leerCandidatos([
      candidato('a', { ya_convocado_en_plan: true, nombre: 'Ana' }),
      candidato('b', { nombre: 'Beto' }),
      { persona_id: 'sin-servicio' },
    ])
    expect(lista.map((c) => c.personaId)).toEqual(['b', 'a'])
    expect(lista[0]).toMatchObject({ servicioId: 'sv-b', nombre: 'Beto', apellido: 'Saavedra', equipo: 'Video', rol: 'Servidor' })
  })

  it('flags who already serves that day, and who is already in this puesto', () => {
    const [enOtro, aqui, libre, otroPlan] = leerCandidatos([
      candidato('a', {
        ya_convocado_en_plan: true,
        puestos_del_dia: [{ plan_id: 'p1', mismo_plan: true, tipo: 'domingo', puesto_id: 'cam1', puesto: 'Cámara 1', equipo: 'Video' }],
      }),
      candidato('b', {
        ya_convocado_en_plan: true,
        en_este_puesto: true,
        puestos_del_dia: [{ plan_id: 'p1', mismo_plan: true, tipo: 'domingo', puesto_id: 'mon', puesto: 'Monitores', equipo: 'Audio' }],
      }),
      candidato('c'),
      candidato('d', {
        puestos_del_dia: [
          { plan_id: 'p9', mismo_plan: false, tipo: 'especial', puesto_id: 'foh', puesto: 'Audio FOH', equipo: 'Audio' },
          { plan_id: 'p9', mismo_plan: false, tipo: 'especial', puesto_id: 'cam1', puesto: 'Cámara 1', equipo: 'Video' },
        ],
      }),
    ]).sort((x, y) => x.personaId.localeCompare(y.personaId))
    expect(avisoCandidato(enOtro, 'mon')).toBe('Ya sirve ese día en Cámara 1')
    expect(avisoCandidato(aqui, 'mon')).toBe('Ya está en este puesto')
    expect(avisoCandidato(libre, 'mon')).toBeNull()
    expect(avisoCandidato(otroPlan, 'mon')).toBe('Ya sirve ese día en Audio FOH, Cámara 1')
  })
})

describe('textoCopia', () => {
  it('says how many were copied and why some were skipped', () => {
    expect(textoCopia({ copiados: 12, omitidos: 2 })).toBe('Se copiaron 12 (2 omitidos: servicio inactivo o puesto desactivado)')
    expect(textoCopia({ copiados: 12, omitidos: 1 })).toBe('Se copiaron 12 (1 omitido: servicio inactivo o puesto desactivado)')
    expect(textoCopia({ copiados: 12, omitidos: 0 })).toBe('Se copiaron 12')
    expect(textoCopia({ copiados: 1, omitidos: 0 })).toBe('Se copió 1')
    expect(textoCopia({ copiados: 0, omitidos: 0 })).toBe('El plan anterior no tiene convocados para copiar')
  })
})
