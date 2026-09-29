/**
 * Pure view model behind /admin/dream-team/estructura: the flattened,
 * searchable tree, the inactive roots, and the detail of one team.
 */
import {
  ancestrosDe,
  contarUso,
  crearVistaEstructura,
} from '@/lib/platform/dream-team/estructura-vista'
import {
  ID_ATRACCION,
  ID_CONEXION,
  ID_DHAH,
  ID_ESTUDIANTES,
  ID_EXPERIENCIA,
  ID_GCP,
  ID_GDV,
  ID_GDV_GRUPO,
  ID_GDV_SEGMENTO,
  ID_INSIDE,
  ID_MDH,
  ID_MINISTERIALES,
  ID_PAREJAS,
  ID_PDP,
  arbolEstructura,
  entradaEstructura,
  servicio,
  serviciosEstructura,
} from '@/tests/helpers/estructura-fixture'

const vista = () => crearVistaEstructura(entradaEstructura())
const etiquetas = (filas: readonly { readonly label: string }[]) => filas.map((fila) => fila.label)

describe('contarUso', () => {
  it('counts people per equipo and per rol, leaving retired servicios out', () => {
    const uso = contarUso(serviciosEstructura)
    expect(uso.propias[ID_DHAH]).toBe(9)
    expect(uso.propias[ID_PDP]).toBe(14)
    expect(uso.porRol[`rol-${ID_DHAH}-facilitador`]).toBe(8)
    expect(uso.porRol[`rol-${ID_DHAH}-coordinador`]).toBe(1)
  })

  it('counts every non-retired estado', () => {
    const uso = contarUso([
      servicio('e', 'a', 'postulado'),
      servicio('e', 'a', 'en_pausa'),
      servicio('e', 'a', 'inactivo'),
      servicio('e', 'a', 'retirado'),
    ])
    expect(uso.propias.e).toBe(3)
  })
})

describe('ancestrosDe', () => {
  it('lists the ids above a node, root first', () => {
    expect(ancestrosDe(arbolEstructura, ID_DHAH)).toEqual([ID_CONEXION, ID_GCP])
    expect(ancestrosDe(arbolEstructura, ID_CONEXION)).toEqual([])
    expect(ancestrosDe(arbolEstructura, 'nope')).toEqual([])
  })
})

describe('arbolVisible', () => {
  it('shows only the active roots when nothing is expanded, with branch counts and no roles', () => {
    const filas = vista().arbolVisible({ expandidos: new Set(), query: '' })
    expect(etiquetas(filas)).toEqual(['Dirección de Conexión', 'Dirección de Experiencia', 'Dirección de Grupos de Vida'])
    expect(filas[0]).toEqual({
      id: ID_CONEXION,
      label: 'Dirección de Conexión',
      profundidad: 0,
      tieneHijos: true,
      abierto: false,
      personasRama: 38,
      activo: true,
    })
  })

  it('lists the children of every expanded node, indented by depth', () => {
    const filas = vista().arbolVisible({ expandidos: new Set([ID_CONEXION, ID_GCP]), query: '' })
    expect(filas.map((fila) => [fila.label, fila.profundidad])).toEqual([
      ['Dirección de Conexión', 0],
      ['Grupos de Corto Plazo', 1],
      ['De Hombre a Hombre', 2],
      ['Mujer de Hoy', 2],
      ['Parejas', 2],
      ['Punto de Partida', 2],
      ['Dirección de Experiencia', 0],
      ['Dirección de Grupos de Vida', 0],
    ])
    const gcp = filas.find((fila) => fila.id === ID_GCP)
    expect(gcp).toMatchObject({ abierto: true, tieneHijos: true, personasRama: 37 })
    expect(filas.find((fila) => fila.id === ID_DHAH)).toMatchObject({ tieneHijos: false, abierto: false, personasRama: 9 })
  })

  it('finds a team with its ancestors, ignoring case and diacritics, and opens them on its own', () => {
    const filas = vista().arbolVisible({ expandidos: new Set(), query: '  PAREJAS ' })
    expect(etiquetas(filas)).toEqual(['Dirección de Conexión', 'Grupos de Corto Plazo', 'Parejas'])
    expect(filas.map((fila) => fila.abierto)).toEqual([true, true, false])
  })

  it('matches without diacritics in either side', () => {
    expect(etiquetas(vista().arbolVisible({ expandidos: new Set(), query: 'direccion de conexion' }))).toEqual([
      'Dirección de Conexión',
    ])
  })

  it('keeps matching siblings and drops the rest', () => {
    const filas = vista().arbolVisible({ expandidos: new Set(), query: 'Out' })
    expect(etiquetas(filas)).toEqual(['Dirección de Experiencia', 'Dirección de Estudiantes', 'Inside Out'])
  })

  it('returns nothing when no team matches', () => {
    expect(vista().arbolVisible({ expandidos: new Set(), query: 'zzz' })).toEqual([])
  })

  it('never mixes inactive roots into the tree', () => {
    const filas = vista().arbolVisible({ expandidos: new Set(), query: 'Atracción' })
    expect(filas).toEqual([])
  })

  it('shows the read-only Grupos de Vida branch like any other', () => {
    const filas = vista().arbolVisible({ expandidos: new Set([ID_GDV, ID_GDV_SEGMENTO]), query: '' })
    expect(etiquetas(filas.slice(-3))).toEqual(['Dirección de Grupos de Vida', 'Segmento Hombres', 'Grupo Alfa'])
  })
})

describe('inactivas', () => {
  it('lists the inactive roots apart from the tree', () => {
    const inactivas = vista().inactivas('')
    expect(inactivas.map((fila) => [fila.id, fila.activo, fila.profundidad])).toEqual([
      [ID_ATRACCION, false, 0],
      [ID_MINISTERIALES, false, 0],
    ])
  })

  it('follows the search', () => {
    expect(etiquetas(vista().inactivas('ministeriales'))).toEqual(['Dirección de Servicios Ministeriales'])
    expect(vista().inactivas('conexion')).toEqual([])
  })
})

describe('detalle', () => {
  it('describes a taller team: path, responsable, people, taller and roles with usage', () => {
    const detalle = vista().detalle(ID_DHAH)
    expect(detalle).toMatchObject({
      id: ID_DHAH,
      label: 'De Hombre a Hombre',
      ruta: ['Dirección de Conexión', 'Grupos de Corto Plazo', 'De Hombre a Hombre'],
      experienciaLabel: 'Talleres de Crecimiento',
      activo: true,
      editable: true,
      personasRama: 9,
      esRama: false,
      hijos: [],
      taller: { href: '/talleres/de-hombre-a-hombre', nombre: 'De Hombre a Hombre' },
    })
    expect(detalle?.responsable).toEqual({ nombre: 'Edmir Muñoz', rol: 'Coordinador' })
    const uso = Object.fromEntries((detalle?.roles ?? []).map((rol) => [rol.label, rol.uso]))
    expect(uso).toMatchObject({ Coordinador: 1, Facilitador: 8, Director: 0 })
  })

  it('prefers the coordinador over the director, and falls back to the director', () => {
    expect(vista().detalle(ID_DHAH)?.responsable?.rol).toBe('Coordinador')
    expect(vista().detalle(ID_CONEXION)?.responsable).toEqual({ nombre: 'Antholy Ludovic Gómez', rol: 'Director' })
  })

  it('has no responsable when the node has none', () => {
    expect(vista().detalle(ID_GCP)?.responsable).toBeNull()
  })

  it('totals the whole branch and lists the children with their own responsable and count', () => {
    const detalle = vista().detalle(ID_GCP)
    expect(detalle).toMatchObject({ esRama: true, personasRama: 37, taller: null })
    expect(detalle?.hijos).toEqual([
      { id: ID_DHAH, label: 'De Hombre a Hombre', responsable: { nombre: 'Edmir Muñoz', rol: 'Coordinador' }, personasRama: 9 },
      { id: ID_MDH, label: 'Mujer de Hoy', responsable: { nombre: 'Edith Pérez', rol: 'Coordinador' }, personasRama: 6 },
      { id: ID_PAREJAS, label: 'Parejas', responsable: { nombre: 'Ludovic Gómez', rol: 'Coordinador' }, personasRama: 8 },
      { id: ID_PDP, label: 'Punto de Partida', responsable: { nombre: 'Jose Jimenez', rol: 'Coordinador' }, personasRama: 14 },
    ])
    expect(detalle?.ruta).toEqual(['Dirección de Conexión', 'Grupos de Corto Plazo'])
  })

  it('flags a disabled rol as inactive', () => {
    const roles = vista().detalle(ID_DHAH)?.roles ?? []
    expect(roles.find((rol) => rol.label === 'Voluntario')).toMatchObject({ activo: false, uso: 0 })
    expect(roles.find((rol) => rol.label === 'Facilitador')).toMatchObject({ activo: true, labelOriginal: 'facilitador' })
  })

  it('reports an inactive team as such', () => {
    expect(vista().detalle(ID_ATRACCION)).toMatchObject({ activo: false, ruta: ['Dirección de Atracción'] })
  })

  it('marks the virtual Grupos de Vida nodes read-only, with their leaders and no roles', () => {
    const grupo = vista().detalle(ID_GDV_GRUPO)
    expect(grupo).toMatchObject({ editable: false, experienciaLabel: 'Grupos de Vida', roles: [], taller: null })
    expect(grupo?.responsable).toEqual({ nombre: 'Lidia Líder', rol: 'Líder' })
    expect(grupo?.personasRama).toBe(2)
    expect(vista().detalle(ID_GDV_SEGMENTO)).toMatchObject({ editable: false, personasRama: 3, esRama: true })
    expect(vista().detalle(ID_GDV)).toMatchObject({ editable: true, personasRama: 3 })
  })

  it('returns null for an unknown equipo', () => {
    expect(vista().detalle('nope')).toBeNull()
  })

  it('labels an experiencia branch and its child', () => {
    expect(vista().detalle(ID_EXPERIENCIA)).toMatchObject({ experienciaLabel: 'Experiencia', personasRama: 0 })
    expect(vista().detalle(ID_INSIDE)?.ruta).toEqual(['Dirección de Experiencia', 'Dirección de Estudiantes', 'Inside Out'])
    expect(vista().detalle(ID_ESTUDIANTES)?.hijos.map((hijo) => hijo.label)).toEqual(['Inside Out', 'Transit'])
  })
})

describe('equipoPorDefecto and direccionDe', () => {
  it('picks the first active root with people', () => {
    expect(vista().equipoPorDefecto()).toBe(ID_CONEXION)
  })

  it('falls back to the first active root when nobody serves anywhere, else to the first root', () => {
    const sinGdv = arbolEstructura.filter((raiz) => raiz.equipo.id !== ID_GDV)
    const sinGente = { propias: {}, porRol: {} }
    expect(crearVistaEstructura(entradaEstructura({ arbol: sinGdv, uso: sinGente })).equipoPorDefecto()).toBe(ID_CONEXION)
    const soloInactivas = arbolEstructura.filter((raiz) => !raiz.equipo.activo)
    expect(crearVistaEstructura(entradaEstructura({ arbol: soloInactivas })).equipoPorDefecto()).toBe(ID_ATRACCION)
  })

  it('has no default for an empty tree', () => {
    expect(crearVistaEstructura(entradaEstructura({ arbol: [] })).equipoPorDefecto()).toBeNull()
  })

  it('resolves the root direccion of any node', () => {
    expect(vista().direccionDe(ID_DHAH)).toBe(ID_CONEXION)
    expect(vista().direccionDe(ID_CONEXION)).toBe(ID_CONEXION)
    expect(vista().direccionDe(ID_GDV_GRUPO)).toBe(ID_GDV)
    expect(vista().direccionDe('nope')).toBeNull()
  })
})
