/**
 * `mi-equipo-filtros.ts` — the v2 view model of /dream-team/mi-equipo (S11 of
 * odd/tasks/sistema-diseno-v2.md; prototype docs/design-system/prototipos/mi-equipo/).
 *
 * It sits on top of `vistaDeDireccion` (mi-equipo-vista.ts) and adds what the
 * Servidores redesign brought: the attention metrics (Sirviendo, Por activar,
 * Sin cuenta, Sin turno) acting as filters, the etapa / edad / turno filters,
 * the search by name or phone, tree navigation one level at a time with
 * breadcrumbs (no "Toda la dirección" card; hidden at a leaf), scope cards
 * with flags and an etapa bar, the "Por persona" / "Por servicio" views, the
 * active-filter chips and the URL codec. No I/O and no React: it works from
 * the serialized `VistaDireccion` the server page already sends.
 *
 * Counters are reactive, as in Servidores: each one is computed with every
 * filter applied EXCEPT its own, so it says what tapping it would list. The
 * scope cards count under every filter but the level.
 *
 * It lives apart from mi-equipo-vista.ts because servidores-vista.ts imports
 * that module and this one reuses `responsableCorto` from servidores-vista.ts.
 */
import { ESTADO_LABELS } from '@/components/dream-team/labels'
import { normalizarTelefono } from '@/lib/utils/telefono'
import { DREAM_TEAM_ESTADOS, type DreamTeamEstado } from './types'
import { RANGO_EDAD_LABELS, contarPorRangoEdad, esRangoEdad, type ContadoresEdad, type RangoEdad } from './edad'
import { SIN_TURNO, coincideTurno } from './turnos'
import { responsableCorto } from './servidores-vista'
import { accionesDeServicioMiEquipo, type AccionesServicio, type RolMiEquipo } from './acciones-servicio'
import { nombreConFrecuencia } from './frecuencia-turno'
import type { TipoTurno } from './turno-fechas'
import {
  ESTADOS_POR_ACTIVAR,
  MAX_EQUIPOS_EN_TARJETAS,
  agruparPorPersona,
  contadoresPorEstado,
  contarPersonas,
  normalizarTexto,
  personasDeSeleccion,
  type ContadoresPorEstado,
  type PersonaAgrupada,
  type PersonaVista,
  type ResponsableVista,
  type TarjetaEquipo,
  type VistaDireccion,
} from './mi-equipo-vista'

// ── Filters ──────────────────────────────────────────────────────────────

/** One row per person (default) or one per servicio. */
export type VistaListaMiEquipo = 'persona' | 'servicio'
/** "Personas | Calendario": the Calendario tab only exists with a dated shift (the UI decides). */
export type PestanaMiEquipo = 'personas' | 'calendario'

export interface FiltrosMiEquipo {
  /** The root shown; the page validates it against the direcciones the caller reaches. */
  readonly direccion: string | null
  /** The área or equipo entered below the dirección; `null` = the dirección itself. */
  readonly nivel: string | null
  readonly etapa: DreamTeamEstado | null
  readonly edad: RangoEdad | null
  /** A shift id, `SIN_TURNO`, or `null` for no filter. */
  readonly turno: string | null
  readonly sinCuenta: boolean
  /** Dream Team servicios without a shift (the "Sin turno" metric). */
  readonly sinTurno: boolean
  /** Servicios in postulado or en orientación (the "Por activar" metric). */
  readonly porActivar: boolean
  /** Name, or phone digits when the query is made of phone characters. */
  readonly q: string
  readonly vista: VistaListaMiEquipo
  readonly tab: PestanaMiEquipo
}

export const FILTROS_MI_EQUIPO: FiltrosMiEquipo = {
  direccion: null,
  nivel: null,
  etapa: null,
  edad: null,
  turno: null,
  sinCuenta: false,
  sinTurno: false,
  porActivar: false,
  q: '',
  vista: 'persona',
  tab: 'personas',
}

/** "Limpiar todo": every chip. The scope, the search, the view and the tab stay. */
export const LIMPIAR_FILTROS_MI_EQUIPO: Partial<FiltrosMiEquipo> = {
  etapa: null,
  edad: null,
  turno: null,
  sinCuenta: false,
  sinTurno: false,
  porActivar: false,
}

// ── Output ───────────────────────────────────────────────────────────────

export type MetricaMiEquipoId = 'sirviendo' | 'porActivar' | 'sinCuenta' | 'sinTurno'

/** An attention metric: distinct people under every filter but its own. */
export interface ContadorAtencionMiEquipo {
  readonly personas: number
  readonly activo: boolean
}

/** One level of the tree; applying `parche` goes back to it. */
export interface MigaMiEquipo {
  readonly id: string
  readonly etiqueta: string
  readonly parche: Pick<FiltrosMiEquipo, 'nivel'>
}

export interface NavegacionMiEquipo {
  /** The dirección, then every level entered down to the current one. */
  readonly migas: readonly MigaMiEquipo[]
  /** The level above (phone "‹ padre"); `null` at the dirección. */
  readonly padre: MigaMiEquipo | null
  readonly titulo: string
  /** "Dirige …" / "Coordina …" of the current level, or `null`. */
  readonly responsable: string | null
  /** The same in one line (first name + first surname), see `responsableCorto`. */
  readonly responsableCorto: string | null
  /** Distinct people and servicios in the scope, before any other filter. */
  readonly personas: number
  readonly servicios: number
}

export interface TarjetaMiEquipo {
  readonly id: string
  readonly label: string
  readonly responsable: string | null
  readonly responsableCorto: string | null
  /** Distinct people of the card's branch under every filter but the level. */
  readonly personas: number
  /** Flag: of those, the ones in postulado or en orientación. */
  readonly porActivar: number
  /** Flag: of those, the ones without an account (an unknown status never counts). */
  readonly sinCuenta: number
  /** Servicios per etapa under the same filters: the card's stacked etapa bar. */
  readonly porEtapa: Readonly<Record<DreamTeamEstado, number>>
  /** The node has a level below: tapping it enters it. */
  readonly esArea: boolean
}

export interface PastillaEtapa {
  readonly valor: DreamTeamEstado | 'todos'
  readonly cantidad: number
}

export interface PastillaMiEquipo {
  readonly clave: string
  readonly etiqueta: string
  readonly quitarEtiqueta: string
  readonly parche: Partial<FiltrosMiEquipo>
}

export interface VistaMiEquipo {
  /** The filters actually applied (an unknown `nivel` falls back to the dirección). */
  readonly filtros: FiltrosMiEquipo
  readonly navegacion: NavegacionMiEquipo
  /** The cards of the next level; empty at a leaf (the section hides). */
  readonly tarjetas: readonly TarjetaMiEquipo[]
  /** More than `MAX_EQUIPOS_EN_TARJETAS` cards: render a compact list instead. */
  readonly modoCompacto: boolean
  /** `total` (people in scope) is the denominator of the metric bars. */
  readonly atencion: Readonly<Record<MetricaMiEquipoId, ContadorAtencionMiEquipo>> & { readonly total: number }
  /** Servicios per etapa under every filter but the etapa. */
  readonly contadoresEtapa: ContadoresPorEstado
  /** The etapa pills to show, "Todos" first (same visibility rule as before v2). */
  readonly pastillasEtapa: readonly PastillaEtapa[]
  /** Distinct people per age range under every filter but the edad; `null` when nobody in scope has a known range. */
  readonly contadoresEdad: ContadoresEdad | null
  /** The servicios that pass every filter, sorted. */
  readonly visibles: readonly PersonaVista[]
  /** "Por persona": one item per person with their matching servicios. */
  readonly personas: readonly PersonaAgrupada[]
  /** "Por servicio": one row per servicio, in the person order. */
  readonly servicios: readonly PersonaVista[]
  /** Every person of the dirección with ALL their servicios (the detail panel), by persona id. */
  readonly fichas: ReadonlyMap<string, PersonaAgrupada>
  readonly pastillas: readonly PastillaMiEquipo[]
  /** The count on the Filtros button. */
  readonly filtrosActivos: number
  /** "3 personas · 4 servicios" (servicios first in "Por servicio"). */
  readonly pie: string
}

// ── Rules ────────────────────────────────────────────────────────────────

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

/**
 * Name, or phone when the query is made of phone characters (so a name
 * fragment with a digit never lights up unrelated numbers). The same rule as
 * the Servidores search: raw digits, canonical and international (+58) forms.
 */
function coincideBusqueda(persona: PersonaVista, q: string): boolean {
  const consulta = q.trim()
  if (consulta === '') return true
  if (normalizarTexto(persona.nombre).includes(normalizarTexto(consulta))) return true
  if (/^[\d\s+()-]+$/.test(consulta) && persona.telefono) {
    const buscado = soloDigitos(consulta)
    if (buscado === '') return false
    const canonico = soloDigitos(normalizarTelefono(persona.telefono) ?? persona.telefono)
    const internacional = canonico.startsWith('0') ? `58${canonico.slice(1)}` : canonico
    return [soloDigitos(persona.telefono), canonico, internacional].some((candidato) => candidato.includes(buscado))
  }
  return false
}

/** Shifts are a Dream Team notion: a Grupos de Vida row never matches a shift filter. */
function coincideTurnoDe(persona: PersonaVista, turno: string): boolean {
  return persona.origen === 'dream_team' && coincideTurno(persona.turnoIds, turno)
}

const esPorActivar = (persona: PersonaVista): boolean => ESTADOS_POR_ACTIVAR.includes(persona.estado)
const esSinTurno = (persona: PersonaVista): boolean => coincideTurnoDe(persona, SIN_TURNO)

type Salvo = 'etapa' | 'edad' | 'turno' | 'sinCuenta' | 'sinTurno' | 'porActivar' | null

function pasa(persona: PersonaVista, f: FiltrosMiEquipo, salvo: Salvo): boolean {
  if (!coincideBusqueda(persona, f.q)) return false
  if (salvo !== 'etapa' && f.etapa !== null && persona.estado !== f.etapa) return false
  if (salvo !== 'edad' && f.edad !== null && persona.rangoEdad !== f.edad) return false
  if (salvo !== 'turno' && f.turno !== null && !coincideTurnoDe(persona, f.turno)) return false
  if (salvo !== 'sinCuenta' && f.sinCuenta && persona.tieneCuenta !== false) return false
  if (salvo !== 'sinTurno' && f.sinTurno && !esSinTurno(persona)) return false
  if (salvo !== 'porActivar' && f.porActivar && !esPorActivar(persona)) return false
  return true
}

/**
 * The patch for pressing an attention metric: "Sirviendo" is the etapa
 * Activo, the rest their own flag. Pressing an active metric removes it.
 */
export function parcheAtencionMiEquipo(filtros: FiltrosMiEquipo, id: MetricaMiEquipoId): Partial<FiltrosMiEquipo> {
  switch (id) {
    case 'sirviendo':
      return { etapa: filtros.etapa === 'activo' ? null : 'activo' }
    case 'porActivar':
      return { porActivar: !filtros.porActivar }
    case 'sinCuenta':
      return { sinCuenta: !filtros.sinCuenta }
    case 'sinTurno':
      return { sinTurno: !filtros.sinTurno }
  }
}

// ── Tree levels ──────────────────────────────────────────────────────────

interface NodoNivel {
  readonly label: string
  /** The level the node's card sits on; `null` = the dirección. */
  readonly padreId: string | null
  readonly responsable: string | null
  readonly esArea: boolean
}

function textoResponsable(responsable: ResponsableVista | null): string | null {
  if (!responsable) return null
  return `${responsable.rol === 'coordinador' ? 'Coordina' : 'Dirige'} ${responsable.nombre}`
}

/**
 * Every node reachable by cards (vista.equipos and the levels of its áreas),
 * so a lone área skipped by the cards is never a level nor a crumb.
 */
function indexarNiveles(vista: VistaDireccion): ReadonlyMap<string, NodoNivel> {
  const indice = new Map<string, NodoNivel>()
  function visitar(tarjetas: readonly TarjetaEquipo[], padreId: string | null): void {
    for (const tarjeta of tarjetas) {
      const nivel = tarjeta.esArea ? vista.niveles[tarjeta.id] : undefined
      indice.set(tarjeta.id, {
        label: tarjeta.label,
        padreId,
        responsable: textoResponsable(tarjeta.responsable),
        esArea: nivel !== undefined,
      })
      if (nivel) visitar(nivel.equipos, tarjeta.id)
    }
  }
  visitar(vista.equipos, null)
  return indice
}

function construirNavegacion(
  vista: VistaDireccion,
  indice: ReadonlyMap<string, NodoNivel>,
  nivel: string | null,
  alcance: readonly PersonaVista[],
): NavegacionMiEquipo {
  const cadena: string[] = []
  for (let id = nivel; id !== null; id = indice.get(id)?.padreId ?? null) cadena.unshift(id)
  const migas: MigaMiEquipo[] = [
    { id: vista.id, etiqueta: vista.label, parche: { nivel: null } },
    ...cadena.map((id) => ({ id, etiqueta: indice.get(id)?.label ?? id, parche: { nivel: id } })),
  ]
  const responsable = nivel === null ? textoResponsable(vista.todaLaDireccion.responsable) : (indice.get(nivel)?.responsable ?? null)
  return {
    migas,
    padre: migas.length > 1 ? migas[migas.length - 2] : null,
    titulo: migas[migas.length - 1].etiqueta,
    responsable,
    responsableCorto: responsable === null ? null : responsableCorto(responsable),
    personas: contarPersonas(alcance),
    servicios: alcance.length,
  }
}

function tarjetaDe(tarjeta: TarjetaEquipo, nodo: NodoNivel | undefined, filtradas: readonly PersonaVista[]): TarjetaMiEquipo {
  const rama = personasDeSeleccion(filtradas, tarjeta.id)
  const porEtapa = Object.fromEntries(DREAM_TEAM_ESTADOS.map((estado) => [estado, 0])) as Record<DreamTeamEstado, number>
  for (const persona of rama) porEtapa[persona.estado] += 1
  const responsable = nodo?.responsable ?? null
  return {
    id: tarjeta.id,
    label: tarjeta.label,
    responsable,
    responsableCorto: responsable === null ? null : responsableCorto(responsable),
    personas: contarPersonas(rama),
    porActivar: contarPersonas(rama.filter(esPorActivar)),
    sinCuenta: contarPersonas(rama.filter((persona) => persona.tieneCuenta === false)),
    porEtapa,
    esArea: nodo?.esArea ?? false,
  }
}

// ── Pills, chips, footer ─────────────────────────────────────────────────

/** Always offered; the other etapas only with servicios or while selected. */
const ETAPAS_SIEMPRE: readonly DreamTeamEstado[] = ['activo', 'en_orientacion', 'en_pausa']

function construirPastillasEtapa(contadores: ContadoresPorEstado, etapa: DreamTeamEstado | null): PastillaEtapa[] {
  return [
    { valor: 'todos', cantidad: contadores.todos },
    ...DREAM_TEAM_ESTADOS.filter((estado) => ETAPAS_SIEMPRE.includes(estado) || contadores[estado] > 0 || etapa === estado).map(
      (estado) => ({ valor: estado, cantidad: contadores[estado] }),
    ),
  ]
}

function construirPastillas(f: FiltrosMiEquipo, turnoLabel: (id: string) => string): PastillaMiEquipo[] {
  const pastillas: PastillaMiEquipo[] = []
  function agregar(clave: string, etiqueta: string, parche: Partial<FiltrosMiEquipo>): void {
    pastillas.push({ clave, etiqueta, quitarEtiqueta: `Quitar el filtro ${etiqueta}`, parche })
  }
  if (f.etapa !== null) agregar('etapa', `Etapa: ${ESTADO_LABELS[f.etapa]}`, { etapa: null })
  if (f.porActivar) agregar('por_activar', 'Por activar', { porActivar: false })
  if (f.sinCuenta) agregar('sin_cuenta', 'Sin cuenta', { sinCuenta: false })
  if (f.sinTurno) agregar('sin_turno', 'Sin turno', { sinTurno: false })
  if (f.turno !== null) agregar('turno', f.turno === SIN_TURNO ? 'Sin turno' : `Turno: ${turnoLabel(f.turno)}`, { turno: null })
  if (f.edad !== null) agregar('edad', `Edad: ${RANGO_EDAD_LABELS[f.edad]}`, { edad: null })
  return pastillas
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`
}

// ── The view ─────────────────────────────────────────────────────────────

export interface EntradaVistaMiEquipo {
  readonly vista: VistaDireccion
  readonly filtros: FiltrosMiEquipo
  /** Names the turno chip; an unknown id shows as is. */
  readonly turnos?: readonly { readonly id: string; readonly label: string }[]
}

export function calcularVistaMiEquipo({ vista, filtros: pedidos, turnos = [] }: EntradaVistaMiEquipo): VistaMiEquipo {
  const indice = indexarNiveles(vista)
  const nivel = pedidos.nivel !== null && indice.has(pedidos.nivel) ? pedidos.nivel : null
  const filtros: FiltrosMiEquipo = nivel === pedidos.nivel ? pedidos : { ...pedidos, nivel }

  const alcance = nivel === null ? vista.personas : personasDeSeleccion(vista.personas, nivel)
  const con = (salvo: Salvo): PersonaVista[] => alcance.filter((persona) => pasa(persona, filtros, salvo))
  const personasQue = (salvo: Salvo, cumple: (persona: PersonaVista) => boolean): number => contarPersonas(con(salvo).filter(cumple))

  const visibles = con(null)
  const personas = agruparPorPersona(visibles)
  const servicios = personas.flatMap((persona) => persona.servicios)

  const nivelTarjetas = nivel === null ? vista.equipos : (vista.niveles[nivel]?.equipos ?? [])
  const tarjetas = nivelTarjetas.map((tarjeta) => tarjetaDe(tarjeta, indice.get(tarjeta.id), visibles))

  const contadoresEtapa = contadoresPorEstado(con('etapa'))
  const etiquetaTurno = (id: string): string => turnos.find((turno) => turno.id === id)?.label ?? id
  const pastillas = construirPastillas(filtros, etiquetaTurno)
  const nPersonas = plural(personas.length, 'persona', 'personas')
  const nServicios = plural(servicios.length, 'servicio', 'servicios')

  return {
    filtros,
    navegacion: construirNavegacion(vista, indice, nivel, alcance),
    tarjetas,
    modoCompacto: tarjetas.length > MAX_EQUIPOS_EN_TARJETAS,
    atencion: {
      total: contarPersonas(alcance),
      sirviendo: { personas: personasQue('etapa', (persona) => persona.estado === 'activo'), activo: filtros.etapa === 'activo' },
      porActivar: { personas: personasQue('porActivar', esPorActivar), activo: filtros.porActivar },
      sinCuenta: { personas: personasQue('sinCuenta', (persona) => persona.tieneCuenta === false), activo: filtros.sinCuenta },
      sinTurno: { personas: personasQue('sinTurno', esSinTurno), activo: filtros.sinTurno },
    },
    contadoresEtapa,
    pastillasEtapa: construirPastillasEtapa(contadoresEtapa, filtros.etapa),
    contadoresEdad: alcance.some((persona) => persona.rangoEdad !== undefined) ? contarPorRangoEdad(con('edad')) : null,
    visibles,
    personas,
    servicios,
    fichas: new Map(agruparPorPersona(vista.personas).map((persona) => [persona.clave, persona])),
    pastillas,
    filtrosActivos: pastillas.length,
    pie: filtros.vista === 'persona' ? `${nPersonas} · ${nServicios}` : `${nServicios} · ${nPersonas}`,
  }
}

// ── Who may do what ──────────────────────────────────────────────────────

/**
 * The viewer's role, from the flags the server page already computes:
 * - `director`: the Dream Team write capability (`hasDreamTeamWriteCapability`),
 *   who changed stages and shifts from the old menu;
 * - `coordinador`: no write capability but some equipo to register people in
 *   (`fetchEquiposRegistrables`, the volunteer coordinator), who registered,
 *   fixed fichas and shifts and invited, never the stage;
 * - `sin_permisos`: neither (a Grupos de Vida director, an area coordinator
 *   with dream_team.coordinate only): read-only.
 */
export function rolMiEquipo(permisos: { readonly puedeEditar: boolean; readonly puedeRegistrar: boolean }): RolMiEquipo {
  if (permisos.puedeEditar) return 'director'
  return permisos.puedeRegistrar ? 'coordinador' : 'sin_permisos'
}

/**
 * The actions on one servicio: the role's grants (`accionesDeServicioMiEquipo`)
 * narrowed by what the server granted for that servicio — the ficha (and with
 * it the invite, and the coordinator's shifts) only where `fichaEditable`, as
 * the old per-servicio menu did. The server checks each action again.
 */
export function accionesPersonaMiEquipo(servicio: PersonaVista, rol: RolMiEquipo): AccionesServicio {
  const porRol = accionesDeServicioMiEquipo(servicio, rol)
  if (servicio.fichaEditable === true || !porRol.editarFicha) return porRol
  return {
    ...porRol,
    alguna: porRol.servicio !== null,
    turnosDe: servicio.estado === 'retirado' ? undefined : porRol.servicio?.id,
    editarFicha: false,
    invitar: false,
  }
}

/** A campus shift as the screen names it. */
export interface TurnoMiEquipo {
  readonly id: string
  readonly label: string
  readonly tipo?: TipoTurno
}

/**
 * "Domingo 9:00, Domingo 11:00 · Quincenal (semana B) · próximo 18 oct" ("… ·
 * Por fechas" for a dated shift) in campus order, or "—" when none.
 */
export function textoTurnosMiEquipo(
  servicio: Pick<PersonaVista, 'turnoIds' | 'frecuencias'>,
  turnos: readonly TurnoMiEquipo[],
  hoy: string,
): string {
  const nombres = turnos
    .filter((turno) => servicio.turnoIds?.includes(turno.id))
    .map((turno) => nombreConFrecuencia(turno.label, servicio.frecuencias?.[turno.id], hoy, turno.tipo))
  return nombres.length > 0 ? nombres.join(', ') : '—'
}

// ── URL codec ────────────────────────────────────────────────────────────

/** `URLSearchParams`, Next's `ReadonlyURLSearchParams`, or the plain record a page receives. */
export type ParametrosMiEquipo =
  | { get(nombre: string): string | null }
  | Readonly<Record<string, string | readonly string[] | undefined>>

function leer(parametros: ParametrosMiEquipo, nombre: string): string | null {
  if (typeof (parametros as { get?: unknown }).get === 'function') {
    return (parametros as { get(n: string): string | null }).get(nombre)
  }
  const valor = (parametros as Readonly<Record<string, string | readonly string[] | undefined>>)[nombre]
  if (Array.isArray(valor)) return valor[0] ?? null
  return typeof valor === 'string' ? valor : null
}

function textoOpcional(valor: string | null): string | null {
  const limpio = valor?.trim()
  return limpio ? limpio : null
}

function esEstado(valor: string | null): valor is DreamTeamEstado {
  return valor !== null && (DREAM_TEAM_ESTADOS as readonly string[]).includes(valor)
}

function esVerdadero(valor: string | null): boolean {
  return valor === '1' || valor === 'true'
}

/** Reads the state from the URL; invalid values are dropped. A bare `?direccion=` (the old link) still works. */
export function leerFiltrosMiEquipo(parametros: ParametrosMiEquipo): FiltrosMiEquipo {
  const etapa = leer(parametros, 'etapa')
  const edad = leer(parametros, 'edad')
  return {
    direccion: textoOpcional(leer(parametros, 'direccion')),
    nivel: textoOpcional(leer(parametros, 'nivel')),
    etapa: esEstado(etapa) ? etapa : null,
    edad: esRangoEdad(edad) ? edad : null,
    turno: textoOpcional(leer(parametros, 'turno')),
    sinCuenta: esVerdadero(leer(parametros, 'sin_cuenta')),
    sinTurno: esVerdadero(leer(parametros, 'sin_turno')),
    porActivar: esVerdadero(leer(parametros, 'por_activar')),
    q: leer(parametros, 'q')?.trim() ?? '',
    vista: leer(parametros, 'vista') === 'servicio' ? 'servicio' : 'persona',
    tab: leer(parametros, 'tab') === 'calendario' ? 'calendario' : 'personas',
  }
}

/** The query string (without `?`); defaults are left out. */
export function escribirFiltrosMiEquipo(filtros: FiltrosMiEquipo): string {
  const parametros = new URLSearchParams()
  if (filtros.direccion !== null) parametros.set('direccion', filtros.direccion)
  if (filtros.nivel !== null) parametros.set('nivel', filtros.nivel)
  if (filtros.etapa !== null) parametros.set('etapa', filtros.etapa)
  if (filtros.edad !== null) parametros.set('edad', filtros.edad)
  if (filtros.turno !== null) parametros.set('turno', filtros.turno)
  if (filtros.sinCuenta) parametros.set('sin_cuenta', '1')
  if (filtros.sinTurno) parametros.set('sin_turno', '1')
  if (filtros.porActivar) parametros.set('por_activar', '1')
  if (filtros.q.trim() !== '') parametros.set('q', filtros.q.trim())
  if (filtros.vista !== FILTROS_MI_EQUIPO.vista) parametros.set('vista', filtros.vista)
  if (filtros.tab !== FILTROS_MI_EQUIPO.tab) parametros.set('tab', filtros.tab)
  return parametros.toString()
}
