/**
 * DPS attendance sheet rules (odd/tasks/dps-asistencia-pco.md, T9; S6.1,
 * S7.4): reading dps_planes_rango and dps_asistencia_planilla, picking the
 * plan of the window, the counts (one person once, whatever their puestos),
 * the Por llegar / Llegaron / Todos filter and the optimistic changes. Every
 * person is fictitious.
 */
import {
  agregarLlegada,
  aplicarEstados,
  contarEquipo,
  deshacerAgregar,
  elegirPlan,
  horariosTexto,
  leerPlanes,
  leerPlanilla,
  pendientesEquipo,
  tituloPlan,
  totalesPlanilla,
  visibleEnFiltro,
  type PlanillaDps,
} from '@/lib/platform/dps/planilla'

const planJson = (parche: Record<string, unknown>) => ({
  id: 'p',
  fecha: '2026-11-08',
  tipo: 'domingo',
  titulo: null,
  semana: 3,
  serie: { id: 's1', nombre: 'Tu casa tiene influencers', color: 'chart-1' },
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  ...parche,
})

const PLANILLA_JSON = {
  plan_id: 'p1',
  fecha: '2026-11-08',
  tipo: 'domingo',
  titulo: null,
  hoy: '2026-11-08',
  editable: true,
  equipos: [
    {
      equipo_id: 'audio',
      equipo: 'Audio',
      ruta: 'DPS › Producción Técnica › Audio',
      llegaron: 1,
      por_llegar: 1,
      aviso: 1,
      personas: [
        { persona_id: 'ana', nombre: 'Ana', apellido: 'Rivas', iniciales: 'AR', convocado: true, estado: 'llego', puestos: [{ puesto_id: 'x', nombre: 'Audio FOH' }], otros_puestos: [] },
        { persona_id: 'bruno', nombre: 'Bruno', apellido: 'Díaz', iniciales: 'BD', convocado: true, estado: null, puestos: [{ puesto_id: 'y', nombre: 'Monitores' }], otros_puestos: ['Cámara 1'] },
        { persona_id: 'carla', nombre: 'Carla', apellido: 'Paz', iniciales: 'CP', convocado: true, estado: 'aviso_no_viene', puestos: [{ puesto_id: 'z', nombre: 'Streaming' }], otros_puestos: [] },
      ],
      otros: [{ persona_id: 'diego', nombre: 'Diego', apellido: 'Luna', iniciales: 'DL' }],
    },
    {
      equipo_id: 'video',
      equipo: 'Video',
      ruta: 'DPS › Producción Técnica › Video',
      personas: [
        { persona_id: 'bruno', nombre: 'Bruno', apellido: 'Díaz', iniciales: 'BD', convocado: true, estado: null, puestos: [{ puesto_id: 'w', nombre: 'Cámara 1' }], otros_puestos: ['Monitores'] },
        { persona_id: 'elena', nombre: 'Elena', apellido: 'Mora', iniciales: 'EM', convocado: false, estado: 'llego', puestos: [], otros_puestos: [] },
      ],
      otros: [{ persona_id: 'diego', nombre: 'Diego', apellido: 'Luna', iniciales: 'DL' }],
    },
  ],
  totales: { convocados: 3, llegaron: 2, por_llegar: 1, aviso: 1, sin_convocar: 1 },
}

const planilla = (): PlanillaDps => leerPlanilla(PLANILLA_JSON)

describe('leerPlanes', () => {
  it('reads the plans of the range and drops malformed rows', () => {
    const planes = leerPlanes([planJson({ id: 'p1' }), null, { id: 3 }, planJson({ id: 'p2', tipo: 'cena_del_senor', fecha: '2026-11-10', serie: null, titulo: 'Cena' })])
    expect(planes.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(planes[0]).toEqual({
      id: 'p1',
      fecha: '2026-11-08',
      tipo: 'domingo',
      titulo: null,
      semana: 3,
      serie: { nombre: 'Tu casa tiene influencers', color: 'chart-1' },
      horarios: ['09:15', '11:15'],
      llegada: '07:00',
    })
    expect(leerPlanes(null)).toEqual([])
  })
})

describe('elegirPlan', () => {
  const planes = leerPlanes([
    planJson({ id: 'viejo', fecha: '2026-10-25' }),
    planJson({ id: 'martes', fecha: '2026-11-03', tipo: 'cena_del_senor', serie: null }),
    planJson({ id: 'domingo', fecha: '2026-11-01' }),
  ])

  it('takes the plan of the URL when it is in the window', () => {
    expect(elegirPlan(planes, '2026-11-05', 'viejo')?.id).toBe('viejo')
  })

  it('falls back to the most recent plan when the URL plan is not in the window', () => {
    expect(elegirPlan(planes, '2026-11-05', 'otro')?.id).toBe('martes')
    expect(elegirPlan(planes, '2026-11-05', null)?.id).toBe('martes')
  })

  it("prefers today's plan, and the Sunday one when today has several", () => {
    const hoy = leerPlanes([
      planJson({ id: 'especial', fecha: '2026-11-08', tipo: 'especial', titulo: 'Bautizos', serie: null }),
      planJson({ id: 'dom', fecha: '2026-11-08' }),
      planJson({ id: 'antes', fecha: '2026-11-01' }),
    ])
    expect(elegirPlan(hoy, '2026-11-08', null)?.id).toBe('dom')
  })

  it('never picks a future plan and is null without plans', () => {
    const futuros = leerPlanes([planJson({ id: 'futuro', fecha: '2026-11-15' })])
    expect(elegirPlan(futuros, '2026-11-08', null)).toBeNull()
    expect(elegirPlan([], '2026-11-08', null)).toBeNull()
  })
})

describe('tituloPlan and horariosTexto', () => {
  it('names the plan by its title, its series week or its tipo', () => {
    const [conSerie, conTitulo, solo] = leerPlanes([
      planJson({}),
      planJson({ titulo: 'Bautizos', tipo: 'especial', serie: null }),
      planJson({ tipo: 'cena_del_senor', serie: null, semana: null }),
    ])
    expect(tituloPlan(conSerie)).toBe('Tu casa tiene influencers · Semana 3')
    expect(tituloPlan(conTitulo)).toBe('Bautizos')
    expect(tituloPlan(solo)).toBe('Cena del Señor')
  })

  it('reads the times as the summary does', () => {
    expect(horariosTexto(['09:15', '11:15'])).toBe('9:15 y 11:15')
    expect(horariosTexto(['08:00', '09:15', '18:45'])).toBe('8:00, 9:15 y 18:45')
    expect(horariosTexto(['09:15'])).toBe('9:15')
    expect(horariosTexto([])).toBe('')
  })
})

describe('leerPlanilla and the counts', () => {
  it('reads the sheet with one row per person and team', () => {
    const p = planilla()
    expect(p.planId).toBe('p1')
    expect(p.editable).toBe(true)
    expect(p.equipos.map((e) => e.equipo)).toEqual(['Audio', 'Video'])
    expect(p.equipos[0].personas[1]).toEqual({
      personaId: 'bruno',
      nombre: 'Bruno',
      apellido: 'Díaz',
      iniciales: 'BD',
      convocado: true,
      estado: null,
      puestos: ['Monitores'],
      otrosPuestos: ['Cámara 1'],
    })
    expect(p.equipos[0].otros).toEqual([{ personaId: 'diego', nombre: 'Diego', apellido: 'Luna', iniciales: 'DL' }])
  })

  it('counts each person once across teams', () => {
    expect(totalesPlanilla(planilla())).toEqual({ total: 4, llegaron: 2, porLlegar: 1, avisos: 1, sinConvocar: 1 })
  })

  it('counts a team: arrived of everyone in it, and who is still expected', () => {
    const [audio, video] = planilla().equipos
    expect(contarEquipo(audio)).toEqual({ llegaron: 1, total: 3, porLlegar: 1 })
    expect(contarEquipo(video)).toEqual({ llegaron: 1, total: 2, porLlegar: 1 })
  })

  it('filters Por llegar (convocados without a mark), Llegaron and Todos', () => {
    const [ana, bruno, carla] = planilla().equipos[0].personas
    const elena = planilla().equipos[1].personas[1]
    expect([ana, bruno, carla, elena].map((x) => visibleEnFiltro(x, 'por_llegar'))).toEqual([false, true, false, false])
    expect([ana, bruno, carla, elena].map((x) => visibleEnFiltro(x, 'llegaron'))).toEqual([true, false, false, true])
    expect([ana, bruno, carla, elena].every((x) => visibleEnFiltro(x, 'todos'))).toBe(true)
  })

  it('lists who "Marcar todo el equipo" marks: convocados without a mark', () => {
    expect(pendientesEquipo(planilla().equipos[0]).map((x) => x.personaId)).toEqual(['bruno'])
  })
})

describe('optimistic changes', () => {
  it('applies a mark to the person in every team', () => {
    const p = aplicarEstados(planilla(), new Map([['bruno', 'llego' as const]]))
    expect(p.equipos.map((e) => e.personas.find((x) => x.personaId === 'bruno')?.estado)).toEqual(['llego', 'llego'])
    expect(totalesPlanilla(p).llegaron).toBe(3)
    // The input is not mutated.
    expect(planilla().equipos[0].personas[1].estado).toBeNull()
  })

  it('adds someone who came without being convocado as arrived, and undoes it', () => {
    const antes = planilla()
    const p = agregarLlegada(antes, 'video', antes.equipos[1].otros[0])
    const fila = p.equipos[1].personas.find((x) => x.personaId === 'diego')
    expect(fila).toMatchObject({ convocado: false, estado: 'llego', puestos: [] })
    expect(p.equipos.every((e) => e.otros.length === 0)).toBe(true)
    expect(totalesPlanilla(p)).toMatchObject({ total: 5, llegaron: 3, sinConvocar: 2 })

    const deshecho = deshacerAgregar(p, 'diego', antes)
    expect(deshecho.equipos[1].personas.some((x) => x.personaId === 'diego')).toBe(false)
    expect(deshecho.equipos.map((e) => e.otros.map((o) => o.personaId))).toEqual([['diego'], ['diego']])
  })
})
