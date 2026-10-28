/**
 * `servidores-vista` — design system v2 (T6 of odd/tasks/sistema-diseno-v2.md):
 * the attention metrics that act as filters (Sirviendo, Por activar, Sin
 * cuenta, Sin turno, plus En varios equipos for the sheet), the new "Por
 * activar" filter, the chips (scope and search live elsewhere), the tree
 * breadcrumbs, the repeated equipo names, the person detail with every
 * servicio, and the URL codec (por_activar, the removed "Por equipo").
 */
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import {
  FILTROS_INICIALES,
  LIMPIAR_FILTROS,
  LIMPIAR_HOJA,
  calcularVistaServidores,
  escribirFiltrosEnUrl,
  indexarArbol,
  leerFiltrosDeUrl,
  parcheAtencion,
  type FilaServidor,
  type FiltrosServidores,
} from '@/lib/platform/dream-team/servidores-vista'
import { SIN_TURNO } from '@/lib/platform/dream-team/turnos'
import { personaId } from '@/lib/platform/dream-team/types'
import { HOY, ID_CORO, ID_DHAH, ID_PDP, arbolServidores, fila, filasConexion } from '../../../../tests/helpers/servidores-conexion'

function vista(filtros: Partial<FiltrosServidores> = {}, filas: readonly FilaServidor[] = filasConexion) {
  return calcularVistaServidores({ filas, arbol: arbolServidores, filtros: { ...FILTROS_INICIALES, ...filtros }, hoy: HOY })
}

describe('attention metrics (distinct people)', () => {
  it('counts Sirviendo, Por activar, Sin cuenta, Sin turno and En varios equipos over the scope', () => {
    const { atencion } = vista()
    expect(atencion.total).toBe(36)
    expect(atencion.sirviendo).toEqual({ personas: 33, activo: false })
    expect(atencion.porActivar).toEqual({ personas: 2, activo: false })
    expect(atencion.sinCuenta).toEqual({ personas: 31, activo: false })
    // The fixture assigns no shift to anybody.
    expect(atencion.sinTurno).toEqual({ personas: 36, activo: false })
    expect(atencion.varios).toEqual({ personas: 2, activo: false })
  })

  it('each metric reacts to every filter but its own, and the total follows the scope', () => {
    const conSinCuenta = vista({ sinCuenta: true }).atencion
    expect(conSinCuenta.sinCuenta).toEqual({ personas: 31, activo: true })
    expect(conSinCuenta.sirviendo.personas).toBe(28)
    expect(conSinCuenta.varios.personas).toBe(0)

    const pdp = vista({ equipo: ID_PDP }).atencion
    expect(pdp.total).toBe(14)
    expect(pdp.porActivar.personas).toBe(1)
    expect(vista({ etapa: 'activo' }).atencion.sirviendo).toEqual({ personas: 33, activo: true })
  })

  it('"Sin turno" counts Dream Team servicios without a shift, never a Grupos de Vida row', () => {
    const filas = [
      fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { turnoIds: ['t-9'] }),
      fila('2', 'Beto Paz', ID_DHAH, 'Facilitador', { turnoIds: [] }),
      fila('3', 'Marta Lider', ID_DHAH, 'Líder de grupo', { origen: 'grupos_vida', editable: false, turnoIds: undefined }),
    ]
    expect(vista({}, filas).atencion.sinTurno.personas).toBe(1)
    expect(vista({ turno: SIN_TURNO }, filas).visibles.map((f) => f.nombre)).toEqual(['Beto Paz'])
    expect(vista({ turno: SIN_TURNO }, filas).atencion.sinTurno.activo).toBe(true)
  })
})

describe('"Por activar" filter', () => {
  it('keeps the servicios in postulado or en orientación', () => {
    const v = vista({ porActivar: true, agrupar: 'ninguno' })
    expect(v.visibles.map((f) => f.nombre).sort()).toEqual(['Luis Barrios', 'Wilennys García'])
    expect(v.visibles.every((f) => f.estado === 'en_orientacion')).toBe(true)
  })

  it('combines with the etapa counters (they ignore only the etapa filter)', () => {
    expect(vista({ porActivar: true }).contadoresEtapa.todas).toBe(2)
  })
})

describe('the patch of each metric toggles its filter', () => {
  it('Sirviendo is the etapa Activo; Sin turno is the shift filter "Sin turno"', () => {
    expect(parcheAtencion(FILTROS_INICIALES, 'sirviendo')).toEqual({ etapa: 'activo' })
    expect(parcheAtencion({ ...FILTROS_INICIALES, etapa: 'activo' }, 'sirviendo')).toEqual({ etapa: null })
    expect(parcheAtencion({ ...FILTROS_INICIALES, etapa: 'en_pausa' }, 'sirviendo')).toEqual({ etapa: 'activo' })
    expect(parcheAtencion(FILTROS_INICIALES, 'sinTurno')).toEqual({ turno: SIN_TURNO })
    expect(parcheAtencion({ ...FILTROS_INICIALES, turno: SIN_TURNO }, 'sinTurno')).toEqual({ turno: null })
    expect(parcheAtencion({ ...FILTROS_INICIALES, turno: 't-9' }, 'sinTurno')).toEqual({ turno: SIN_TURNO })
  })

  it('Por activar, Sin cuenta and En varios equipos flip their own flag', () => {
    expect(parcheAtencion(FILTROS_INICIALES, 'porActivar')).toEqual({ porActivar: true })
    expect(parcheAtencion({ ...FILTROS_INICIALES, sinCuenta: true }, 'sinCuenta')).toEqual({ sinCuenta: false })
    expect(parcheAtencion(FILTROS_INICIALES, 'varios')).toEqual({ varios: true })
  })
})

describe('chips and the sheet count', () => {
  it('lists the filters, not the scope (breadcrumbs) nor the search (the search box)', () => {
    const v = vista({
      etapa: 'activo',
      equipo: ID_CORO,
      rol: 'Coordinador',
      inicio: 'trimestre',
      porActivar: true,
      sinCuenta: true,
      varios: true,
      q: 'sara',
    })
    expect(v.pastillas.map((p) => p.etiqueta)).toEqual([
      'Etapa: Activo',
      'Rol: Coordinador',
      'Inicio: últimos 3 meses',
      'Por activar',
      'Sin cuenta',
      'En varios equipos',
    ])
    expect(v.pastillas.find((p) => p.clave === 'por_activar')?.parche).toEqual({ porActivar: false })
  })

  it('counts the filters the sheet holds (the age pills live on the screen)', () => {
    expect(vista({ etapa: 'activo', q: 'x', equipo: ID_CORO }).filtrosEnHoja).toBe(1)
    expect(vista({ rol: 'Director', sinCuenta: true, varios: true, porActivar: true, edad: '12_17' }).filtrosEnHoja).toBe(4)
    expect(vista({ turno: SIN_TURNO, inicio: 'mes' }).filtrosEnHoja).toBe(2)
  })

  it('"Limpiar todo" keeps the scope and the search; the sheet "Limpiar" also keeps the age', () => {
    const filtros: FiltrosServidores = {
      ...FILTROS_INICIALES,
      equipo: ID_PDP,
      q: 'jose',
      etapa: 'activo',
      rol: 'Coordinador',
      turno: SIN_TURNO,
      edad: '12_17',
      inicio: 'mes',
      porActivar: true,
      sinCuenta: true,
      varios: true,
    }
    expect({ ...filtros, ...LIMPIAR_FILTROS }).toEqual({ ...FILTROS_INICIALES, equipo: ID_PDP, q: 'jose' })
    expect({ ...filtros, ...LIMPIAR_HOJA }).toEqual({ ...FILTROS_INICIALES, equipo: ID_PDP, q: 'jose', edad: '12_17' })
  })
})

// Niños → Waumba Land → { Anfitriones, Sala B → { Sala B1 } }; Niños → UpStreet → { Anfitriones }.
function nodo(id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> {
  return { equipo: { origen: 'dream_team', id, label, experiencia: 'ninos', activo: true, responsables: [] }, hijos, nivel }
}
const arbolNinos: readonly NodoArbol<NodoEquipoArbol>[] = [
  nodo('ninos', 'Dirección de Niños', [
    nodo('waumba', 'Waumba Land', [nodo('w-anf', 'Anfitriones', [], 2), nodo('sala-b', 'Sala B', [nodo('sala-b1', 'Sala B1', [], 3)], 2)], 1),
    nodo('upstreet', 'UpStreet', [nodo('u-anf', 'Anfitriones', [], 2)], 1),
  ]),
]
const indiceNinos = indexarArbol(arbolNinos)
function filaNinos(clave: string, nombre: string, equipoId: string, extra: Partial<FilaServidor> = {}): FilaServidor {
  const nodoIndexado = indiceNinos.get(equipoId)
  return {
    clave,
    personaId: personaId(`p-${nombre}`),
    nombre,
    equipoId,
    equipoLabel: nodoIndexado?.label ?? equipoId,
    equipoRuta: nodoIndexado?.ruta ?? '',
    direccionId: 'ninos',
    rolLabel: 'Voluntario',
    estado: 'activo',
    fechaInicio: null,
    telefono: null,
    tieneCuenta: true,
    origen: 'dream_team',
    servicioId: clave,
    version: 1,
    editable: true,
    ...extra,
  }
}
const filasNinos = [
  filaNinos('n', 'Nina Rodríguez', 'ninos', { rolLabel: 'Director' }),
  filaNinos('w', 'Wendy Coord', 'waumba', { rolLabel: 'Coordinador' }),
  filaNinos('a', 'Ana', 'w-anf'),
  filaNinos('a2', 'Ana', 'u-anf', { estado: 'en_pausa' }),
  filaNinos('b', 'Beto', 'sala-b'),
  filaNinos('c', 'Carla', 'sala-b1'),
]
function vistaNinos(filtros: Partial<FiltrosServidores> = {}) {
  return calcularVistaServidores({ filas: filasNinos, arbol: arbolNinos, filtros: { ...FILTROS_INICIALES, ...filtros }, hoy: HOY })
}
const etiquetas = (v: ReturnType<typeof vistaNinos>) => v.navegacion.migas.map((m) => m.etiqueta)

describe('tree breadcrumbs', () => {
  it('at the root there is one crumb and the title is "Servidores"', () => {
    const { navegacion } = vistaNinos()
    expect(etiquetas(vistaNinos())).toEqual(['Servidores'])
    expect(navegacion).toMatchObject({ titulo: 'Servidores', responsable: null, personas: 5, servicios: 6 })
  })

  it('a dirección adds its crumb, its director and the numbers of its scope', () => {
    const v = vistaNinos({ direccion: 'ninos' })
    expect(etiquetas(v)).toEqual(['Servidores', 'Dirección de Niños'])
    expect(v.navegacion).toMatchObject({ titulo: 'Dirección de Niños', responsable: 'Dirige Nina Rodríguez', personas: 5, servicios: 6 })
  })

  it('an área adds every level down to it; each crumb carries the patch that goes back there', () => {
    const v = vistaNinos({ area: 'sala-b' })
    expect(etiquetas(v)).toEqual(['Servidores', 'Dirección de Niños', 'Waumba Land', 'Sala B'])
    expect(v.navegacion.migas.map((m) => m.parche)).toEqual([
      { direccion: null, area: null, equipo: null },
      { direccion: 'ninos', area: null, equipo: null },
      { direccion: 'ninos', area: 'waumba', equipo: null },
      { direccion: 'ninos', area: 'sala-b', equipo: null },
    ])
    expect(v.navegacion).toMatchObject({ titulo: 'Sala B', personas: 2, servicios: 2 })
  })

  it('an equipo is the last crumb, named with its parent when the name repeats', () => {
    const v = vistaNinos({ area: 'waumba', equipo: 'w-anf' })
    expect(etiquetas(v)).toEqual(['Servidores', 'Dirección de Niños', 'Waumba Land', 'Anfitriones · Waumba Land'])
    expect(v.navegacion).toMatchObject({ responsable: null, personas: 1, servicios: 1 })
    expect(etiquetas(vistaNinos({ equipo: 'u-anf' }))).toEqual(['Servidores', 'Dirección de Niños', 'Anfitriones · UpStreet'])
  })

  it('the coordinator of an área is its responsible', () => {
    expect(vistaNinos({ area: 'waumba' }).navegacion.responsable).toBe('Coordina Wendy Coord')
  })
})

describe('equipo names in the list', () => {
  it('a repeated equipo name carries its parent; a unique one stays plain', () => {
    const v = vistaNinos({ agrupar: 'ninguno' })
    const nombre = (clave: string) => v.visibles.find((f) => f.clave === clave)?.equipoNombre
    expect(nombre('a')).toBe('Anfitriones · Waumba Land')
    expect(nombre('a2')).toBe('Anfitriones · UpStreet')
    expect(nombre('b')).toBe('Sala B')
    expect(nombre('n')).toBe('Dirección de Niños')
  })
})

describe('person detail', () => {
  it('holds every servicio of the person, even those the filters hide', () => {
    const v = vistaNinos({ equipo: 'w-anf' })
    expect(v.visibles.map((f) => f.clave)).toEqual(['a'])
    const ana = v.fichas.get(personaId('p-Ana'))
    expect(ana?.nombre).toBe('Ana')
    expect(ana?.filas.map((f) => f.clave)).toEqual(['a', 'a2'])
    expect(ana?.filas[1].turnosTexto).toBe('—')
  })
})

describe('URL codec (T6)', () => {
  it('round-trips "Por activar" as por_activar=1', () => {
    const filtros = { ...FILTROS_INICIALES, porActivar: true, sinCuenta: true }
    expect(escribirFiltrosEnUrl(filtros)).toBe('sin_cuenta=1&por_activar=1')
    expect(leerFiltrosDeUrl(new URLSearchParams('sin_cuenta=1&por_activar=1'))).toEqual(filtros)
    expect(leerFiltrosDeUrl(new URLSearchParams('por_activar=quiza')).porActivar).toBe(false)
  })

  it('reads the removed "Por equipo" (?agrupar=equipo) as the default per-person view', () => {
    expect(leerFiltrosDeUrl(new URLSearchParams('agrupar=equipo'))).toEqual(FILTROS_INICIALES)
    expect(leerFiltrosDeUrl(new URLSearchParams('agrupar=ninguno')).agrupar).toBe('ninguno')
  })
})
