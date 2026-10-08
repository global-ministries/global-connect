import type { NodoArbol } from './arbol'
import type { NodoEquipoArbol } from './estructura-arbol'
import { DREAM_TEAM_ESTADOS, type DreamTeamEstado, type PersonaId } from './types'
import { ESTADO_LABELS } from '@/components/dream-team/labels'
import { normalizarTelefono } from '@/lib/utils/telefono'
import { isoLocal, nombreConFrecuencia } from './frecuencia-turno'
import { SIN_TURNO, coincideTurno, ordenarTurnos, type FrecuenciasPorTurno, type Turno } from './turnos'

/**
 * Pure view model behind /admin/dream-team/servidores (no I/O, no React).
 *
 * It answers work questions over the flat list of servicios: who serves where
 * and in which stage, who has no account, who serves in several teams. It owns
 * every filter rule, the reactive counters, the dirección → área → equipo cascade,
 * sorting, grouping, the active-filter pills, the footer text and the URL
 * codec, so the screen only renders and the rules are testable without a DOM.
 *
 * Counters are reactive: each one is computed with every filter applied EXCEPT
 * the one it belongs to, so it says what tapping it would leave on screen.
 * "En varios equipos" is a property of the person over ALL servicios, not of
 * the filtered subset: someone who serves in two teams stays "in several teams"
 * even while the list is narrowed to one of them.
 */

// ── Input ────────────────────────────────────────────────────────────────

export interface FilaServidor {
  /** Unique per row: the servicio id, or `gdv:<persona>:<equipo>` for a Grupos de Vida person. */
  readonly clave: string
  readonly personaId: PersonaId
  readonly nombre: string
  readonly equipoId: string
  readonly equipoLabel: string
  /** Visible ancestors of the equipo, root first, joined with " · ". Empty for a root. */
  readonly equipoRuta: string
  readonly direccionId: string
  /** The role as displayed ("Coordinador"). */
  readonly rolLabel: string
  readonly estado: DreamTeamEstado
  /** `null` when there is no start date to show (a Grupos de Vida director de etapa has none). */
  readonly fechaInicio: string | null
  readonly telefono: string | null
  /** `null` when the caller cannot see the person's account status (never counted as "sin cuenta"). */
  readonly tieneCuenta: boolean | null
  readonly origen: 'dream_team' | 'grupos_vida'
  readonly servicioId?: string
  readonly version?: number
  /** Whether the row offers actions (a Dream Team servicio the viewer can edit). */
  readonly editable: boolean
  /**
   * Whether the viewer may fix the person's ficha (T11): the volunteer
   * coordinator of the area, org.manage, admin or pastor, for a non-retired
   * servicio. The database checks it again (dream_team_editar_ficha).
   */
  readonly fichaEditable?: boolean
  /** Campus service shifts of a Dream Team servicio; absent or empty = none assigned yet. */
  readonly turnoIds?: readonly string[]
  /** Biweekly shifts of the servicio (T10); a shift with no entry is weekly. */
  readonly frecuencias?: FrecuenciasPorTurno
}

export type Inicio = 'cualquiera' | 'mes' | 'trimestre'
export type Agrupar = 'ninguno' | 'equipo' | 'persona'
export type ColumnaOrden = 'persona' | 'equipo' | 'rol' | 'etapa' | 'inicio'
export type SentidoOrden = 'asc' | 'desc'

export interface FiltrosServidores {
  readonly etapa: DreamTeamEstado | null
  readonly direccion: string | null
  /** An inner node of the dirección (e.g. Waumba Land): keeps its whole subtree. */
  readonly area: string | null
  readonly equipo: string | null
  readonly rol: string | null
  /** A shift id, `SIN_TURNO` for servicios without one, or `null` for no filter. */
  readonly turno: string | null
  readonly inicio: Inicio
  readonly sinCuenta: boolean
  readonly varios: boolean
  readonly q: string
  readonly agrupar: Agrupar
  readonly orden: { readonly columna: ColumnaOrden; readonly sentido: SentidoOrden }
}

export const FILTROS_INICIALES: FiltrosServidores = {
  etapa: null,
  direccion: null,
  area: null,
  equipo: null,
  rol: null,
  turno: null,
  inicio: 'cualquiera',
  sinCuenta: false,
  varios: false,
  q: '',
  agrupar: 'ninguno',
  orden: { columna: 'persona', sentido: 'asc' },
}

export const COLUMNAS_ORDEN: readonly ColumnaOrden[] = ['persona', 'equipo', 'rol', 'etapa', 'inicio']

export const ETIQUETA_COLUMNA: Readonly<Record<ColumnaOrden, string>> = {
  persona: 'Persona',
  equipo: 'Equipo',
  rol: 'Rol',
  etapa: 'Etapa',
  inicio: 'Inicio',
}

// ── Tree index ───────────────────────────────────────────────────────────

export interface NodoIndexado {
  readonly label: string
  /** Id of the root ("dirección") this node hangs from; a root is its own dirección. */
  readonly direccionId: string
  readonly direccionLabel: string
  /** Visible ancestors, root first, joined with " · ". Empty for a root. */
  readonly ruta: string
  /** Ancestor ids, root first. Empty for a root. */
  readonly ancestros: readonly string[]
  /** Labels from below the dirección down to this node. Empty for a root. */
  readonly rutaArea: readonly string[]
  readonly tieneHijos: boolean
}

/** Maps every node id to its label, dirección and ancestor path. */
export function indexarArbol(arbol: readonly NodoArbol<NodoEquipoArbol>[]): ReadonlyMap<string, NodoIndexado> {
  const indice = new Map<string, NodoIndexado>()
  function visitar(
    nodo: NodoArbol<NodoEquipoArbol>,
    raiz: NodoEquipoArbol,
    ancestros: readonly string[],
    ancestroIds: readonly string[],
  ): void {
    const esRaiz = ancestroIds.length === 0
    indice.set(nodo.equipo.id, {
      label: nodo.equipo.label,
      direccionId: raiz.id,
      direccionLabel: raiz.label,
      ruta: ancestros.join(' · '),
      ancestros: ancestroIds,
      rutaArea: esRaiz ? [] : [...ancestros.slice(1), nodo.equipo.label],
      tieneHijos: nodo.hijos.length > 0,
    })
    for (const hijo of nodo.hijos) visitar(hijo, raiz, [...ancestros, nodo.equipo.label], [...ancestroIds, nodo.equipo.id])
  }
  for (const raiz of arbol) visitar(raiz, raiz.equipo, [], [])
  return indice
}

// ── Output ───────────────────────────────────────────────────────────────

export interface FilaVista extends FilaServidor {
  /** Non-retired servicios of this person across every equipo (>= 2 means "en varios equipos"). */
  readonly equiposDeLaPersona: number
  /** The shift names, in campus order, joined with ", "; "—" when none. */
  readonly turnosTexto: string
}

export type ItemLista =
  | { readonly tipo: 'grupo'; readonly clave: string; readonly titulo: string; readonly detalle: string; readonly cantidad: number }
  | { readonly tipo: 'fila'; readonly fila: FilaVista }

export interface Opcion {
  readonly id: string
  readonly label: string
}

export interface OpcionEquipo extends Opcion {
  readonly direccionId: string
}

export interface OpcionArea extends Opcion {
  readonly direccionId: string
  /** Depth below the dirección: 1 for its direct children. */
  readonly nivel: number
}

export interface Pastilla {
  readonly clave: string
  readonly etiqueta: string
  readonly quitarEtiqueta: string
  /** Applying this patch to the filters removes the pill (and whatever depends on it). */
  readonly parche: Partial<FiltrosServidores>
}

export interface VistaServidores {
  /** The filters actually applied (after the equipo → dirección normalization). */
  readonly filtros: FiltrosServidores
  readonly total: { readonly servicios: number; readonly personas: number }
  readonly contadoresEtapa: {
    readonly todas: number
    readonly porEtapa: Readonly<Record<DreamTeamEstado, number>>
  }
  readonly rapidos: {
    readonly sinCuenta: { readonly cantidad: number; readonly activo: boolean }
    readonly varios: { readonly cantidad: number; readonly activo: boolean }
  }
  readonly opciones: {
    readonly direcciones: readonly Opcion[]
    /** Inner nodes of the chosen dirección with servicios below; empty without a dirección. */
    readonly areas: readonly OpcionArea[]
    readonly equipos: readonly OpcionEquipo[]
    readonly roles: readonly Opcion[]
    /** The campus shifts, in campus order; empty when no campus has any. */
    readonly turnos: readonly Opcion[]
  }
  readonly visibles: readonly FilaVista[]
  readonly items: readonly ItemLista[]
  readonly pastillas: readonly Pastilla[]
  /** Active filters that live in the phone sheet: equipo, rol, turno, sin cuenta, en varios equipos. */
  readonly filtrosEnHoja: number
  readonly pie: { readonly resumen: string; readonly orden: string }
}

// ── Text helpers ─────────────────────────────────────────────────────────

const ES = 'es'

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`
}

// ── Rules ────────────────────────────────────────────────────────────────

const MS_DIA = 86_400_000

function coincideTexto(fila: FilaServidor, q: string): boolean {
  const consulta = q.trim()
  if (consulta === '') return true
  if (sinAcentos(fila.nombre).includes(sinAcentos(consulta))) return true
  // Only a query made of phone characters is matched against phones, so a name
  // fragment with a digit never lights up unrelated numbers.
  if (/^[\d\s+()-]+$/.test(consulta) && fila.telefono) {
    const buscado = soloDigitos(consulta)
    if (buscado === '') return false
    const canonico = soloDigitos(normalizarTelefono(fila.telefono) ?? fila.telefono)
    const internacional = canonico.startsWith('0') ? `58${canonico.slice(1)}` : canonico
    return [soloDigitos(fila.telefono), canonico, internacional].some((candidato) => candidato.includes(buscado))
  }
  return false
}

function coincideInicio(fila: FilaServidor, inicio: Inicio, hoy: Date): boolean {
  if (inicio === 'cualquiera') return true
  // No start date: it cannot be "this month" nor "in the last 90 days".
  if (fila.fechaInicio === null) return false
  const fecha = new Date(fila.fechaInicio)
  if (Number.isNaN(fecha.getTime())) return false
  if (inicio === 'mes') {
    return fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth()
  }
  // 'trimestre': the last 90 days.
  return hoy.getTime() - fecha.getTime() <= 90 * MS_DIA
}

type Salvo = 'etapa' | 'sinCuenta' | 'varios' | null

interface Contexto {
  readonly equiposPorPersona: ReadonlyMap<string, number>
  readonly hoy: Date
  readonly indice: ReadonlyMap<string, NodoIndexado>
}

/** Whether `equipoId` is `areaId` or hangs below it. */
function enArea(equipoId: string, areaId: string, indice: ReadonlyMap<string, NodoIndexado>): boolean {
  return equipoId === areaId || (indice.get(equipoId)?.ancestros.includes(areaId) ?? false)
}

function pasa(fila: FilaServidor, f: FiltrosServidores, contexto: Contexto, salvo: Salvo): boolean {
  if (!coincideTexto(fila, f.q)) return false
  if (f.direccion !== null && fila.direccionId !== f.direccion) return false
  if (f.area !== null && !enArea(fila.equipoId, f.area, contexto.indice)) return false
  if (f.equipo !== null && fila.equipoId !== f.equipo) return false
  if (f.rol !== null && fila.rolLabel !== f.rol) return false
  // Shifts are a Dream Team notion: a Grupos de Vida row never matches a shift filter.
  if (f.turno !== null && (fila.origen !== 'dream_team' || !coincideTurno(fila.turnoIds, f.turno))) return false
  if (!coincideInicio(fila, f.inicio, contexto.hoy)) return false
  if (salvo !== 'sinCuenta' && f.sinCuenta && fila.tieneCuenta !== false) return false
  if (salvo !== 'varios' && f.varios && (contexto.equiposPorPersona.get(fila.personaId) ?? 0) < 2) return false
  if (salvo !== 'etapa' && f.etapa !== null && fila.estado !== f.etapa) return false
  return true
}

// ── Sorting ──────────────────────────────────────────────────────────────

const ORDEN_ETAPA: Readonly<Record<DreamTeamEstado, number>> = {
  postulado: 0,
  en_orientacion: 1,
  activo: 2,
  en_pausa: 3,
  inactivo: 4,
  retirado: 5,
}

/**
 * Hierarchy first, then alphabetical: Director (Dream Team) and Director
 * general, Director de etapa, Coordinador, Líder and Entrenador, Aprendiz,
 * the rest.
 */
function rangoDeRol(rol: string): number {
  const clave = sinAcentos(rol)
  if (clave === 'director de etapa') return 1
  if (clave.startsWith('director')) return 0
  if (clave.startsWith('coordinador')) return 2
  if (clave.startsWith('lider') || clave.startsWith('entrenador')) return 3
  if (clave.startsWith('colider') || clave.startsWith('aprendiz')) return 4
  return 5
}

/** Start date as a sortable number; a row without one sorts as the oldest. */
function marcaDeInicio(fila: FilaServidor): number {
  return fila.fechaInicio === null ? Number.MIN_SAFE_INTEGER : new Date(fila.fechaInicio).getTime()
}

function compararRol(a: string, b: string): number {
  return rangoDeRol(a) - rangoDeRol(b) || a.localeCompare(b, ES)
}

function comparar(columna: ColumnaOrden): (a: FilaServidor, b: FilaServidor) => number {
  switch (columna) {
    case 'equipo':
      return (a, b) => a.equipoLabel.localeCompare(b.equipoLabel, ES)
    case 'rol':
      return (a, b) => compararRol(a.rolLabel, b.rolLabel)
    case 'etapa':
      return (a, b) => ORDEN_ETAPA[a.estado] - ORDEN_ETAPA[b.estado]
    case 'inicio':
      return (a, b) => marcaDeInicio(a) - marcaDeInicio(b)
    case 'persona':
      return () => 0
  }
}

function ordenar(filas: readonly FilaVista[], orden: FiltrosServidores['orden']): FilaVista[] {
  const primaria = comparar(orden.columna)
  const signo = orden.sentido === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    const valor =
      primaria(a, b) ||
      a.nombre.localeCompare(b.nombre, ES) ||
      a.equipoLabel.localeCompare(b.equipoLabel, ES) ||
      a.clave.localeCompare(b.clave)
    return valor * signo
  })
}

// ── Grouping ─────────────────────────────────────────────────────────────

function agrupar(filas: readonly FilaVista[], como: Agrupar): ItemLista[] {
  if (como === 'ninguno') return filas.map((fila) => ({ tipo: 'fila', fila }))

  const grupos = new Map<string, { titulo: string; filas: FilaVista[] }>()
  for (const fila of filas) {
    const clave = como === 'equipo' ? fila.equipoId : fila.personaId
    const titulo = como === 'equipo' ? fila.equipoLabel : fila.nombre
    const grupo = grupos.get(clave)
    if (grupo) grupo.filas.push(fila)
    else grupos.set(clave, { titulo, filas: [fila] })
  }

  const items: ItemLista[] = []
  const ordenados = [...grupos.entries()].sort(([, a], [, b]) => a.titulo.localeCompare(b.titulo, ES))
  for (const [clave, grupo] of ordenados) {
    const cantidad = grupo.filas.length
    items.push({
      tipo: 'grupo',
      clave,
      titulo: grupo.titulo,
      detalle: como === 'equipo' ? plural(cantidad, 'persona', 'personas') : plural(cantidad, 'servicio', 'servicios'),
      cantidad,
    })
    for (const fila of grupo.filas) items.push({ tipo: 'fila', fila })
  }
  return items
}

// ── Filters: cascade and pills ───────────────────────────────────────────

/**
 * An equipo or an área fixes its dirección: the dirección follows them, never
 * the other way round. An equipo outside the área drops the área.
 */
function normalizarFiltros(
  pedidos: FiltrosServidores,
  indice: ReadonlyMap<string, NodoIndexado>,
  filas: readonly FilaServidor[],
): FiltrosServidores {
  let filtros = pedidos
  if (filtros.area !== null && filtros.equipo !== null && indice.has(filtros.equipo) && !enArea(filtros.equipo, filtros.area, indice)) {
    filtros = { ...filtros, area: null }
  }
  if (filtros.area !== null) {
    const direccion = indice.get(filtros.area)?.direccionId
    if (direccion !== undefined) filtros = { ...filtros, direccion }
  }
  if (filtros.equipo === null) return filtros
  const direccion =
    indice.get(filtros.equipo)?.direccionId ?? filas.find((fila) => fila.equipoId === filtros.equipo)?.direccionId
  return direccion === undefined ? filtros : { ...filtros, direccion }
}

/** The patch that picks an equipo: it also sets that equipo's dirección. */
export function parcheElegirEquipo(equipoId: string | null, opciones: readonly OpcionEquipo[]): Partial<FiltrosServidores> {
  if (equipoId === null) return { equipo: null }
  const direccion = opciones.find((opcion) => opcion.id === equipoId)?.direccionId
  return direccion === undefined ? { equipo: equipoId } : { equipo: equipoId, direccion }
}

/** The patch that picks a dirección: the área and the equipo are dropped, their options change with it. */
export function parcheElegirDireccion(direccionId: string | null): Partial<FiltrosServidores> {
  return { direccion: direccionId, area: null, equipo: null }
}

/** The patch that picks an área: the equipo is dropped and the dirección follows the área. */
export function parcheElegirArea(areaId: string | null, opciones: readonly OpcionArea[]): Partial<FiltrosServidores> {
  if (areaId === null) return { area: null, equipo: null }
  const direccion = opciones.find((opcion) => opcion.id === areaId)?.direccionId
  return direccion === undefined ? { area: areaId, equipo: null } : { area: areaId, equipo: null, direccion }
}

/** "Waumba Land › Sala B". */
function etiquetaArea(nodo: NodoIndexado | undefined, id: string): string {
  return nodo && nodo.rutaArea.length > 0 ? nodo.rutaArea.join(' › ') : (nodo?.label ?? id)
}

function textoOrden(orden: FiltrosServidores['orden']): string {
  return `${ETIQUETA_COLUMNA[orden.columna].toLowerCase()}, ${orden.sentido === 'asc' ? 'ascendente' : 'descendente'}`
}

const ETIQUETA_INICIO: Readonly<Record<Exclude<Inicio, 'cualquiera'>, string>> = {
  mes: 'Inicio: este mes',
  trimestre: 'Inicio: últimos 3 meses',
}

function construirPastillas(
  f: FiltrosServidores,
  direccionLabel: (id: string) => string,
  areaLabel: (id: string) => string,
  equipoLabel: (id: string) => string,
  turnoLabel: (id: string) => string,
): Pastilla[] {
  const pastillas: Pastilla[] = []
  function agregar(clave: string, etiqueta: string, parche: Partial<FiltrosServidores>): void {
    pastillas.push({ clave, etiqueta, quitarEtiqueta: `Quitar el filtro ${etiqueta}`, parche })
  }
  if (f.etapa !== null) agregar('etapa', `Etapa: ${ESTADO_LABELS[f.etapa]}`, { etapa: null })
  if (f.direccion !== null) agregar('direccion', direccionLabel(f.direccion), { direccion: null, area: null, equipo: null })
  if (f.area !== null) agregar('area', `Área: ${areaLabel(f.area)}`, { area: null, equipo: null })
  if (f.equipo !== null) agregar('equipo', `Equipo: ${equipoLabel(f.equipo)}`, { equipo: null })
  if (f.rol !== null) agregar('rol', `Rol: ${f.rol}`, { rol: null })
  if (f.turno !== null) agregar('turno', f.turno === SIN_TURNO ? 'Sin turno' : `Turno: ${turnoLabel(f.turno)}`, { turno: null })
  if (f.inicio !== 'cualquiera') agregar('inicio', ETIQUETA_INICIO[f.inicio], { inicio: 'cualquiera' })
  if (f.sinCuenta) agregar('sin_cuenta', 'Sin cuenta', { sinCuenta: false })
  if (f.varios) agregar('varios', 'En varios equipos', { varios: false })
  if (f.q.trim() !== '') agregar('q', `«${f.q.trim()}»`, { q: '' })
  return pastillas
}

/** The shift names of a servicio in campus order; "—" when it has none (or is not a Dream Team row). */
function textoDeTurnos(
  turnoIds: readonly string[] | undefined,
  turnos: readonly Turno[],
  frecuencias: FrecuenciasPorTurno | undefined,
  hoy: Date,
): string {
  if (!turnoIds || turnoIds.length === 0) return SIN_TURNOS_TEXTO
  const nombres = turnos
    .filter((turno) => turnoIds.includes(turno.id))
    .map((turno) => nombreConFrecuencia(turno.nombre, frecuencias?.[turno.id], isoLocal(hoy)))
  return nombres.length > 0 ? nombres.join(', ') : SIN_TURNOS_TEXTO
}

export const SIN_TURNOS_TEXTO = '—'

// ── The view ─────────────────────────────────────────────────────────────

export interface EntradaVistaServidores {
  readonly filas: readonly FilaServidor[]
  readonly arbol: readonly NodoArbol<NodoEquipoArbol>[]
  readonly filtros: FiltrosServidores
  /** Injected so tests do not depend on the clock. */
  readonly hoy?: Date
  /** Every active shift: names the shift column, and (by campus) the filter options. */
  readonly turnos?: readonly Turno[]
  /** The campus selected in the app; the filter offers only its shifts. `null` = every campus. */
  readonly campusId?: string | null
}

export function calcularVistaServidores({
  filas,
  arbol,
  filtros: pedidos,
  hoy = new Date(),
  turnos = [],
  campusId = null,
}: EntradaVistaServidores): VistaServidores {
  const indice = indexarArbol(arbol)
  const filtros = normalizarFiltros(pedidos, indice, filas)

  const equiposPorPersona = new Map<string, number>()
  for (const fila of filas) {
    if (fila.estado === 'retirado') continue
    equiposPorPersona.set(fila.personaId, (equiposPorPersona.get(fila.personaId) ?? 0) + 1)
  }
  const contexto: Contexto = { equiposPorPersona, hoy, indice }
  const turnosOrdenados = ordenarTurnos(turnos)
  const conVista = (fila: FilaServidor): FilaVista => ({
    ...fila,
    equiposDeLaPersona: equiposPorPersona.get(fila.personaId) ?? 0,
    turnosTexto: textoDeTurnos(fila.turnoIds, turnosOrdenados, fila.frecuencias, hoy),
  })

  // Counters: every filter except the one the counter belongs to.
  const sinEtapa = filas.filter((fila) => pasa(fila, filtros, contexto, 'etapa'))
  const porEtapa = Object.fromEntries(DREAM_TEAM_ESTADOS.map((estado) => [estado, 0])) as Record<DreamTeamEstado, number>
  for (const fila of sinEtapa) porEtapa[fila.estado] += 1

  const cantidadSinCuenta = filas.filter((fila) => pasa(fila, filtros, contexto, 'sinCuenta') && fila.tieneCuenta === false).length
  const cantidadVarios = filas.filter(
    (fila) => pasa(fila, filtros, contexto, 'varios') && (equiposPorPersona.get(fila.personaId) ?? 0) >= 2,
  ).length

  // Options: dirección → equipo cascade, roles present.
  const direccionesConServicios = new Map<string, string>()
  const equiposConServicios = new Map<string, OpcionEquipo>()
  for (const fila of filas) {
    direccionesConServicios.set(fila.direccionId, indice.get(fila.direccionId)?.label ?? fila.direccionId)
    if (!equiposConServicios.has(fila.equipoId)) {
      equiposConServicios.set(fila.equipoId, { id: fila.equipoId, label: fila.equipoLabel, direccionId: fila.direccionId })
    }
  }
  const porLabel = (a: Opcion, b: Opcion): number => a.label.localeCompare(b.label, ES)
  const direcciones = [...direccionesConServicios].map(([id, label]) => ({ id, label })).sort(porLabel)
  const areasConServicios = new Map<string, OpcionArea>()
  if (filtros.direccion !== null) {
    for (const fila of filas) {
      if (fila.direccionId !== filtros.direccion) continue
      const nodo = indice.get(fila.equipoId)
      if (!nodo) continue
      for (const id of [...nodo.ancestros.slice(1), fila.equipoId]) {
        const area = indice.get(id)
        if (!area || area.rutaArea.length === 0 || !area.tieneHijos || areasConServicios.has(id)) continue
        areasConServicios.set(id, { id, label: etiquetaArea(area, id), direccionId: area.direccionId, nivel: area.rutaArea.length })
      }
    }
  }
  const areas = [...areasConServicios.values()].sort(porLabel)
  let equipos = [...equiposConServicios.values()].filter(
    (equipo) =>
      (filtros.direccion === null || equipo.direccionId === filtros.direccion) &&
      (filtros.area === null || enArea(equipo.id, filtros.area, indice)),
  )
  if (filtros.equipo !== null && !equipos.some((equipo) => equipo.id === filtros.equipo)) {
    // A link to an equipo without servicios still shows its own selection.
    equipos = [
      ...equipos,
      {
        id: filtros.equipo,
        label: indice.get(filtros.equipo)?.label ?? filtros.equipo,
        direccionId: filtros.direccion ?? '',
      },
    ]
  }
  equipos.sort(porLabel)
  const roles = [...new Set(filas.map((fila) => fila.rolLabel))]
    .sort(compararRol)
    .map((rol) => ({ id: rol, label: rol }))
  const opcionesTurno = turnosOrdenados
    .filter((turno) => campusId === null || turno.campusId === campusId)
    .map((turno) => ({ id: turno.id, label: turno.nombre }))

  // Visible rows: sorted, then grouped.
  const visibles = ordenar(
    filas.filter((fila) => pasa(fila, filtros, contexto, null)).map(conVista),
    filtros.orden,
  )
  const personasVisibles = new Set(visibles.map((fila) => fila.personaId)).size

  const etiquetaDireccion = (id: string): string => direccionesConServicios.get(id) ?? indice.get(id)?.label ?? id
  const etiquetaEquipo = (id: string): string => equipos.find((equipo) => equipo.id === id)?.label ?? id
  const etiquetaTurno = (id: string): string => turnosOrdenados.find((turno) => turno.id === id)?.nombre ?? id

  return {
    filtros,
    total: { servicios: filas.length, personas: new Set(filas.map((fila) => fila.personaId)).size },
    contadoresEtapa: { todas: sinEtapa.length, porEtapa },
    rapidos: {
      sinCuenta: { cantidad: cantidadSinCuenta, activo: filtros.sinCuenta },
      varios: { cantidad: cantidadVarios, activo: filtros.varios },
    },
    opciones: { direcciones, areas, equipos, roles, turnos: opcionesTurno },
    visibles,
    items: agrupar(visibles, filtros.agrupar),
    pastillas: construirPastillas(
      filtros,
      etiquetaDireccion,
      (id) => etiquetaArea(indice.get(id), id),
      etiquetaEquipo,
      etiquetaTurno,
    ),
    filtrosEnHoja:
      (filtros.area !== null ? 1 : 0) +
      (filtros.equipo !== null ? 1 : 0) +
      (filtros.rol !== null ? 1 : 0) +
      (filtros.turno !== null ? 1 : 0) +
      (filtros.sinCuenta ? 1 : 0) +
      (filtros.varios ? 1 : 0),
    pie: {
      resumen: `${plural(visibles.length, 'servicio', 'servicios')} · ${plural(personasVisibles, 'persona', 'personas')}`,
      orden: `Orden: ${textoOrden(filtros.orden)}`,
    },
  }
}

// ── URL codec ────────────────────────────────────────────────────────────

/** `URLSearchParams`, Next's `ReadonlyURLSearchParams`, or the plain record a page receives. */
export type ParametrosDeUrl =
  | { get(nombre: string): string | null }
  | Readonly<Record<string, string | readonly string[] | undefined>>

function leer(parametros: ParametrosDeUrl, nombre: string): string | null {
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

function leerOrden(valor: string | null): FiltrosServidores['orden'] {
  if (valor === null) return FILTROS_INICIALES.orden
  const [columna, sentido] = valor.split(':')
  if (!(COLUMNAS_ORDEN as readonly string[]).includes(columna)) return FILTROS_INICIALES.orden
  return { columna: columna as ColumnaOrden, sentido: sentido === 'desc' ? 'desc' : 'asc' }
}

/**
 * Reads the filters from the URL. Accepts the legacy `?estado=` (etapa) that
 * older links use; `?equipo=` keeps its meaning. Invalid values are dropped.
 */
export function leerFiltrosDeUrl(parametros: ParametrosDeUrl): FiltrosServidores {
  const etapa = leer(parametros, 'etapa') ?? leer(parametros, 'estado')
  const inicio = leer(parametros, 'inicio')
  const agruparPor = leer(parametros, 'agrupar')
  return {
    etapa: esEstado(etapa) ? etapa : null,
    direccion: textoOpcional(leer(parametros, 'direccion')),
    area: textoOpcional(leer(parametros, 'area')),
    equipo: textoOpcional(leer(parametros, 'equipo')),
    rol: textoOpcional(leer(parametros, 'rol')),
    turno: textoOpcional(leer(parametros, 'turno')),
    inicio: inicio === 'mes' || inicio === 'trimestre' ? inicio : 'cualquiera',
    sinCuenta: esVerdadero(leer(parametros, 'sin_cuenta')),
    varios: esVerdadero(leer(parametros, 'varios')),
    q: leer(parametros, 'q')?.trim() ?? '',
    agrupar: agruparPor === 'equipo' || agruparPor === 'persona' ? agruparPor : 'ninguno',
    orden: leerOrden(leer(parametros, 'orden')),
  }
}

/** The query string (without `?`) for the filters; defaults are left out. */
export function escribirFiltrosEnUrl(filtros: FiltrosServidores): string {
  const parametros = new URLSearchParams()
  if (filtros.etapa !== null) parametros.set('etapa', filtros.etapa)
  if (filtros.direccion !== null) parametros.set('direccion', filtros.direccion)
  if (filtros.area !== null) parametros.set('area', filtros.area)
  if (filtros.equipo !== null) parametros.set('equipo', filtros.equipo)
  if (filtros.rol !== null) parametros.set('rol', filtros.rol)
  if (filtros.turno !== null) parametros.set('turno', filtros.turno)
  if (filtros.inicio !== 'cualquiera') parametros.set('inicio', filtros.inicio)
  if (filtros.sinCuenta) parametros.set('sin_cuenta', '1')
  if (filtros.varios) parametros.set('varios', '1')
  if (filtros.q.trim() !== '') parametros.set('q', filtros.q.trim())
  if (filtros.agrupar !== 'ninguno') parametros.set('agrupar', filtros.agrupar)
  const { columna, sentido } = filtros.orden
  if (columna !== FILTROS_INICIALES.orden.columna || sentido !== FILTROS_INICIALES.orden.sentido) {
    parametros.set('orden', sentido === 'asc' ? columna : `${columna}:desc`)
  }
  return parametros.toString()
}
