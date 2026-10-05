/**
 * `servidores-vista` — the "Área" drill-down inside a dirección, the shift
 * column text and the campus-scoped shift options (T8 follow-up, D12 of
 * odd/tasks/ninos-voluntarios-waumba.md).
 */
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import {
  FILTROS_INICIALES,
  calcularVistaServidores,
  escribirFiltrosEnUrl,
  indexarArbol,
  leerFiltrosDeUrl,
  parcheElegirArea,
  parcheElegirDireccion,
  type FilaServidor,
  type FiltrosServidores,
} from '@/lib/platform/dream-team/servidores-vista'
import type { Turno } from '@/lib/platform/dream-team/turnos'
import { personaId } from '@/lib/platform/dream-team/types'

function nodo(id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> {
  return {
    equipo: { origen: 'dream_team', id, label, experiencia: 'ninos', activo: true, responsables: [] },
    hijos,
    nivel,
  }
}

// Niños → Waumba Land → { Sala A, Sala B → { Sala B1 } }; Niños → Upstreet → { U1 }; Alabanza → Coro.
const arbol: readonly NodoArbol<NodoEquipoArbol>[] = [
  nodo('alabanza', 'Dirección de Alabanza', [nodo('coro', 'Coro', [], 1)]),
  nodo('ninos', 'Dirección de Niños', [
    nodo('waumba', 'Waumba Land', [nodo('sala-a', 'Sala A', [], 2), nodo('sala-b', 'Sala B', [nodo('sala-b1', 'Sala B1', [], 3)], 2)], 1),
    nodo('upstreet', 'Upstreet', [nodo('u1', 'U1', [], 2)], 1),
  ]),
]

const indice = indexarArbol(arbol)

function fila(clave: string, nombre: string, equipoId: string, extra: Partial<FilaServidor> = {}): FilaServidor {
  const nodoIndexado = indice.get(equipoId)
  return {
    clave,
    personaId: personaId(`p-${clave}`),
    nombre,
    equipoId,
    equipoLabel: nodoIndexado?.label ?? equipoId,
    equipoRuta: nodoIndexado?.ruta ?? '',
    direccionId: nodoIndexado?.direccionId ?? equipoId,
    rolLabel: 'Voluntario',
    estado: 'activo',
    fechaInicio: null,
    telefono: null,
    tieneCuenta: true,
    origen: 'dream_team',
    servicioId: clave,
    version: 1,
    editable: true,
    turnoIds: [],
    ...extra,
  }
}

const T9 = 'turno-9'
const T11 = 'turno-11'
const TOTRO = 'turno-otro'
const turnos: Turno[] = [
  { id: T11, campusId: 'bqt', nombre: 'Domingo 11:00', diaSemana: 0, hora: '11:00', orden: 2, activo: true },
  { id: T9, campusId: 'bqt', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true },
  { id: TOTRO, campusId: 'ccs', nombre: 'Sábado 17:00', diaSemana: 6, hora: '17:00', orden: 1, activo: true },
]

const filas: FilaServidor[] = [
  fila('a', 'Ana', 'sala-a', { turnoIds: [T11, T9] }),
  fila('b', 'Beto', 'sala-b'),
  fila('c', 'Carla', 'sala-b1', { turnoIds: [TOTRO] }),
  fila('d', 'Dani', 'u1'),
  fila('e', 'Eli', 'waumba'),
  fila('f', 'Fede', 'coro'),
  // A servicio on the dirección itself: the dirección is never offered as an área.
  fila('h', 'Hugo', 'ninos'),
  fila('g', 'Gabi', 'u1', { origen: 'grupos_vida', editable: false, turnoIds: undefined }),
]

function vista(filtros: Partial<FiltrosServidores> = {}, campusId: string | null = null) {
  return calcularVistaServidores({ filas, arbol, filtros: { ...FILTROS_INICIALES, ...filtros }, turnos, campusId })
}

const nombres = (v: ReturnType<typeof vista>) => v.visibles.map((f) => f.nombre).sort()

describe('área drill-down', () => {
  it('offers no area until a dirección is chosen', () => {
    expect(FILTROS_INICIALES.area).toBeNull()
    expect(vista().opciones.areas).toEqual([])
  })

  it('offers the inner nodes with children of the chosen dirección, as indented paths', () => {
    expect(vista({ direccion: 'ninos' }).opciones.areas.map((a) => [a.id, a.label, a.nivel])).toEqual([
      ['upstreet', 'Upstreet', 1],
      ['waumba', 'Waumba Land', 1],
      ['sala-b', 'Waumba Land › Sala B', 2],
    ])
    expect(vista({ direccion: 'alabanza' }).opciones.areas).toEqual([])
  })

  it('keeps only the servicios in the area subtree and narrows the equipo options to it', () => {
    const v = vista({ direccion: 'ninos', area: 'waumba' })
    expect(nombres(v)).toEqual(['Ana', 'Beto', 'Carla', 'Eli'])
    expect(v.opciones.equipos.map((e) => e.id).sort()).toEqual(['sala-a', 'sala-b', 'sala-b1', 'waumba'])
    expect(nombres(vista({ direccion: 'ninos', area: 'sala-b' }))).toEqual(['Beto', 'Carla'])
  })

  it('an area fixes its dirección, and an equipo outside the area drops the area', () => {
    expect(vista({ area: 'waumba' }).filtros.direccion).toBe('ninos')
    expect(vista({ area: 'waumba', equipo: 'u1' }).filtros.area).toBeNull()
    expect(vista({ area: 'waumba', equipo: 'sala-a' }).filtros.area).toBe('waumba')
  })

  it('picking an area clears the equipo; picking a dirección clears both', () => {
    const areas = vista({ direccion: 'ninos' }).opciones.areas
    expect(parcheElegirArea('waumba', areas)).toEqual({ area: 'waumba', equipo: null, direccion: 'ninos' })
    expect(parcheElegirArea(null, areas)).toEqual({ area: null, equipo: null })
    expect(parcheElegirDireccion('ninos')).toEqual({ direccion: 'ninos', area: null, equipo: null })
  })

  it('shows a pill that clears the area and its equipo', () => {
    const pastilla = vista({ direccion: 'ninos', area: 'sala-b' }).pastillas.find((p) => p.clave === 'area')
    expect(pastilla?.etiqueta).toBe('Área: Waumba Land › Sala B')
    expect(pastilla?.parche).toEqual({ area: null, equipo: null })
    expect(vista({ direccion: 'ninos' }).pastillas.find((p) => p.clave === 'direccion')?.parche).toEqual({
      direccion: null,
      area: null,
      equipo: null,
    })
  })

  it('round-trips through the URL', () => {
    expect(escribirFiltrosEnUrl({ ...FILTROS_INICIALES, direccion: 'ninos', area: 'waumba' })).toBe('direccion=ninos&area=waumba')
    expect(leerFiltrosDeUrl(new URLSearchParams('area=waumba')).area).toBe('waumba')
    expect(leerFiltrosDeUrl(new URLSearchParams('')).area).toBeNull()
  })
})

describe('shift column', () => {
  it('lists the shift names in campus order, or "—" when none', () => {
    const v = vista()
    const texto = (nombre: string) => v.visibles.find((f) => f.nombre === nombre)?.turnosTexto
    expect(texto('Ana')).toBe('Domingo 9:00, Domingo 11:00')
    expect(texto('Carla')).toBe('Sábado 17:00')
    expect(texto('Beto')).toBe('—')
    expect(texto('Gabi')).toBe('—')
  })
})

describe('campus-scoped shift options', () => {
  it('offers every campus shift when no campus is selected', () => {
    expect(vista().opciones.turnos.map((t) => t.id)).toEqual([T9, TOTRO, T11])
  })

  it('offers only the shifts of the selected campus', () => {
    expect(vista({}, 'bqt').opciones.turnos.map((t) => t.id)).toEqual([T9, T11])
    expect(vista({}, 'ccs').opciones.turnos.map((t) => t.id)).toEqual([TOTRO])
  })
})
