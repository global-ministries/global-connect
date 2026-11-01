/**
 * Estudiantes — the pure view model of the live view /estudiantes/vivo (C4b
 * of odd/tasks/estudiantes-fase-b.md; artboards 03 desktop and 04 phone of
 * design/estudiantes-asistencia).
 *
 * - Which meeting opens (`?ambito&campus&fecha&turno`): the requested one when
 *   it is an option (date and turno alone are enough: the "‹ En vivo" of a
 *   leader list), else today, else the newest; the ámbito and meeting pickers.
 * - The estado of each group: Sin marcar (nobody marked yet), Faltan N,
 *   Completo, or Sin integrantes.
 * - The attention metrics Presentes · Visitantes · Grupos sin marcar ·
 *   Ausentes (each toggles a filter), the sub-área cards, the search (group
 *   and leader names), the Estado del grupo filter and the three sorts. The
 *   filters live in the URL next to the selection.
 * - The live indicator ("En vivo · Actualizado hace 10 s", G4) and the new
 *   visitors between two refreshes (announced with a toast, Q5).
 */
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'

import { fechaLarga, horaCorta } from './lista-vista'
import type { DatosVivo, GrupoVivo, OpcionVivo, VisitanteHoy } from './vivo-datos'

type Tono = 'success' | 'warning' | 'info' | 'danger' | 'muted'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const comparar = (a: string, b: string): number => a.localeCompare(b, 'es')

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

// ── selection ───────────────────────────────────────────────────────────

export interface PedidoVivo {
  readonly ambito?: string
  readonly campus?: string
  readonly fecha?: string
  readonly turno?: string
}

/** Today first, else the newest date; ties keep the RPC order. */
function preferida(opciones: readonly OpcionVivo[], hoy: string): OpcionVivo | null {
  const deHoy = opciones.find((o) => o.fecha === hoy)
  if (deHoy) return deHoy
  return opciones.reduce<OpcionVivo | null>((mejor, o) => (mejor === null || o.fecha > mejor.fecha ? o : mejor), null)
}

/**
 * The meeting the view opens on: every requested key that matches, else the
 * requested ámbito (and campus), else every option; among them today, else
 * the newest. `null` without options.
 */
export function elegirOpcion(opciones: readonly OpcionVivo[], pedido: PedidoVivo, hoy: string): OpcionVivo | null {
  const fecha = pedido.fecha && FECHA_RE.test(pedido.fecha) ? pedido.fecha : undefined
  const coincide = (o: OpcionVivo, claves: PedidoVivo): boolean =>
    (!claves.ambito || o.ambitoId === claves.ambito) &&
    (!claves.campus || o.campusId === claves.campus) &&
    (!claves.fecha || o.fecha === claves.fecha) &&
    (!claves.turno || o.turnoId === claves.turno)

  const todas = opciones.filter((o) => coincide(o, { ...pedido, fecha }))
  if (todas.length > 0 && (pedido.ambito || pedido.campus || fecha || pedido.turno)) return preferida(todas, hoy)
  const delAmbito = pedido.ambito ? opciones.filter((o) => coincide(o, { ambito: pedido.ambito, campus: pedido.campus })) : []
  if (delAmbito.length > 0) return preferida(delAmbito, hoy)
  return preferida(opciones, hoy)
}

export interface OpcionSelector {
  readonly valor: string
  readonly etiqueta: string
}

export const valorAmbito = (o: Pick<OpcionVivo, 'ambitoId' | 'campusId'>): string => `${o.ambitoId}|${o.campusId}`
export const valorReunion = (o: Pick<OpcionVivo, 'fecha' | 'turnoId'>): string => `${o.fecha}|${o.turnoId}`

/** Each ámbito (and campus) once; the campus shows only when the user sees more than one. */
export function opcionesAmbito(opciones: readonly OpcionVivo[]): OpcionSelector[] {
  const variosCampus = new Set(opciones.map((o) => o.campusId)).size > 1
  const vistos = new Map<string, OpcionSelector>()
  for (const o of opciones) {
    const valor = valorAmbito(o)
    if (!vistos.has(valor)) vistos.set(valor, { valor, etiqueta: variosCampus ? `${o.ambito} · ${o.campus}` : o.ambito })
  }
  return [...vistos.values()]
}

/** The meetings of the current ámbito, newest first: "Domingo 25 oct · 9:00" (+ the turno when a date has two). */
export function opcionesReunion(opciones: readonly OpcionVivo[], actual: OpcionVivo): OpcionSelector[] {
  const delAmbito = opciones.filter((o) => valorAmbito(o) === valorAmbito(actual))
  const porFecha = new Map<string, number>()
  for (const o of delAmbito) porFecha.set(o.fecha, (porFecha.get(o.fecha) ?? 0) + 1)
  return delAmbito.map((o) => ({
    valor: valorReunion(o),
    etiqueta: [fechaLarga(o.fecha), horaCorta(o.hora), (porFecha.get(o.fecha) ?? 0) > 1 ? o.turno : null].filter(Boolean).join(' · '),
  }))
}

// ── filters ─────────────────────────────────────────────────────────────

export type MetricaVivo = 'presentes' | 'visitantes' | 'sin_marcar' | 'ausentes'
export type FiltroEstado = 'todos' | 'sin_marcar' | 'faltan' | 'completo'
export type OrdenVivo = 'atencion' | 'nombre' | 'asistencia'

const METRICAS: readonly MetricaVivo[] = ['presentes', 'visitantes', 'sin_marcar', 'ausentes']
export const ESTADOS_FILTRO: readonly FiltroEstado[] = ['todos', 'sin_marcar', 'faltan', 'completo']
export const ORDENES_VIVO: readonly OrdenVivo[] = ['atencion', 'nombre', 'asistencia']

export const ETIQUETA_ESTADO_FILTRO: Readonly<Record<FiltroEstado, string>> = {
  todos: 'Todos',
  sin_marcar: 'Sin marcar',
  faltan: 'Faltan',
  completo: 'Completo',
}

export const ETIQUETA_ORDEN_VIVO: Readonly<Record<OrdenVivo, string>> = {
  atencion: 'Sin marcar primero',
  nombre: 'Grupo A–Z',
  asistencia: 'Más presentes',
}

const PIE_ORDEN: Readonly<Record<OrdenVivo, string>> = {
  atencion: 'Orden: sin marcar primero',
  nombre: 'Orden: grupo A–Z',
  asistencia: 'Orden: más presentes primero',
}

export interface FiltrosVivo {
  /** The sub-área label, or `null` for the whole ámbito. */
  readonly area: string | null
  readonly metrica: MetricaVivo | null
  readonly estado: FiltroEstado
  readonly orden: OrdenVivo
  readonly q: string
}

export const FILTROS_VIVO_INICIALES: FiltrosVivo = { area: null, metrica: null, estado: 'todos', orden: 'atencion', q: '' }

/** What "Limpiar" in the filters sheet resets. */
export const LIMPIAR_HOJA_VIVO: Partial<FiltrosVivo> = { estado: 'todos', orden: 'atencion' }

export type ParametrosVivo = Readonly<Record<string, string | readonly string[] | undefined>>

export const primerParametro = (valor: string | readonly string[] | undefined): string | undefined =>
  typeof valor === 'string' ? valor : valor?.[0]

export function leerFiltrosVivo(parametros: ParametrosVivo): FiltrosVivo {
  const metrica = primerParametro(parametros.metrica)
  const estado = primerParametro(parametros.estado)
  const orden = primerParametro(parametros.orden)
  return {
    area: primerParametro(parametros.area) || null,
    metrica: METRICAS.includes(metrica as MetricaVivo) ? (metrica as MetricaVivo) : null,
    estado: ESTADOS_FILTRO.includes(estado as FiltroEstado) ? (estado as FiltroEstado) : 'todos',
    orden: ORDENES_VIVO.includes(orden as OrdenVivo) ? (orden as OrdenVivo) : 'atencion',
    q: primerParametro(parametros.q) ?? '',
  }
}

/** `ambito&campus&fecha&turno`, then the filters that differ from the default. */
export function consultaVivo(opcion: OpcionVivo, filtros: FiltrosVivo): string {
  const consulta = new URLSearchParams({ ambito: opcion.ambitoId, campus: opcion.campusId, fecha: opcion.fecha, turno: opcion.turnoId })
  if (filtros.area) consulta.set('area', filtros.area)
  if (filtros.metrica) consulta.set('metrica', filtros.metrica)
  if (filtros.estado !== 'todos') consulta.set('estado', filtros.estado)
  if (filtros.orden !== 'atencion') consulta.set('orden', filtros.orden)
  if (filtros.q.trim()) consulta.set('q', filtros.q.trim())
  return consulta.toString()
}

/** "Ver la lista": the group's leader list at this meeting, with "‹ En vivo" back here. */
export function enlaceLista(grupoId: string, opcion: Pick<OpcionVivo, 'fecha' | 'turnoId'>): string {
  const consulta = new URLSearchParams({ desde: 'vivo', fecha: opcion.fecha, turno: opcion.turnoId })
  return `/estudiantes/grupos/${encodeURIComponent(grupoId)}?${consulta.toString()}`
}

// ── groups ──────────────────────────────────────────────────────────────

export type EstadoGrupoVivo = 'sin_marcar' | 'faltan' | 'completo' | 'vacio'

/** The roster of the meeting: marked people plus active members without a mark. */
export const inscritosDe = (g: GrupoVivo): number => g.presentes + g.ausentes + g.sinMarcar

export function estadoGrupo(g: GrupoVivo): EstadoGrupoVivo {
  if (inscritosDe(g) === 0) return 'vacio'
  if (g.presentes + g.ausentes === 0) return 'sin_marcar'
  return g.sinMarcar > 0 ? 'faltan' : 'completo'
}

export function etiquetaEstado(g: GrupoVivo): { readonly tono: Tono; readonly texto: string } {
  switch (estadoGrupo(g)) {
    case 'sin_marcar':
      return { tono: 'warning', texto: 'Sin marcar' }
    case 'faltan':
      return { tono: 'info', texto: `Faltan ${g.sinMarcar}` }
    case 'completo':
      return { tono: 'success', texto: 'Completo' }
    default:
      return { tono: 'muted', texto: 'Sin integrantes' }
  }
}

const PESO_ESTADO: Readonly<Record<EstadoGrupoVivo, number>> = { sin_marcar: 0, faltan: 1, completo: 2, vacio: 3 }

const proporcion = (g: GrupoVivo): number => (inscritosDe(g) > 0 ? g.presentes / inscritosDe(g) : 0)

function ordenar(grupos: readonly GrupoVivo[], orden: OrdenVivo): GrupoVivo[] {
  const porNombre = (a: GrupoVivo, b: GrupoVivo): number => comparar(a.nombre, b.nombre)
  const copia = [...grupos]
  if (orden === 'nombre') return copia.sort(porNombre)
  if (orden === 'asistencia') return copia.sort((a, b) => proporcion(b) - proporcion(a) || porNombre(a, b))
  return copia.sort((a, b) => PESO_ESTADO[estadoGrupo(a)] - PESO_ESTADO[estadoGrupo(b)] || porNombre(a, b))
}

function pasaMetrica(g: GrupoVivo, metrica: MetricaVivo | null): boolean {
  switch (metrica) {
    case 'presentes':
      return g.presentes > 0
    case 'visitantes':
      return g.visitantes > 0
    case 'sin_marcar':
      return estadoGrupo(g) === 'sin_marcar'
    case 'ausentes':
      return g.ausentes > 0
    default:
      return true
  }
}

export interface TotalesVivo {
  readonly grupos: number
  readonly inscritos: number
  /** In the room: members and visitors. */
  readonly presentes: number
  /** Present members (not visitors). */
  readonly presentesInscritos: number
  readonly visitantes: number
  readonly ausentes: number
  readonly sinMarcar: number
  readonly gruposSinMarcar: number
}

function totalesDe(grupos: readonly GrupoVivo[]): TotalesVivo {
  const t = { grupos: grupos.length, inscritos: 0, presentes: 0, presentesInscritos: 0, visitantes: 0, ausentes: 0, sinMarcar: 0, gruposSinMarcar: 0 }
  for (const g of grupos) {
    t.inscritos += inscritosDe(g)
    t.presentes += g.presentes
    t.visitantes += g.visitantes
    t.ausentes += g.ausentes
    t.sinMarcar += g.sinMarcar
    if (estadoGrupo(g) === 'sin_marcar') t.gruposSinMarcar += 1
  }
  t.presentesInscritos = Math.max(0, t.presentes - t.visitantes)
  return t
}

export interface MetricaVista {
  readonly id: MetricaVivo
  readonly etiqueta: string
  readonly valor: number
  readonly total?: number
  readonly pista: string
  readonly tono: Exclude<Tono, 'muted'>
  readonly activa: boolean
}

export interface AreaVivo {
  readonly id: string
  readonly label: string
  readonly grupos: number
  readonly inscritos: number
  readonly presentes: number
  readonly ausentes: number
  readonly sinMarcar: number
  readonly visitantes: number
  readonly gruposSinMarcar: number
}

export interface VistaVivo {
  /** The filters in force (an área not in the meeting is dropped). */
  readonly filtros: FiltrosVivo
  /** The ámbito, or the sub-área when one is chosen. */
  readonly titulo: string
  readonly totales: TotalesVivo
  readonly metricas: readonly MetricaVista[]
  /** One card per sub-área; empty with a single one or inside one. */
  readonly areas: readonly AreaVivo[]
  readonly visibles: readonly GrupoVivo[]
  /** "Visitantes de hoy" of the scope, newest first. */
  readonly visitantes: readonly VisitanteHoy[]
  readonly cuentasEstado: Readonly<Record<FiltroEstado, number>>
  /** Active filters inside the sheet (Estado del grupo, Ordenar por). */
  readonly filtrosEnHoja: number
  readonly pie: { readonly resumen: string; readonly orden: string }
}

export function calcularVistaVivo({ datos, ambito, filtros: pedidos }: { readonly datos: DatosVivo; readonly ambito: string; readonly filtros: FiltrosVivo }): VistaVivo {
  const subareas = [...new Set(datos.grupos.map((g) => g.subarea))]
  const area = pedidos.area && subareas.includes(pedidos.area) ? pedidos.area : null
  const filtros: FiltrosVivo = { ...pedidos, area }

  const enAlcance = datos.grupos.filter((g) => !area || g.subarea === area)
  const totales = totalesDe(enAlcance)
  const idsAlcance = new Set(enAlcance.map((g) => g.grupoId))
  const visitantes = datos.visitantesHoy.filter((v) => !area || (v.grupoId !== null && idsAlcance.has(v.grupoId)))
  const nuevos = visitantes.filter((v) => v.esNuevo).length
  const pct = totales.inscritos > 0 ? Math.round((totales.presentes / totales.inscritos) * 100) : 0

  const metricas: MetricaVista[] = [
    { id: 'presentes', etiqueta: 'Presentes', valor: totales.presentes, total: totales.inscritos, pista: `${pct}% de ${totales.inscritos} inscritos`, tono: 'success', activa: false },
    { id: 'visitantes', etiqueta: 'Visitantes', valor: totales.visitantes, pista: `${nuevos} por primera vez`, tono: 'info', activa: false },
    { id: 'sin_marcar', etiqueta: 'Grupos sin marcar', valor: totales.gruposSinMarcar, total: totales.grupos, pista: 'Avísale a su entrenador', tono: 'warning', activa: false },
    { id: 'ausentes', etiqueta: 'Ausentes', valor: totales.ausentes, total: totales.inscritos, pista: 'Para contactar esta semana', tono: 'danger', activa: false },
  ].map((m) => ({ ...m, activa: m.id === filtros.metrica }) as MetricaVista)

  const areas: AreaVivo[] =
    area || subareas.length < 2
      ? []
      : subareas.map((label) => {
          const t = totalesDe(datos.grupos.filter((g) => g.subarea === label))
          return {
            id: label,
            label,
            grupos: t.grupos,
            inscritos: t.inscritos,
            presentes: t.presentes,
            ausentes: t.ausentes,
            sinMarcar: t.sinMarcar,
            visitantes: t.visitantes,
            gruposSinMarcar: t.gruposSinMarcar,
          }
        })

  const consulta = normalizar(filtros.q)
  const buscados = consulta ? enAlcance.filter((g) => [g.nombre, ...g.lideres].some((n) => normalizar(n).includes(consulta))) : enAlcance
  const porMetrica = buscados.filter((g) => pasaMetrica(g, filtros.metrica))
  const cuentasEstado: Record<FiltroEstado, number> = {
    todos: porMetrica.length,
    sin_marcar: porMetrica.filter((g) => estadoGrupo(g) === 'sin_marcar').length,
    faltan: porMetrica.filter((g) => estadoGrupo(g) === 'faltan').length,
    completo: porMetrica.filter((g) => estadoGrupo(g) === 'completo').length,
  }
  const visibles = ordenar(
    porMetrica.filter((g) => filtros.estado === 'todos' || estadoGrupo(g) === filtros.estado),
    filtros.orden,
  )

  return {
    filtros,
    titulo: area ?? ambito,
    totales,
    metricas,
    areas,
    visibles,
    visitantes,
    cuentasEstado,
    filtrosEnHoja: (filtros.estado !== 'todos' ? 1 : 0) + (filtros.orden !== 'atencion' ? 1 : 0),
    pie: {
      resumen: `${visibles.length} de ${plural(totales.grupos, 'grupo', 'grupos')} · ${totales.inscritos} inscritos`,
      orden: PIE_ORDEN[filtros.orden],
    },
  }
}

// ── live indicator and new visitors ─────────────────────────────────────

/** "ahora", "hace 10 s", "hace 2 min". */
export function textoHace(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  if (s < 1) return 'ahora'
  if (s < 60) return `hace ${s} s`
  return `hace ${Math.floor(s / 60)} min`
}

/** G4: green while it refreshes; muted while the tab is hidden or the last refresh failed. */
export function indicadorVivo({ segundos, oculto, fallo }: { readonly segundos: number; readonly oculto: boolean; readonly fallo: boolean }): {
  readonly tono: 'success' | 'muted'
  readonly texto: string
} {
  const actualizado = `Actualizado ${textoHace(segundos)}`
  if (oculto) return { tono: 'muted', texto: `En pausa · ${actualizado}` }
  if (fallo) return { tono: 'muted', texto: `Reintentando · ${actualizado}` }
  return { tono: 'success', texto: `En vivo · ${actualizado}` }
}

const claveVisitante = (v: VisitanteHoy): string => `${v.personaId}|${v.grupoId ?? ''}`

/** The visitors of `actuales` that `previos` did not have; none on the first load (`previos` null). */
export function nuevosVisitantes(previos: readonly VisitanteHoy[] | null, actuales: readonly VisitanteHoy[]): VisitanteHoy[] {
  if (previos === null) return []
  const antes = new Set(previos.map(claveVisitante))
  return actuales.filter((v) => !antes.has(claveVisitante(v)))
}

/** One toast per new visitor, up to three; more become one count. */
export function mensajesNuevosVisitantes(nuevos: readonly VisitanteHoy[]): string[] {
  if (nuevos.length > 3) return [`${nuevos.length} visitantes nuevos. Míralos en «Visitantes de hoy».`]
  return nuevos.map((v) => (v.grupo ? `Nuevo visitante: ${v.nombre} en ${v.grupo}` : `Nuevo visitante: ${v.nombre}`))
}

/** "Registró Diego Carrasco · 9:38". */
export function lineaVisitante(v: Pick<VisitanteHoy, 'registradoPor' | 'registradoAt'>): string {
  return [v.registradoPor ? `Registró ${v.registradoPor}` : null, horaCorta(horaEnCaracas(v.registradoAt) || null)].filter(Boolean).join(' · ')
}
