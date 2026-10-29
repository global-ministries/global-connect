/**
 * Mi equipo v2 (S11 of odd/tasks/sistema-diseno-v2.md): the attention metrics
 * (Sirviendo, Por activar, Sin cuenta, Sin turno) act as filters, edad and
 * turno live in the filter sheet, the search also matches phones, the tree is
 * walked by level with breadcrumbs (no "Toda la dirección" card), and the
 * list can show one row per person or one per servicio.
 */
import {
  FILTROS_MI_EQUIPO,
  LIMPIAR_FILTROS_MI_EQUIPO,
  calcularVistaMiEquipo,
  parcheAtencionMiEquipo,
  type FiltrosMiEquipo,
} from '@/lib/platform/dream-team/mi-equipo-filtros'
import { vistaDeDireccion, type PersonaEntrada, type PersonasPorEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { SIN_TURNO } from '@/lib/platform/dream-team/turnos'
import { personaId } from '@/lib/platform/dream-team/types'
import {
  ID_CONEXION,
  ID_DHAH,
  ID_MDH,
  ID_PAREJAS,
  ID_PDP,
  arbolConexion,
  persona,
  personasPorEquipoConexion,
} from '@/tests/helpers/mi-equipo-conexion'

function nodo(id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> {
  return {
    equipo: { origen: 'dream_team', id, label, experiencia: 'talleres_crecimiento', activo: true, responsables: [] },
    hijos,
    nivel,
  }
}

// Niños → Waumbaland (people of its own) → Anfitriones, Atención al Voluntario → Recepción, Seguimiento;
// Niños → Upstreet → Anfitriones.
const arbolNinos: readonly NodoArbol<NodoEquipoArbol>[] = [
  nodo('ninos', 'Dirección de Niños', [
    nodo('wau', 'Waumbaland', [
      nodo('wau-anf', 'Anfitriones', [], 2),
      nodo('wau-atv', 'Atención al Voluntario', [nodo('wau-rec', 'Recepción', [], 3), nodo('wau-seg', 'Seguimiento', [], 3)], 2),
    ], 1),
    nodo('ups', 'Upstreet', [nodo('ups-anf', 'Anfitriones', [], 2)], 1),
  ]),
]

const con = (base: PersonaEntrada, extra: Partial<PersonaEntrada>): PersonaEntrada => ({ ...base, ...extra })

// Nina: director with an account and a shift. Wanda: coordinator, also serving in Upstreet.
// Walter: en orientación, no account. Sara: postulada, no shift. Ana: no account, phone +58.
// Gina: a Grupos de Vida leader without shift (never "sin turno").
const personasNinos: PersonasPorEquipo = {
  ninos: [con(persona('n1', 'Nina Directora', 'Director'), { tieneCuenta: true, telefono: '0424 101 2020', turnoIds: ['t9'], rangoEdad: '26_mas' })],
  wau: [
    con(persona('w1', 'Wanda Coordinadora', 'Coordinador'), { tieneCuenta: true, telefono: '0414 818 3311', turnoIds: ['t11'], rangoEdad: '26_mas' }),
    con(persona('w2', 'Walter Facilitador', 'Facilitador', 'en_orientacion'), { tieneCuenta: false, turnoIds: ['t9'], rangoEdad: '18_25' }),
  ],
  'wau-anf': [
    con(persona('wa1', 'Ana Anfitriona', 'Facilitador'), { tieneCuenta: false, telefono: '+58 412 777 1212', turnoIds: ['t9'], rangoEdad: '12_17' }),
  ],
  'wau-rec': [con(persona('r1', 'Rita Recepción', 'Coordinador'), { tieneCuenta: true, turnoIds: ['t11'], rangoEdad: '26_mas' })],
  'wau-seg': [con(persona('s1', 'Sara Seguimiento', 'Facilitador', 'postulado'), { tieneCuenta: true, rangoEdad: '18_25' })],
  'ups-anf': [
    // Wanda serves here too: the same person, a second servicio.
    con(persona('w1b', 'Wanda Coordinadora', 'Facilitador'), { personaId: personaId('persona-w1'), tieneCuenta: true, turnoIds: ['t9'] }),
    {
      clave: 'gdv:g1',
      personaId: personaId('persona-g1'),
      nombre: 'Gina Grupos',
      rolClave: 'lider',
      rolLabel: 'Líder',
      estado: 'activo',
      origen: 'grupos_vida',
      tieneCuenta: true,
    },
  ],
}

function vistaNinos() {
  const vista = vistaDeDireccion(arbolNinos, personasNinos, 'ninos')
  if (!vista) throw new Error('Niños must resolve')
  return vista
}

function vistaConexion() {
  const vista = vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION)
  if (!vista) throw new Error('Conexión must resolve')
  return vista
}

const TURNOS = [
  { id: 't9', label: 'Domingo 9:00' },
  { id: 't11', label: 'Domingo 11:00' },
]

function ninos(filtros: Partial<FiltrosMiEquipo> = {}) {
  return calcularVistaMiEquipo({ vista: vistaNinos(), filtros: { ...FILTROS_MI_EQUIPO, ...filtros }, turnos: TURNOS })
}

const nombres = (items: readonly { readonly nombre: string }[]): string[] => items.map((item) => item.nombre)

describe('attention metrics of the current scope', () => {
  it('counts distinct people: Sirviendo, Por activar, Sin cuenta and Sin turno, over the people in scope', () => {
    const { atencion } = ninos()
    expect(atencion.total).toBe(7)
    expect(atencion.sirviendo).toEqual({ personas: 5, activo: false })
    expect(atencion.porActivar).toEqual({ personas: 2, activo: false })
    expect(atencion.sinCuenta).toEqual({ personas: 2, activo: false })
    // Sara has no shift; Gina (Grupos de Vida) never counts as "sin turno".
    expect(atencion.sinTurno).toEqual({ personas: 1, activo: false })
  })

  it('follows the scope: inside Waumbaland only its branch counts', () => {
    const { atencion } = ninos({ nivel: 'wau' })
    expect(atencion.total).toBe(5)
    expect(atencion.sirviendo.personas).toBe(3)
    expect(atencion.porActivar.personas).toBe(2)
  })

  it('each metric is a toggle filter; pressing an active one removes it', () => {
    expect(parcheAtencionMiEquipo(FILTROS_MI_EQUIPO, 'sirviendo')).toEqual({ etapa: 'activo' })
    expect(parcheAtencionMiEquipo({ ...FILTROS_MI_EQUIPO, etapa: 'activo' }, 'sirviendo')).toEqual({ etapa: null })
    expect(parcheAtencionMiEquipo(FILTROS_MI_EQUIPO, 'porActivar')).toEqual({ porActivar: true })
    expect(parcheAtencionMiEquipo({ ...FILTROS_MI_EQUIPO, sinCuenta: true }, 'sinCuenta')).toEqual({ sinCuenta: false })
    expect(parcheAtencionMiEquipo(FILTROS_MI_EQUIPO, 'sinTurno')).toEqual({ sinTurno: true })
  })

  it('a pressed metric filters the list and shows as pressed', () => {
    const porActivar = ninos({ porActivar: true })
    expect(porActivar.atencion.porActivar.activo).toBe(true)
    expect(nombres(porActivar.personas)).toEqual(['Sara Seguimiento', 'Walter Facilitador'])

    expect(nombres(ninos({ sinCuenta: true }).personas)).toEqual(['Ana Anfitriona', 'Walter Facilitador'])
    expect(nombres(ninos({ sinTurno: true }).personas)).toEqual(['Sara Seguimiento'])
    expect(ninos({ etapa: 'activo' }).atencion.sirviendo.activo).toBe(true)
  })

  it('a metric counts under every filter but its own, so it says what tapping it would list', () => {
    const conPorActivar = ninos({ porActivar: true })
    expect(conPorActivar.atencion.porActivar.personas).toBe(2)
    // Of the two people por activar, Walter has no account.
    expect(conPorActivar.atencion.sinCuenta.personas).toBe(1)
  })
})

describe('filters: etapa, edad, turno', () => {
  it('etapa keeps the servicios in that etapa; its counters ignore the etapa filter', () => {
    const vista = ninos({ etapa: 'postulado' })
    expect(nombres(vista.personas)).toEqual(['Sara Seguimiento'])
    expect(vista.contadoresEtapa.todos).toBe(8)
    expect(vista.contadoresEtapa.postulado).toBe(1)
    expect(vista.contadoresEtapa.activo).toBe(6)
  })

  it('offers the etapa pills as today: Activo, En orientación and En pausa always, the rest only with servicios or selected', () => {
    expect(ninos().pastillasEtapa.map((p) => [p.valor, p.cantidad])).toEqual([
      ['todos', 8],
      ['postulado', 1],
      ['en_orientacion', 1],
      ['activo', 6],
      ['en_pausa', 0],
    ])
    expect(ninos({ etapa: 'retirado' }).pastillasEtapa.map((p) => p.valor)).toContain('retirado')
  })

  it('edad keeps people in that range; its counters (distinct people) ignore the edad filter', () => {
    const vista = ninos({ edad: '18_25' })
    expect(nombres(vista.personas)).toEqual(['Sara Seguimiento', 'Walter Facilitador'])
    expect(vista.contadoresEdad).toEqual({ menor_12: 0, '12_17': 1, '18_25': 2, '26_mas': 3, sin_fecha: 0 })
  })

  it('hides the edad counters when nobody in scope has a known range', () => {
    expect(calcularVistaMiEquipo({ vista: vistaConexion(), filtros: FILTROS_MI_EQUIPO }).contadoresEdad).toBeNull()
  })

  it('turno keeps the Dream Team servicios on that shift', () => {
    expect(nombres(ninos({ turno: 't11' }).personas)).toEqual(['Rita Recepción', 'Wanda Coordinadora'])
  })
})

describe('search by name or phone', () => {
  it('matches names without accents or case', () => {
    expect(nombres(ninos({ q: 'recepcion' }).personas)).toEqual(['Rita Recepción'])
  })

  it('matches phone digits, whatever the spacing or the +58 prefix', () => {
    expect(nombres(ninos({ q: '0414 818' }).personas)).toEqual(['Wanda Coordinadora'])
    expect(nombres(ninos({ q: '04127771212' }).personas)).toEqual(['Ana Anfitriona'])
    expect(nombres(ninos({ q: '58424101' }).personas)).toEqual(['Nina Directora'])
  })

  it('never matches phones for a query that is not made of phone characters', () => {
    expect(ninos({ q: 'Ana 0412' }).personas).toEqual([])
  })
})

describe('tree navigation by level', () => {
  it('at the dirección: the cards are its next level, without a "Toda la dirección" card; a lone área is skipped', () => {
    const vista = calcularVistaMiEquipo({ vista: vistaConexion(), filtros: FILTROS_MI_EQUIPO })
    expect(vista.tarjetas.map((t) => t.id)).toEqual([ID_DHAH, ID_MDH, ID_PAREJAS, ID_PDP])
    expect(vista.navegacion.migas.map((m) => m.etiqueta)).toEqual(['Dirección de Conexión'])
    expect(vista.navegacion.padre).toBeNull()
    expect(vista.navegacion.titulo).toBe('Dirección de Conexión')
    expect(vista.navegacion.responsable).toBe('Dirige Antholy Ludovic Gómez')
    expect(vista.navegacion.responsableCorto).toBe('Dirige Antholy Gómez')
    expect(vista.navegacion.personas).toBe(38)
  })

  it('an equipo is a leaf: no cards, crumbs back to the dirección (the skipped área is not a crumb)', () => {
    const vista = calcularVistaMiEquipo({ vista: vistaConexion(), filtros: { ...FILTROS_MI_EQUIPO, nivel: ID_DHAH } })
    expect(vista.tarjetas).toEqual([])
    expect(vista.navegacion.migas.map((m) => [m.etiqueta, m.parche])).toEqual([
      ['Dirección de Conexión', { nivel: null }],
      ['De Hombre a Hombre', { nivel: ID_DHAH }],
    ])
    expect(vista.navegacion.padre).toEqual({ id: ID_CONEXION, etiqueta: 'Dirección de Conexión', parche: { nivel: null } })
    expect(vista.navegacion.responsable).toBe('Coordina Edmir Muñoz')
    expect(vista.personas).toHaveLength(9)
  })

  it('an área shows its own next level; crumbs follow every level entered', () => {
    const wau = ninos({ nivel: 'wau' })
    expect(wau.tarjetas.map((t) => [t.label, t.esArea])).toEqual([
      ['Anfitriones', false],
      ['Atención al Voluntario', true],
    ])
    const rec = ninos({ nivel: 'wau-rec' })
    expect(rec.navegacion.migas.map((m) => m.etiqueta)).toEqual([
      'Dirección de Niños',
      'Waumbaland',
      'Atención al Voluntario',
      'Recepción',
    ])
    expect(rec.navegacion.padre?.parche).toEqual({ nivel: 'wau-atv' })
    expect(nombres(rec.personas)).toEqual(['Rita Recepción'])
  })

  it('an unknown nivel falls back to the dirección', () => {
    const vista = ninos({ nivel: 'no-existe' })
    expect(vista.filtros.nivel).toBeNull()
    expect(vista.navegacion.migas).toHaveLength(1)
  })

  it('cards carry flags, the etapa bar and the one-line responsible', () => {
    const [upstreet, waumbaland] = ninos().tarjetas
    expect(upstreet).toMatchObject({ id: 'ups', label: 'Upstreet', personas: 2, porActivar: 0, sinCuenta: 0, responsable: null, responsableCorto: null })
    expect(waumbaland).toMatchObject({
      id: 'wau',
      personas: 5,
      porActivar: 2,
      sinCuenta: 2,
      esArea: true,
      responsable: 'Coordina Wanda Coordinadora',
      responsableCorto: 'Coordina Wanda Coordinadora',
    })
    expect(waumbaland.porEtapa).toEqual({ postulado: 1, en_orientacion: 1, activo: 3, en_pausa: 0, inactivo: 0, retirado: 0 })
  })

  it('cards count under every filter but the level', () => {
    const [upstreet, waumbaland] = ninos({ sinCuenta: true }).tarjetas
    expect(upstreet.personas).toBe(0)
    expect(waumbaland.personas).toBe(2)
  })
})

describe('Por persona and Por servicio', () => {
  it('Por persona lists a person once with their matching servicios', () => {
    const vista = ninos()
    const wanda = vista.personas.find((p) => p.nombre === 'Wanda Coordinadora')
    expect(wanda?.servicios.map((s) => s.equipoId)).toEqual(['wau', 'ups-anf'])
    expect(vista.personas).toHaveLength(7)
  })

  it('Por servicio lists one row per servicio, following the person order', () => {
    const vista = ninos({ vista: 'servicio' })
    expect(vista.servicios).toHaveLength(8)
    expect(vista.servicios.filter((s) => s.nombre === 'Wanda Coordinadora')).toHaveLength(2)
    expect(vista.pie).toBe('8 servicios · 7 personas')
    expect(ninos().pie).toBe('7 personas · 8 servicios')
  })

  it('the detail drawer gets every servicio of a person in the dirección, whatever the filters', () => {
    const vista = ninos({ nivel: 'wau-rec' })
    expect(vista.fichas.get('persona-w1')?.servicios).toHaveLength(2)
  })
})

describe('active filter chips', () => {
  it('lists every active filter as a removable chip and counts them for the Filtros button', () => {
    const vista = ninos({ etapa: 'activo', edad: '26_mas', turno: 't9', sinCuenta: true, sinTurno: true, porActivar: true })
    expect(vista.pastillas.map((p) => [p.etiqueta, p.parche])).toEqual([
      ['Etapa: Activo', { etapa: null }],
      ['Por activar', { porActivar: false }],
      ['Sin cuenta', { sinCuenta: false }],
      ['Sin turno', { sinTurno: false }],
      ['Turno: Domingo 9:00', { turno: null }],
      ['Edad: 26+', { edad: null }],
    ])
    expect(vista.filtrosActivos).toBe(6)
  })

  it('names the turno "Sin turno" chip for the sin-turno shift id', () => {
    expect(ninos({ turno: SIN_TURNO }).pastillas.map((p) => p.etiqueta)).toEqual(['Sin turno'])
  })

  it('"Limpiar todo" drops the filters but keeps the scope, the search, the view and the tab', () => {
    const filtros: FiltrosMiEquipo = {
      ...FILTROS_MI_EQUIPO,
      nivel: 'wau',
      q: 'ana',
      vista: 'servicio',
      tab: 'calendario',
      etapa: 'activo',
      sinCuenta: true,
    }
    expect({ ...filtros, ...LIMPIAR_FILTROS_MI_EQUIPO }).toEqual({
      ...FILTROS_MI_EQUIPO,
      nivel: 'wau',
      q: 'ana',
      vista: 'servicio',
      tab: 'calendario',
    })
  })
})
