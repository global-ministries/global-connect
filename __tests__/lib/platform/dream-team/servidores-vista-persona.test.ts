/**
 * `servidores-vista` — the per-person view (the default "Por persona"): one
 * item per person with the servicios that pass the filters, in the order of
 * the current sort. "Por servicio" keeps one row per servicio.
 *
 * Fixture: tests/helpers/servidores-conexion.ts (Conexión: 38 servicios, 36
 * personas; Antholy Ludovic Gómez and Jose Jimenez serve in two teams).
 */
import {
  FILTROS_INICIALES,
  MAX_SERVICIOS_POR_PERSONA,
  calcularVistaServidores,
  escribirFiltrosEnUrl,
  leerFiltrosDeUrl,
  recortarServicios,
  type FiltrosServidores,
  type ItemLista,
  type PersonaLista,
} from '@/lib/platform/dream-team/servidores-vista'
import {
  HOY,
  ID_CONEXION,
  ID_DHAH,
  ID_MDH,
  ID_PAREJAS,
  ID_PDP,
  arbolServidores,
  fila,
  filasConexion,
} from '../../../../tests/helpers/servidores-conexion'

function vista(filtros: Partial<FiltrosServidores> = {}, filas = filasConexion) {
  return calcularVistaServidores({ filas, arbol: arbolServidores, filtros: { ...FILTROS_INICIALES, ...filtros }, hoy: HOY })
}

const personas = (items: readonly ItemLista[]): PersonaLista[] =>
  items.flatMap((item) => (item.tipo === 'persona' ? [item] : []))
const personaDe = (items: readonly ItemLista[], nombre: string) => personas(items).find((p) => p.nombre === nombre)

describe('per-person view (default)', () => {
  it('is the default grouping', () => {
    expect(FILTROS_INICIALES.agrupar).toBe('persona')
  })

  it('lists each person once, with all their matching servicios', () => {
    const { items } = vista()
    expect(items.every((item) => item.tipo === 'persona')).toBe(true)
    expect(items).toHaveLength(36)
    const jose = personaDe(items, 'Jose Jimenez')
    expect(jose?.filas.map((f) => f.equipoLabel)).toEqual(['De Hombre a Hombre', 'Punto de Partida'])
    expect(jose).toMatchObject({ clave: 'persona-Jose Jimenez', telefono: '04263667378', tieneCuenta: true, soloGruposVida: false })
    expect(personaDe(items, 'Luis Barrios')?.filas).toHaveLength(1)
  })

  it('keeps only the servicios that pass the filters; a person with none does not appear', () => {
    const porEquipo = vista({ equipo: ID_DHAH })
    expect(personaDe(porEquipo.items, 'Jose Jimenez')?.filas.map((f) => f.equipoId)).toEqual([ID_DHAH])
    expect(personaDe(porEquipo.items, 'Edith Pérez')).toBeUndefined()

    const porRol = vista({ rol: 'Coordinador' })
    expect(personas(porRol.items).map((p) => p.nombre)).toEqual(['Antholy Ludovic Gómez', 'Edith Pérez', 'Edmir Muñoz', 'Jose Jimenez'])
    expect(personaDe(porRol.items, 'Antholy Ludovic Gómez')?.filas.map((f) => f.equipoId)).toEqual([ID_PAREJAS])
  })

  it('keeps the etapa counters meaning servicios; the attention metrics count people', () => {
    const v = vista()
    expect(v.contadoresEtapa.todas).toBe(38)
    expect(v.atencion.varios.personas).toBe(2)
    expect(v.atencion.sinCuenta.personas).toBe(31)
  })

  it('orders persons by the sort applied to their servicios, and the servicios inside by the same sort', () => {
    const desc = vista({ orden: { columna: 'persona', sentido: 'desc' } })
    const nombres = personas(desc.items).map((p) => p.nombre)
    expect(nombres).toEqual([...nombres].sort((a, b) => b.localeCompare(a, 'es')))

    const porEquipoAsc = vista({ orden: { columna: 'equipo', sentido: 'asc' } })
    // De Hombre a Hombre comes first; Jose's first servicio is there, so he sits in that block.
    const asc = personas(porEquipoAsc.items)
    expect(asc[0].nombre).toBe('Edmir Muñoz')
    expect(asc.slice(0, 9).map((p) => p.nombre)).toContain('Jose Jimenez')
    expect(personaDe(porEquipoAsc.items, 'Jose Jimenez')?.filas.map((f) => f.equipoId)).toEqual([ID_DHAH, ID_PDP])

    const porEquipoDesc = vista({ orden: { columna: 'equipo', sentido: 'desc' } })
    const desc2 = personas(porEquipoDesc.items)
    expect(desc2.slice(0, 14).map((p) => p.nombre)).toContain('Jose Jimenez')
    expect(personaDe(porEquipoDesc.items, 'Jose Jimenez')?.filas.map((f) => f.equipoId)).toEqual([ID_PDP, ID_DHAH])
  })

  it('marks a person as Grupos de Vida only when every listed servicio is', () => {
    const gdv = { origen: 'grupos_vida', servicioId: undefined, version: undefined, editable: false } as const
    const filas = [
      fila('1', 'Jose Gimenez', ID_CONEXION, 'Director general', gdv),
      fila('2', 'Jose Gimenez', ID_DHAH, 'Director general', gdv),
      fila('3', 'Mixta Paz', ID_DHAH, 'Líder de grupo', gdv),
      fila('4', 'Mixta Paz', ID_PDP, 'Facilitador'),
    ]
    const { items } = vista({}, filas)
    expect(personaDe(items, 'Jose Gimenez')?.soloGruposVida).toBe(true)
    expect(personaDe(items, 'Mixta Paz')?.soloGruposVida).toBe(false)
  })

  it('footer says personas first, then servicios', () => {
    expect(vista().pie.resumen).toBe('36 personas · 38 servicios')
    expect(vista({ varios: true }).pie.resumen).toBe('2 personas · 4 servicios')
    expect(vista({ q: 'perez' }).pie.resumen).toBe('1 persona · 1 servicio')
    expect(vista({ agrupar: 'ninguno' }).pie.resumen).toBe('38 servicios · 36 personas')
  })
})

describe('"Por servicio" keeps one row per servicio', () => {
  it('lists 38 rows', () => {
    const { items } = vista({ agrupar: 'ninguno' })
    expect(items).toHaveLength(38)
    expect(items.every((item) => item.tipo === 'fila')).toBe(true)
  })
})

describe('showing at most three servicios per person', () => {
  const cinco = [ID_CONEXION, ID_DHAH, ID_PAREJAS, ID_PDP, ID_MDH].map((equipo, i) =>
    fila(String(i), 'Jose Gimenez', equipo, 'Director general'),
  )

  it('shows three and counts the rest until expanded', () => {
    expect(MAX_SERVICIOS_POR_PERSONA).toBe(3)
    expect(recortarServicios(cinco, false)).toEqual({ visibles: cinco.slice(0, 3), ocultos: 2 })
    expect(recortarServicios(cinco, true)).toEqual({ visibles: cinco, ocultos: 0 })
    expect(recortarServicios(cinco.slice(0, 3), false)).toEqual({ visibles: cinco.slice(0, 3), ocultos: 0 })
  })
})

describe('URL codec for the grouping', () => {
  it('omits the default (por persona) and writes "Por servicio" explicitly', () => {
    expect(escribirFiltrosEnUrl(FILTROS_INICIALES)).toBe('')
    expect(escribirFiltrosEnUrl({ ...FILTROS_INICIALES, agrupar: 'ninguno' })).toBe('agrupar=ninguno')
  })

  it('round-trips both views, and old links keep working', () => {
    for (const agrupar of ['persona', 'ninguno'] as const) {
      const filtros = { ...FILTROS_INICIALES, agrupar }
      expect(leerFiltrosDeUrl(new URLSearchParams(escribirFiltrosEnUrl(filtros)))).toEqual(filtros)
    }
    expect(leerFiltrosDeUrl(new URLSearchParams('agrupar=persona')).agrupar).toBe('persona')
    // "Por equipo" was removed (S4): its old links open the default view.
    expect(leerFiltrosDeUrl(new URLSearchParams('agrupar=equipo')).agrupar).toBe('persona')
    expect(leerFiltrosDeUrl(new URLSearchParams('')).agrupar).toBe('persona')
    expect(leerFiltrosDeUrl(new URLSearchParams('agrupar=raro')).agrupar).toBe('persona')
  })
})
