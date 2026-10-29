/**
 * Estructura v2 (S12, prototype docs/design-system/prototipos/estructura/07-b-escritorio.html):
 * the org chart view model — health problems per node, branch dots, the
 * folded diagram with "+n", search and problem highlighting, pill counts.
 */
import { construirArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol, ResponsableNodo } from '@/lib/platform/dream-team/estructura-arbol'
import {
  PROBLEMAS_ESTRUCTURA,
  agruparTurnosPropios,
  crearOrganigrama,
  type EntradaOrganigrama,
} from '@/lib/platform/dream-team/estructura-organigrama'
import type { Turno } from '@/lib/platform/dream-team/turnos'
import { personaId, type DreamTeamRol } from '@/lib/platform/dream-team/types'

const resp = (nombre: string, rol: string): ResponsableNodo => ({ personaId: personaId(`p-${nombre}`), nombre, rol })

function real(
  id: string,
  label: string,
  padre?: string,
  extra: Partial<Extract<NodoEquipoArbol, { origen: 'dream_team' }>> = {},
): NodoEquipoArbol {
  return { origen: 'dream_team', id, label, parentEquipoId: padre, activo: true, experiencia: 'talleres_crecimiento', responsables: [], ...extra }
}

function virtual(id: string, label: string, padre: string, tipo: 'segmento' | 'grupo', responsables: ResponsableNodo[]): NodoEquipoArbol {
  return { origen: 'grupos_vida', tipo, id, label, parentEquipoId: padre, activo: true, responsables }
}

const nodos: NodoEquipoArbol[] = [
  real('conexion', 'Dirección de Conexión', undefined, { responsables: [resp('Antholy Ludovic Gómez', 'director')] }),
  real('talleres', 'Talleres', 'conexion', { responsables: [resp('Jose Jimenez', 'coordinador')] }),
  real('dhah', 'De Hombre a Hombre', 'talleres', { responsables: [resp('Edmir Muñoz', 'coordinador')] }),
  real('parejas', 'Parejas', 'talleres'),
  real('bienvenida', 'Bienvenida', 'conexion', { responsables: [resp('Mariela Castillo', 'coordinador')] }),
  real('ninos', 'Dirección de Niños', undefined, { experiencia: 'ninos', responsables: [resp('Nina Rodríguez', 'director')] }),
  real('waumba', 'Waumba Land', 'ninos', { experiencia: 'ninos', responsables: [resp('Wanda Pérez', 'coordinador')] }),
  real('watv', 'Atención al Voluntario', 'waumba', {
    experiencia: 'ninos',
    responsables: [resp('María Fernanda Martínez', 'coordinador')],
  }),
  real('wsal', 'Salones', 'waumba', { experiencia: 'ninos', responsables: [resp('Carla Ruiz', 'coordinador')] }),
  real('upstreet', 'UpStreet', 'ninos', { experiencia: 'ninos', responsables: [resp('Daniel Ortega', 'coordinador')] }),
  real('ulid', 'Líderes de grupo', 'upstreet', { experiencia: 'ninos' }),
  real('estudiantes', 'Estudiantes', undefined, { experiencia: 'estudiantes', responsables: [resp('Samuel Linares', 'director')] }),
  real('transit', 'Transit', 'estudiantes', { experiencia: 'estudiantes', responsables: [resp('Valeria Colmenares', 'coordinador')] }),
  real('gdv', 'Grupos de Vida', undefined, { experiencia: 'grupos_vida', responsables: [resp('Pastores Pérez', 'director')] }),
  virtual('gdv-jov', 'Segmento Jóvenes', 'gdv', 'segmento', [resp('Luis Herrera', 'director_etapa')]),
  virtual('gdv-alfa', 'Grupo Alfa', 'gdv-jov', 'grupo', []),
  real('atraccion', 'Dirección de Atracción', undefined, { experiencia: 'atraccion' }),
  real('camaras', 'Cámaras', 'atraccion', { experiencia: 'atraccion' }),
  real('eventos', 'Dirección de Eventos', undefined, { activo: false, experiencia: 'operating_core' }),
  real('logistica', 'Logística', 'eventos', { activo: false, experiencia: 'operating_core' }),
]

const rol = (equipoId: string, label: string, activo = true): DreamTeamRol => ({
  id: `${equipoId}-${label}`,
  equipoId,
  label,
  nivel: 'voluntario',
  activo,
})

const rolesPorEquipo: Record<string, DreamTeamRol[]> = {
  conexion: [rol('conexion', 'director')],
  talleres: [rol('talleres', 'coordinador')],
  dhah: [rol('dhah', 'coordinador'), rol('dhah', 'facilitador'), rol('dhah', 'recepcion', false)],
  parejas: [rol('parejas', 'coordinador'), rol('parejas', 'voluntario')],
  ninos: [rol('ninos', 'director')],
  ulid: [rol('ulid', 'lider')],
  eventos: [rol('eventos', 'coordinador')],
}

const porRol: Record<string, number> = {
  'conexion-director': 1,
  'talleres-coordinador': 1,
  'dhah-coordinador': 1,
  'dhah-facilitador': 6,
  'parejas-voluntario': 6,
  'ninos-director': 1,
  'ulid-lider': 8,
}

const propias: Record<string, number> = { conexion: 1, talleres: 1, dhah: 7, parejas: 6, bienvenida: 9, ninos: 1, ulid: 8, transit: 12 }

const turno = (id: string, nombre: string, extra: Partial<Turno> = {}): Turno => ({
  id,
  campusId: 'bqto',
  nombre,
  diaSemana: 0,
  hora: '09:00',
  orden: 0,
  activo: true,
  tipo: 'semanal',
  ...extra,
})

const turnos: Turno[] = [
  turno('d9', 'Domingo 9:00'),
  turno('d11', 'Domingo 11:00'),
  turno('s17', 'Sábado 5:00 p. m.'),
  turno('s10', 'Sábado 10:00', { activo: false }),
  turno('tlr', 'The Living Room', { tipo: 'fechas' }),
]

const propiosPorEquipo = agruparTurnosPropios([
  { equipo_id: 'ninos', turno_id: 'd9' },
  { equipo_id: 'ninos', turno_id: 'd11' },
  { equipo_id: 'watv', turno_id: 's10' },
  { equipo_id: 'ulid', turno_id: 's10' },
  { equipo_id: 'estudiantes', turno_id: 's17' },
  { equipo_id: 'estudiantes', turno_id: 'tlr' },
])

function entrada(extra: Partial<EntradaOrganigrama> = {}): EntradaOrganigrama {
  return {
    arbol: construirArbol(nodos),
    rolesPorEquipo,
    uso: { propias, porRol },
    talleres: {},
    turnos: { turnos, propiosPorEquipo },
    ...extra,
  }
}

const organigrama = () => crearOrganigrama(entrada())
const ids = (cajas: readonly { readonly id: string }[]) => cajas.map((caja) => caja.id)

describe('agruparTurnosPropios', () => {
  it('groups the dream_team_equipo_turnos rows by equipo', () => {
    expect(propiosPorEquipo).toEqual({ ninos: ['d9', 'd11'], watv: ['s10'], ulid: ['s10'], estudiantes: ['s17', 'tlr'] })
  })
})

describe('health problems per node', () => {
  it('flags each problem on the node that has it, in the pill order', () => {
    const o = organigrama()
    expect(o.nodo('parejas')?.problemas).toEqual(['roles_sin_asignar'])
    expect(o.nodo('watv')?.problemas).toEqual(['sin_turno'])
    expect(o.nodo('ulid')?.problemas).toEqual(['sin_turno'])
    expect(o.nodo('atraccion')?.problemas).toEqual(['sin_responsable'])
    expect(o.nodo('camaras')?.problemas).toEqual(['sin_responsable'])
    expect(o.nodo('eventos')?.problemas).toEqual(['inactivo'])
    expect(o.nodo('logistica')?.problemas).toEqual(['inactivo'])
  })

  it('treats an inherited responsable as one (the existing derivation)', () => {
    const parejas = organigrama().nodo('parejas')
    expect(parejas?.responsable).toEqual({
      nombre: 'Jose Jimenez',
      iniciales: 'JJ',
      rol: 'Coordinador',
      heredadoDe: { id: 'talleres', label: 'Talleres' },
    })
    expect(parejas?.problemas).not.toContain('sin_responsable')
  })

  it('ignores deactivated roles and lists the active ones nobody holds', () => {
    const o = organigrama()
    expect(o.nodo('dhah')?.problemas).toEqual([])
    expect(o.nodo('parejas')?.rolesSinAsignar).toEqual(['Coordinador'])
  })

  it('inherits weekly shifts and flags a chosen weekly shift that is deactivated', () => {
    const o = organigrama()
    expect(o.nodo('wsal')?.problemas).toEqual([])
    expect(o.nodo('transit')?.problemas).toEqual([])
    expect(o.nodo('watv')?.turnosDesactivados).toEqual(['Sábado 10:00'])
    expect(o.nodo('wsal')?.turnosDesactivados).toEqual([])
  })

  it('flags a chosen deactivated shift even when another campus still offers shifts', () => {
    const o = crearOrganigrama(
      entrada({ turnos: { turnos: [...turnos, turno('c9', 'Cabudare 9:00', { campusId: 'cab' })], propiosPorEquipo } }),
    )
    expect(o.nodo('watv')?.problemas).toEqual(['sin_turno'])
  })

  it('never flags Sin turno without shift data', () => {
    const o = crearOrganigrama(entrada({ turnos: undefined }))
    expect(o.nodo('watv')?.problemas).toEqual([])
    expect(o.conteos.sin_turno).toBe(0)
  })

  it('never flags the read-only Grupos de Vida nodes', () => {
    const o = organigrama()
    expect(o.nodo('gdv-jov')?.problemas).toEqual([])
    expect(o.nodo('gdv-alfa')?.problemas).toEqual([])
    expect(o.nodo('gdv-alfa')?.editable).toBe(false)
    expect(o.nodo('gdv')?.editable).toBe(true)
  })

  it('counts every problem for the pills, with their definitions in order', () => {
    expect(organigrama().conteos).toEqual({ sin_responsable: 2, roles_sin_asignar: 1, sin_turno: 2, inactivo: 2 })
    expect(PROBLEMAS_ESTRUCTURA.map((problema) => problema.id)).toEqual([
      'sin_responsable',
      'roles_sin_asignar',
      'sin_turno',
      'inactivo',
    ])
  })

  it('marks branches that contain a problem below them (inactive does not count)', () => {
    const o = organigrama()
    expect(o.nodo('talleres')?.problemasEnRama).toBe(true)
    expect(o.nodo('ninos')?.problemasEnRama).toBe(true)
    expect(o.nodo('estudiantes')?.problemasEnRama).toBe(false)
    expect(o.nodo('eventos')?.problemasEnRama).toBe(false)
    expect(o.nodo('parejas')?.problemasEnRama).toBe(false)
  })
})

describe('layout', () => {
  it('lists the nodes in pre-order with depth, parent and children; inactive roots last', () => {
    const o = organigrama()
    expect(o.raices).toEqual(['atraccion', 'conexion', 'ninos', 'estudiantes', 'gdv', 'eventos'])
    expect(o.nodo('talleres')).toMatchObject({ padreId: 'conexion', profundidad: 1, hijos: ['dhah', 'parejas'], descendientes: 2 })
    expect(o.nodo('ninos')).toMatchObject({ padreId: null, profundidad: 0, descendientes: 5 })
    expect(o.nodos.slice(0, 4).map((nodo) => nodo.id)).toEqual(['atraccion', 'camaras', 'conexion', 'bienvenida'])
    expect(o.nodo('desconocido')).toBeNull()
  })

  it('counts people over the whole branch and gives the responsable initials', () => {
    const o = organigrama()
    expect(o.nodo('talleres')?.personasRama).toBe(14)
    expect(o.nodo('watv')?.responsable).toEqual({ nombre: 'María Fernanda Martínez', iniciales: 'MM', rol: 'Coordinador' })
    expect(o.nodo('atraccion')?.responsable).toBeNull()
  })

  it('opens the active Dream Team direcciones by default; Grupos de Vida and inactive ones stay folded', () => {
    expect([...organigrama().expandidosPorDefecto()].sort()).toEqual(['atraccion', 'conexion', 'estudiantes', 'ninos'])
  })

  it('draws the default diagram with "+n" and a dot on folded branches with problems', () => {
    const o = organigrama()
    const cajas = o.diagrama({ expandidos: o.expandidosPorDefecto() })
    expect(ids(cajas)).toEqual([
      'atraccion', 'camaras', 'conexion', 'bienvenida', 'talleres', 'ninos', 'upstreet', 'waumba', 'estudiantes', 'transit', 'gdv', 'eventos',
    ])
    const caja = (id: string) => cajas.find((c) => c.id === id)
    expect(caja('conexion')).toMatchObject({ abierto: true, masN: 0, puntoRama: false })
    expect(caja('talleres')).toMatchObject({ abierto: false, masN: 2, descendientesOcultos: 2, puntoRama: true })
    expect(caja('waumba')).toMatchObject({ abierto: false, masN: 2, puntoRama: true })
    expect(caja('gdv')).toMatchObject({ abierto: false, masN: 1, descendientesOcultos: 2, puntoRama: false })
    expect(caja('eventos')).toMatchObject({ abierto: false, masN: 1, puntoRama: false })
    expect(caja('bienvenida')).toMatchObject({ abierto: false, masN: 0, puntoRama: false, resaltado: false, tenue: false })
  })

  it('opens the ancestors of the selected node so it is always on screen', () => {
    const cajas = organigrama().diagrama({ expandidos: new Set(), seleccionado: 'dhah' })
    expect(ids(cajas)).toContain('dhah')
    expect(cajas.find((c) => c.id === 'dhah')?.seleccionado).toBe(true)
    expect(cajas.find((c) => c.id === 'talleres')?.abierto).toBe(true)
  })

  it('"Expandir todo" opens every node with children', () => {
    const o = organigrama()
    expect(o.diagrama({ expandidos: o.todosExpandidos() })).toHaveLength(o.nodos.length)
  })

  it('sums the hero summary over the active direcciones', () => {
    expect(organigrama().resumen).toEqual({ direcciones: 5, equiposActivos: 16, personas: 46 })
  })
})

describe('search and problem highlight', () => {
  it('highlights nothing without a query or a problem', () => {
    const r = organigrama().resaltar({ q: '  ', problema: null })
    expect(r.activo).toBe(false)
    expect(r.ids.size).toBe(0)
    expect(r.abrir.size).toBe(0)
  })

  it('matches the node name or its own responsable, ignoring case and accents', () => {
    const o = organigrama()
    expect([...o.resaltar({ q: 'NINOS', problema: null }).ids]).toEqual(['ninos'])
    const porPersona = o.resaltar({ q: 'maria fernanda', problema: null })
    expect([...porPersona.ids]).toEqual(['watv'])
    expect([...porPersona.abrir].sort()).toEqual(['ninos', 'waumba'])
    expect([...o.resaltar({ q: 'jose', problema: null }).ids]).toEqual(['talleres'])
  })

  it('highlights the nodes with a problem and combines it with the query', () => {
    const o = organigrama()
    const r = o.resaltar({ q: '', problema: 'sin_turno' })
    expect([...r.ids].sort()).toEqual(['ulid', 'watv'])
    expect([...r.abrir].sort()).toEqual(['ninos', 'upstreet', 'waumba'])
    expect([...o.resaltar({ q: 'lideres', problema: 'sin_turno' }).ids]).toEqual(['ulid'])
  })

  it('never hides a node: it dims the rest and opens the way to the matches', () => {
    const o = organigrama()
    const cajas = o.diagrama({ expandidos: o.expandidosPorDefecto(), problema: 'sin_turno' })
    expect(ids(cajas)).toEqual(expect.arrayContaining(['watv', 'wsal', 'ulid', 'conexion', 'gdv']))
    expect(cajas.find((c) => c.id === 'watv')).toMatchObject({ resaltado: true, tenue: false })
    expect(cajas.find((c) => c.id === 'conexion')).toMatchObject({ resaltado: false, tenue: true })
    expect(cajas.find((c) => c.id === 'waumba')?.abierto).toBe(true)
  })
})
