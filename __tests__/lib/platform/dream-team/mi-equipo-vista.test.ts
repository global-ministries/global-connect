/**
 * Pure view model behind /dream-team/mi-equipo: direcciones, team cards,
 * ordered people, pendientes, counters and search.
 */
import {
  TODOS_LOS_EQUIPOS,
  contadoresPorEstado,
  equiposAsignables,
  filtrarPersonas,
  inicialesDe,
  listarDirecciones,
  ordenDeRol,
  personasDeSeleccion,
  vistaDeDireccion,
  type PersonaEntrada,
  type PersonasPorEquipo,
} from '@/lib/platform/dream-team/mi-equipo-vista'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { personaId } from '@/lib/platform/dream-team/types'
import {
  ID_CONEXION,
  ID_DHAH,
  ID_INACTIVA,
  ID_MDH,
  ID_PAREJAS,
  ID_PDP,
  ID_TALLERES,
  ID_VACIA,
  arbolConexion,
  persona,
  personasPorEquipoConexion,
} from '@/tests/helpers/mi-equipo-conexion'

function vistaConexion() {
  const vista = vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION)
  if (!vista) throw new Error('Conexión must resolve')
  return vista
}

describe('listarDirecciones', () => {
  it('offers only active roots that have people in their branch', () => {
    expect(listarDirecciones(arbolConexion, personasPorEquipoConexion)).toEqual([
      { id: ID_CONEXION, label: 'Dirección de Conexión', total: 38 },
    ])
  })

  it('never offers an empty or an inactive direccion when others qualify', () => {
    const ids = listarDirecciones(arbolConexion, personasPorEquipoConexion).map((d) => d.id)
    expect(ids).not.toContain(ID_VACIA)
    expect(ids).not.toContain(ID_INACTIVA)
  })

  it('keeps the only root even when nobody serves there yet', () => {
    const soloVacia = arbolConexion.filter((raiz) => raiz.equipo.id === ID_VACIA)
    expect(listarDirecciones(soloVacia, {})).toEqual([{ id: ID_VACIA, label: 'Dirección Vacía', total: 0 }])
  })

  it('offers nothing when several roots exist and none has people', () => {
    expect(listarDirecciones(arbolConexion, {})).toEqual([])
  })

  it('counts a branch through intermediate nodes', () => {
    expect(listarDirecciones(arbolConexion, personasPorEquipoConexion)[0].total).toBe(38)
  })
})

describe('vistaDeDireccion', () => {
  it('returns null for an id that is not a root', () => {
    expect(vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_DHAH)).toBeNull()
    expect(vistaDeDireccion(arbolConexion, personasPorEquipoConexion, 'nope')).toBeNull()
  })

  it('makes one card per node with people of its own and skips the intermediate node', () => {
    const vista = vistaConexion()
    expect(vista.equipos.map((e) => e.id)).toEqual([ID_DHAH, ID_PAREJAS, ID_PDP, ID_MDH])
    expect(vista.equipos.map((e) => e.id)).not.toContain(ID_TALLERES)
    expect(vista.equipos.map((e) => e.total)).toEqual([9, 8, 14, 6])
  })

  it('names the coordinador as the responsable of a team', () => {
    const [dhah] = vistaConexion().equipos
    expect(dhah.responsable).toEqual({ nombre: 'Edmir Muñoz', rol: 'coordinador' })
  })

  it('falls back to the director, then to nobody', () => {
    const arbol: readonly NodoArbol<NodoEquipoArbol>[] = [
      { ...arbolConexion[0], hijos: [{ ...arbolConexion[0].hijos[0].hijos[0], nivel: 1 }, { ...arbolConexion[0].hijos[0].hijos[1], nivel: 1 }] },
    ]
    const personas: PersonasPorEquipo = {
      [ID_DHAH]: [persona('d1', 'Diana Director', 'Director'), persona('v1', 'Vera Facilitadora', 'Facilitador')],
      [ID_PAREJAS]: [persona('v2', 'Sin Responsable', 'Facilitador')],
    }
    const vista = vistaDeDireccion(arbol, personas, ID_CONEXION)
    expect(vista?.equipos[0].responsable).toEqual({ nombre: 'Diana Director', rol: 'director' })
    expect(vista?.equipos[1].responsable).toBeNull()
  })

  it('counts the people waiting to be activated per team and for the whole direccion', () => {
    const vista = vistaConexion()
    expect(vista.equipos.map((e) => e.porActivar)).toEqual([1, 0, 1, 0])
    expect(vista.todaLaDireccion).toMatchObject({ id: TODOS_LOS_EQUIPOS, label: 'Toda la dirección', total: 38, porActivar: 2 })
    expect(vista.todaLaDireccion.responsable).toEqual({ nombre: 'Antholy Ludovic Gómez', rol: 'director' })
  })

  it('does not count the director of the root in any team card', () => {
    const vista = vistaConexion()
    expect(vista.equipos.reduce((suma, e) => suma + e.total, 0)).toBe(37)
    expect(vista.personas.find((p) => p.nombre === 'Antholy Ludovic Gómez')?.equipoId).toBe(ID_CONEXION)
    for (const equipo of vista.equipos) {
      expect(personasDeSeleccion(vista.personas, equipo.id).map((p) => p.nombre)).not.toContain('Antholy Ludovic Gómez')
    }
  })

  it('keeps the compact flag off up to 8 teams and turns it on above', () => {
    expect(vistaConexion().modoCompacto).toBe(false)
    const grupos = (n: number) => Array.from({ length: n }, (_, i) => ({
      ...arbolConexion[0].hijos[0].hijos[0],
      equipo: { ...arbolConexion[0].hijos[0].hijos[0].equipo, id: `g-${i}`, label: `Grupo ${i}` },
      nivel: 1,
    }))
    const personas = (n: number): PersonasPorEquipo =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`g-${i}`, [persona(`g${i}`, `Persona ${i}`, 'Facilitador')]]))
    const arbol = (n: number): readonly NodoArbol<NodoEquipoArbol>[] => [{ ...arbolConexion[0], hijos: grupos(n) }]
    expect(vistaDeDireccion(arbol(8), personas(8), ID_CONEXION)?.modoCompacto).toBe(false)
    expect(vistaDeDireccion(arbol(9), personas(9), ID_CONEXION)?.modoCompacto).toBe(true)
  })

  it('lists people director, coordinador, facilitador, then by name', () => {
    const vista = vistaConexion()
    const roles = vista.personas.map((p) => p.rolClave)
    expect(roles.slice(0, 5)).toEqual(['director', 'coordinador', 'coordinador', 'coordinador', 'coordinador'])
    expect(roles.slice(5).every((r) => r === 'facilitador')).toBe(true)
    const coordinadores = vista.personas.filter((p) => p.rolClave === 'coordinador').map((p) => p.nombre)
    expect(coordinadores).toEqual(['Edith Pérez', 'Edmir Muñoz', 'Jose Jimenez', 'Ludovic Gómez'])
  })

  it('puts the coordinador first when a team is selected', () => {
    const parejas = personasDeSeleccion(vistaConexion().personas, ID_PAREJAS)
    expect(parejas).toHaveLength(8)
    expect(parejas[0]).toMatchObject({ nombre: 'Ludovic Gómez', rolClave: 'coordinador' })
  })

  it('orders voluntarios after facilitadores and unknown roles last', () => {
    const arbol: readonly NodoArbol<NodoEquipoArbol>[] = [arbolConexion[0].hijos[0].hijos[0]]
    const otro: PersonaEntrada = { ...persona('o', 'Ana Otro', 'Facilitador'), rolClave: 'artista', rolLabel: 'Artista' }
    const voluntario: PersonaEntrada = { ...persona('v', 'Zoe Voluntaria', 'Facilitador'), rolClave: 'voluntario', rolLabel: 'Voluntario' }
    const lider: PersonaEntrada = { ...persona('l', 'Zack Lider', 'Facilitador'), rolClave: 'lider', rolLabel: 'Líder' }
    const vista = vistaDeDireccion(arbol, { [ID_DHAH]: [otro, voluntario, lider] }, ID_DHAH)
    expect(vista?.personas.map((p) => p.nombre)).toEqual(['Zack Lider', 'Zoe Voluntaria', 'Ana Otro'])
  })

  describe('Grupos de Vida people', () => {
    const gdv = (clave: string, nombre: string, rolClave: string, rolLabel: string): PersonaEntrada => ({
      ...persona(clave, nombre, 'Facilitador'),
      rolClave,
      rolLabel,
      origen: 'grupos_vida',
      servicioId: undefined,
      version: undefined,
    })
    const arbolDhah: readonly NodoArbol<NodoEquipoArbol>[] = [arbolConexion[0].hijos[0].hijos[0]]

    it('orders the roles director general, director de etapa, líder, aprendiz', () => {
      expect(ordenDeRol('director_general')).toBeLessThan(ordenDeRol('director_etapa'))
      expect(ordenDeRol('director_etapa')).toBeLessThan(ordenDeRol('lider'))
      expect(ordenDeRol('lider')).toBeLessThan(ordenDeRol('colider'))
    })

    it('keeps the Dream Team roles in their order around the new ones', () => {
      expect(ordenDeRol('director')).toBeLessThanOrEqual(ordenDeRol('director_general'))
      expect(ordenDeRol('director_etapa')).toBeLessThan(ordenDeRol('coordinador'))
      expect(ordenDeRol('coordinador')).toBeLessThan(ordenDeRol('lider'))
      expect(ordenDeRol('colider')).toBeLessThan(ordenDeRol('voluntario'))
      expect(ordenDeRol('voluntario')).toBeLessThan(ordenDeRol('artista'))
    })

    // D2: an entrenador gets what a líder gets, so it sorts with the líderes.
    it('orders the entrenador with the líder, above the voluntario', () => {
      expect(ordenDeRol('entrenador')).toBe(ordenDeRol('lider'))
      expect(ordenDeRol('Entrenador')).toBe(ordenDeRol('lider'))
      expect(ordenDeRol('entrenador')).toBeLessThan(ordenDeRol('voluntario'))
    })

    it('lists the people of a direccion in that order, then by name', () => {
      const personas: PersonasPorEquipo = {
        [ID_DHAH]: [
          gdv('a', 'Ana Aprendiz', 'colider', 'Aprendiz de grupo'),
          gdv('l', 'Zack Lider', 'lider', 'Líder de grupo'),
          gdv('e', 'Yara Etapa', 'director_etapa', 'Director de etapa'),
          gdv('g', 'Xena General', 'director_general', 'Director general'),
          gdv('l2', 'Bea Lider', 'lider', 'Líder de grupo'),
        ],
      }
      const vista = vistaDeDireccion(arbolDhah, personas, ID_DHAH)
      expect(vista?.personas.map((p) => p.nombre)).toEqual(['Xena General', 'Yara Etapa', 'Bea Lider', 'Zack Lider', 'Ana Aprendiz'])
    })

    it('makes a card for the team of a director with their own people, and keeps them read-only', () => {
      const personas: PersonasPorEquipo = { [ID_DHAH]: [gdv('e', 'Yara Etapa', 'director_etapa', 'Director de etapa')] }
      const vista = vistaDeDireccion(arbolDhah, personas, ID_DHAH)
      expect(vista?.personas[0]).toMatchObject({
        nombre: 'Yara Etapa',
        equipoId: ID_DHAH,
        rolLabel: 'Director de etapa',
        origen: 'grupos_vida',
        editable: false,
        estado: 'activo',
      })
    })
  })

  it('fills initials, team label and editable for each person', () => {
    const edmir = vistaConexion().personas.find((p) => p.nombre === 'Edmir Muñoz')
    expect(edmir).toMatchObject({
      iniciales: 'EM',
      equipoId: ID_DHAH,
      equipoLabel: 'De Hombre a Hombre',
      rolLabel: 'Coordinador',
      estado: 'activo',
      editable: true,
      servicioId: 'servicio-dhah-c',
      version: 1,
    })
  })

  it('lists the pendientes of the direccion', () => {
    const nombres = vistaConexion().pendientes.map((p) => p.nombre).sort()
    expect(nombres).toEqual(['Luis Barrios', 'Wilennys García'])
  })
})

describe('Grupos de Vida leaders', () => {
  const lider = (i: number): PersonaEntrada => ({
    clave: `gdv:${i}`,
    personaId: personaId(`gdv-${i}`),
    nombre: `Lider ${i}`,
    rolClave: 'lider',
    rolLabel: 'Líder de grupo',
    estado: 'activo',
    origen: 'grupos_vida',
  })
  const grupo = (i: number): NodoArbol<NodoEquipoArbol> => ({
    equipo: { origen: 'grupos_vida', tipo: 'grupo', id: `grupo-${i}`, label: `Grupo ${i}`, activo: true, responsables: [] },
    hijos: [],
    nivel: 2,
  })
  const raiz: NodoArbol<NodoEquipoArbol> = {
    equipo: { origen: 'dream_team', id: 'gdv', label: 'Grupos de Vida', experiencia: 'atraccion', activo: true, responsables: [] },
    hijos: Array.from({ length: 9 }, (_, i) => grupo(i)),
    nivel: 0,
  }
  const personas: PersonasPorEquipo = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`grupo-${i}`, [lider(i)]]))

  it('keeps leaders visible but read-only, under their group, in compact mode', () => {
    const vista = vistaDeDireccion([raiz], personas, 'gdv')
    expect(vista?.modoCompacto).toBe(true)
    expect(vista?.total).toBe(9)
    const primero = vista?.personas.find((p) => p.nombre === 'Lider 0')
    expect(primero).toMatchObject({ editable: false, origen: 'grupos_vida', equipoLabel: 'Grupo 0', estado: 'activo' })
    expect(primero?.servicioId).toBeUndefined()
    expect(vista?.equipos[0].responsable).toBeNull()
  })
})

describe('counters, search and filters', () => {
  const personas = () => vistaConexion().personas

  it('counts every estado and the total', () => {
    expect(contadoresPorEstado(personas())).toEqual({
      todos: 38, postulado: 0, en_orientacion: 2, activo: 35, en_pausa: 1, inactivo: 0, retirado: 0,
    })
  })

  it('finds a name ignoring case and diacritics', () => {
    expect(filtrarPersonas(personas(), { query: 'PEREZ' }).map((p) => p.nombre)).toEqual(['Edith Pérez'])
    expect(filtrarPersonas(personas(), { query: 'jose' }).map((p) => p.nombre).sort()).toEqual(['Jose Jimenez', 'Jose Jimenez', 'Jose Salcedo', 'José Parra'])
    expect(filtrarPersonas(personas(), { query: 'gomez' }).length).toBeGreaterThanOrEqual(3)
  })

  it('filters by estado and combines with the query', () => {
    expect(filtrarPersonas(personas(), { estado: 'en_orientacion' })).toHaveLength(2)
    expect(filtrarPersonas(personas(), { estado: 'en_orientacion', query: 'luis' })).toHaveLength(1)
    expect(filtrarPersonas(personas(), { estado: 'en_pausa', query: 'luis' })).toHaveLength(0)
  })

  it('makes the counters react to the query when applied first', () => {
    const mdh = personasDeSeleccion(personas(), ID_MDH)
    const buscadas = filtrarPersonas(mdh, { query: 'blanca' })
    expect(buscadas).toHaveLength(2)
    expect(contadoresPorEstado(buscadas)).toMatchObject({ todos: 2, activo: 2, en_orientacion: 0 })
  })

  it('ignores a blank query', () => {
    expect(filtrarPersonas(personas(), { query: '   ' })).toHaveLength(38)
  })

  it('selects everyone for the aggregate and only the team otherwise', () => {
    expect(personasDeSeleccion(personas(), TODOS_LOS_EQUIPOS)).toHaveLength(38)
    expect(personasDeSeleccion(personas(), ID_PDP)).toHaveLength(14)
  })
})

describe('inicialesDe', () => {
  it.each([
    ['Edmir Muñoz', 'EM'],
    ['Blanca Raquel Rojas', 'BR'],
    ['Cher', 'C'],
    ['  ', ''],
    ['élida Ñáñez', 'ÉÑ'],
  ])('%s -> %s', (nombre, esperado) => {
    expect(inicialesDe(nombre)).toBe(esperado)
  })
})

describe('por_activar filter', () => {
  it('keeps postulado and en_orientacion together', () => {
    const personas = vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION)?.personas ?? []
    const conPostulado = personas.map((p, i) => (i === 0 ? { ...p, estado: 'postulado' as const } : p))
    const resultado = filtrarPersonas(conPostulado, { estado: 'por_activar' })
    expect(resultado.map((p) => p.estado).sort()).toEqual(['en_orientacion', 'en_orientacion', 'postulado'])
  })
})

// The phone and the "has an account" state come from dream_team_contactos_personas
// (scoped to what the caller may see): a person it did not answer for has neither.
describe('contact data on people rows', () => {
  const raiz: NodoArbol<NodoEquipoArbol> = {
    equipo: { origen: 'dream_team', id: 'dir-x', label: 'Dirección X', experiencia: 'talleres_crecimiento', activo: true, responsables: [] },
    hijos: [],
    nivel: 0,
  }
  const entrada = (
    clave: string,
    nombre: string,
    origen: PersonaEntrada['origen'],
    rolClave: string,
    contacto: Partial<Pick<PersonaEntrada, 'telefono' | 'tieneCuenta'>> = {},
  ): PersonaEntrada => ({
    clave,
    personaId: personaId(`persona-${clave}`),
    nombre,
    rolClave,
    rolLabel: rolClave,
    estado: 'activo',
    origen,
    ...(origen === 'dream_team' ? { servicioId: `servicio-${clave}`, version: 1 } : {}),
    ...contacto,
  })
  const personas: PersonasPorEquipo = {
    'dir-x': [
      entrada('s', 'Sara Servidora', 'dream_team', 'director', { telefono: '04125457346', tieneCuenta: true }),
      entrada('l', 'Lia Lider', 'grupos_vida', 'lider', { telefono: '04245551111', tieneCuenta: false }),
      entrada('e', 'Edu Etapa', 'grupos_vida', 'director_etapa', { telefono: null, tieneCuenta: true }),
      entrada('n', 'Nora Sinficha', 'dream_team', 'facilitador'),
    ],
  }
  const vista = () => {
    const resultado = vistaDeDireccion([raiz], personas, 'dir-x')
    if (!resultado) throw new Error('dir-x must resolve')
    return resultado
  }
  const fila = (nombre: string) => {
    const encontrada = vista().personas.find((p) => p.nombre === nombre)
    if (!encontrada) throw new Error(`${nombre} must be listed`)
    return encontrada
  }

  it('carries the phone and the account state of a servicio person', () => {
    expect(fila('Sara Servidora')).toMatchObject({ telefono: '04125457346', tieneCuenta: true })
  })

  it('carries them for a Grupos de Vida leader, who may have no account', () => {
    expect(fila('Lia Lider')).toMatchObject({ telefono: '04245551111', tieneCuenta: false })
  })

  it('carries them for a director, with a known account and no phone', () => {
    expect(fila('Edu Etapa')).toMatchObject({ telefono: null, tieneCuenta: true })
  })

  it('gives null and null to a person the contacts lookup did not answer for', () => {
    expect(fila('Nora Sinficha')).toMatchObject({ telefono: null, tieneCuenta: null })
  })

  it('keeps contacts through ordering, search and the estado filter', () => {
    const buscadas = filtrarPersonas(vista().personas, { query: 'lia' })
    expect(buscadas).toHaveLength(1)
    expect(buscadas[0]).toMatchObject({ telefono: '04245551111', tieneCuenta: false })
  })
})

describe('equiposAsignables', () => {
  it('lists the real equipos of the direccion branch, root first, indented by depth, with their path below the direccion', () => {
    expect(equiposAsignables(arbolConexion, ID_CONEXION)).toEqual([
      { id: ID_CONEXION, etiqueta: 'Dirección de Conexión', ruta: ['Dirección de Conexión'] },
      { id: ID_TALLERES, etiqueta: '— Talleres', ruta: ['Talleres'] },
      { id: ID_DHAH, etiqueta: '—— De Hombre a Hombre', ruta: ['Talleres', 'De Hombre a Hombre'] },
      { id: ID_PAREJAS, etiqueta: '—— Parejas', ruta: ['Talleres', 'Parejas'] },
      { id: ID_PDP, etiqueta: '—— Punto de Partida', ruta: ['Talleres', 'Punto de Partida'] },
      { id: ID_MDH, etiqueta: '—— Mujer de Hoy', ruta: ['Talleres', 'Mujer de Hoy'] },
    ])
  })

  it('skips virtual Grupos de Vida nodes and unknown direcciones', () => {
    const gdv: readonly NodoArbol<NodoEquipoArbol>[] = [
      {
        equipo: { origen: 'dream_team', id: 'gdv', label: 'Grupos de Vida', experiencia: 'atraccion', activo: true, responsables: [] },
        hijos: [
          { equipo: { origen: 'grupos_vida', tipo: 'grupo', id: 'g1', label: 'Grupo 1', activo: true, responsables: [] }, hijos: [], nivel: 1 },
        ],
        nivel: 0,
      },
    ]
    expect(equiposAsignables(gdv, 'gdv')).toEqual([{ id: 'gdv', etiqueta: 'Grupos de Vida', ruta: ['Grupos de Vida'] }])
    expect(equiposAsignables(gdv, 'otra')).toEqual([])
  })
})
