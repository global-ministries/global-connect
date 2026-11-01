/**
 * Estudiantes — the pure view model of the leader list
 * (/estudiantes/grupos/[grupoId], C3b of odd/tasks/estudiantes-fase-b.md;
 * artboards 01 Transit / Inside Out and 05 The Living Room of
 * design/estudiantes-asistencia).
 *
 * - Which meeting opens: Transit / Inside Out the newest row of
 *   estudiantes_grupo_sesiones (a requested one only when it is a row); The
 *   Living Room any past date without turno, the newest meeting by default,
 *   today when there is none. The pills offer this week's meeting and the two
 *   before (Q7, A16).
 * - The row state: presente, ausente, sin marcar, or "nueva" for a visitor
 *   registered at this very meeting (Q4: "Nueva hoy" replaces the marks).
 * - Filters Todos / Sin marcar / Presentes / Ausentes / Visitantes (single
 *   choice, a second tap goes back to Todos) and the search; the title counts
 *   split the list (presentes + ausentes + sin marcar + nuevos = todos).
 * - The "Historial" dots, the toast text and the back control (`?desde=`).
 */
import type { Experiencia } from './grupos-datos'
import type { GrupoMio, Historial, Marca, PersonaLista, Sesion } from './lista-datos'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const ZONA = 'America/Caracas'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

const mayuscula = (texto: string): string => texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1)

function partes(fecha: string): { readonly dow: number; readonly dia: number; readonly mes: number } {
  const d = new Date(`${fecha}T00:00:00Z`)
  return { dow: d.getUTCDay(), dia: d.getUTCDate(), mes: d.getUTCMonth() }
}

/** "Domingo 25 oct". */
export function fechaLarga(fecha: string): string {
  const { dow, dia, mes } = partes(fecha)
  return `${mayuscula(DIAS[dow])} ${dia} ${MESES[mes]}`
}

/** "Jue 29 oct". */
export function fechaCorta(fecha: string): string {
  const { dow, dia, mes } = partes(fecha)
  return `${DIAS_CORTOS[dow]} ${dia} ${MESES[mes]}`
}

/** "09:00:00" → "9:00". */
export function horaCorta(hora: string | null): string | null {
  const m = hora?.match(/^(\d{1,2}):(\d{2})/)
  return m ? `${Number(m[1])}:${m[2]}` : null
}

/** The date line under the title: "Domingo 25 oct · 9:00 · Transit". */
export function lineaReunion({ fecha, hora, ambito }: { readonly fecha: string; readonly hora: string | null; readonly ambito: string }): string {
  return [fechaLarga(fecha), horaCorta(hora), ambito].filter(Boolean).join(' · ')
}

export interface SesionElegida {
  readonly fecha: string
  readonly turnoId: string | null
}

export interface PedidoSesion {
  readonly fecha?: string
  readonly turno?: string
}

/** The meeting the list opens on; `null` when a Transit / Inside Out group has none to mark. */
export function elegirSesion(sesiones: readonly Sesion[], experiencia: Experiencia, pedido: PedidoSesion, hoy: string): SesionElegida | null {
  const fecha = pedido.fecha && FECHA_RE.test(pedido.fecha) ? pedido.fecha : null
  if (experiencia === 'the_living_room') {
    if (fecha && fecha <= hoy) return { fecha, turnoId: null }
    return { fecha: sesiones[0]?.fecha ?? hoy, turnoId: null }
  }
  if (fecha) {
    const pedida = sesiones.find((s) => s.fecha === fecha && (!pedido.turno || s.turnoId === pedido.turno))
    if (pedida) return { fecha: pedida.fecha, turnoId: pedida.turnoId }
  }
  const ultima = sesiones[0]
  return ultima ? { fecha: ultima.fecha, turnoId: ultima.turnoId } : null
}

export interface PastillaReunion {
  readonly fecha: string
  readonly etiqueta: string
}

/** The Living Room: this week's meeting and the two before ("Jue 29 oct · hoy"). */
export function pastillasReunion(sesiones: readonly Sesion[], hoy: string): PastillaReunion[] {
  const fechas = [...new Set(sesiones.map((s) => s.fecha))].slice(0, 3)
  return fechas.map((fecha) => ({ fecha, etiqueta: fecha === hoy ? `${fechaCorta(fecha)} · hoy` : fechaCorta(fecha) }))
}

/** "Cada jueves"; `null` without a weekly day. */
export function pistaDia(diaSemana: number | null): string | null {
  return diaSemana !== null && diaSemana >= 0 && diaSemana <= 6 ? `Cada ${DIAS[diaSemana]}` : null
}

/** Presente / ausente / sin marcar, or "nueva": a visitor registered at this meeting and marked present. */
export type EstadoFila = 'presente' | 'ausente' | 'sin' | 'nueva'

export function estadoFila(persona: Pick<PersonaLista, 'estado' | 'desde'>, marca: Marca | null, fecha: string): EstadoFila {
  if (persona.estado === 'visitante' && persona.desde === fecha && marca === 'presente') return 'nueva'
  if (marca === 'presente') return 'presente'
  if (marca === 'ausente') return 'ausente'
  return 'sin'
}

/** A row as shown: the person and their visible mark (page data or optimistic). */
export interface FilaVista {
  readonly persona: PersonaLista
  readonly marca: Marca | null
  readonly marcadoAt: string | null
  readonly estado: EstadoFila
}

export type FiltroLista = 'todos' | 'sin' | 'presentes' | 'ausentes' | 'visitantes'

export const FILTROS_LISTA: readonly { readonly id: FiltroLista; readonly etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'sin', etiqueta: 'Sin marcar' },
  { id: 'presentes', etiqueta: 'Presentes' },
  { id: 'ausentes', etiqueta: 'Ausentes' },
  { id: 'visitantes', etiqueta: 'Visitantes' },
]

export interface CuentasLista {
  readonly todos: number
  readonly sin: number
  readonly presentes: number
  readonly ausentes: number
  /** Everyone still a visitor (the "Visitantes" pill and section). */
  readonly visitantes: number
  /** Visitors registered at this meeting (the last count of the title). */
  readonly nuevas: number
}

export function contarLista(filas: readonly FilaVista[]): CuentasLista {
  const contar = (f: (fila: FilaVista) => boolean): number => filas.filter(f).length
  return {
    todos: filas.length,
    sin: contar((f) => f.estado === 'sin'),
    presentes: contar((f) => f.estado === 'presente'),
    ausentes: contar((f) => f.estado === 'ausente'),
    visitantes: contar((f) => f.persona.estado === 'visitante'),
    nuevas: contar((f) => f.estado === 'nueva'),
  }
}

export const cantidadFiltro = (cuentas: CuentasLista, filtro: FiltroLista): number => cuentas[filtro]

const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

function pasa(fila: FilaVista, filtro: FiltroLista): boolean {
  switch (filtro) {
    case 'sin':
      return fila.estado === 'sin'
    case 'presentes':
      return fila.estado === 'presente'
    case 'ausentes':
      return fila.estado === 'ausente'
    case 'visitantes':
      return fila.persona.estado === 'visitante'
    default:
      return true
  }
}

/** The two sections ("Integrantes", "Visitantes") after the pill and the search, A–Z. */
export function filtrarLista(filas: readonly FilaVista[], filtro: FiltroLista, q: string): { readonly integrantes: FilaVista[]; readonly visitantes: FilaVista[] } {
  const consulta = normalizar(q)
  const visibles = filas
    .filter((f) => pasa(f, filtro) && (!consulta || normalizar(f.persona.nombre).includes(consulta)))
    .sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre, 'es'))
  return {
    integrantes: visibles.filter((f) => f.persona.estado === 'miembro'),
    visitantes: visibles.filter((f) => f.persona.estado === 'visitante'),
  }
}

/** Single choice; a second tap on the active pill goes back to Todos. */
export function alternarFiltro(actual: FiltroLista, id: FiltroLista): FiltroLista {
  return actual === id ? 'todos' : id
}

/** "9:12" of an instant, in Caracas time. */
export function horaDeInstante(instante: string): string {
  const valores = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instante))
  const parte = (tipo: string): string => valores.find((v) => v.type === tipo)?.value ?? ''
  return `${Number(parte('hour'))}:${parte('minute')}`
}

/** The second line of a row: "Primera vez hoy", "2.ª visita", "Marcado · 9:12", "Sin marcar todavía". */
export function subtituloFila(fila: FilaVista): string {
  if (fila.estado === 'nueva') return 'Primera vez hoy'
  if (fila.persona.estado === 'visitante' && fila.persona.visitas > 0) return `${fila.persona.visitas}.ª visita`
  if (fila.marca && fila.marcadoAt) return `Marcado · ${horaDeInstante(fila.marcadoAt)}`
  if (fila.marca) return 'Marcado'
  return 'Sin marcar todavía'
}

const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] ?? nombre

/** "Camila: presente · guardado", "Daniela: sin marcar". */
export function mensajeMarca(nombre: string, estado: Marca | null): string {
  return estado ? `${primerNombre(nombre)}: ${estado} · guardado` : `${primerNombre(nombre)}: sin marcar`
}

export interface PuntosHistorial {
  readonly puntos: readonly { readonly fecha: string; readonly estado: Marca | null }[]
  readonly presentes: number
  readonly total: number
}

/** One dot per recent meeting (oldest first) and how many were "presente". */
export function puntosHistorial(historial: Historial, personaId: string): PuntosHistorial {
  const estados = historial.estados[personaId] ?? []
  const puntos = historial.reuniones.map((r, i) => ({ fecha: r.fecha, estado: estados[i] ?? null }))
  return { puntos, presentes: puntos.filter((p) => p.estado === 'presente').length, total: puntos.length }
}

export interface DestinoAtras {
  readonly etiqueta: string
  readonly href: string
}

/**
 * The back control: "‹ Grupos" reopens that group's drawer (06 / 07), "‹ En
 * vivo" the live view at the same meeting (C4b: it finds the meeting by
 * `?fecha&turno`), "‹ Estudiantes" otherwise. A leader whose only group is
 * this one is at the root (/estudiantes sends them here), so there is no back
 * control without an origin.
 */
export function destinoAtras({
  desde,
  grupoId,
  esRaiz,
  sesion = null,
}: {
  readonly desde: string | undefined
  readonly grupoId: string
  readonly esRaiz: boolean
  readonly sesion?: SesionElegida | null
}): DestinoAtras | null {
  if (desde === 'grupos') return { etiqueta: 'Grupos', href: `/estudiantes/grupos?grupo=${encodeURIComponent(grupoId)}` }
  if (desde === 'vivo') {
    if (!sesion?.turnoId) return { etiqueta: 'En vivo', href: '/estudiantes/vivo' }
    return { etiqueta: 'En vivo', href: `/estudiantes/vivo?${new URLSearchParams({ fecha: sesion.fecha, turno: sesion.turnoId }).toString()}` }
  }
  return esRaiz ? null : { etiqueta: 'Estudiantes', href: '/estudiantes' }
}

/**
 * "Mi grupo" (/estudiantes): a leader who sees a single group and manages
 * none goes straight to it; that list is then their root.
 */
export function grupoUnico(grupos: readonly GrupoMio[]): GrupoMio | null {
  return grupos.length === 1 && !grupos[0].puedeGestionar ? grupos[0] : null
}
