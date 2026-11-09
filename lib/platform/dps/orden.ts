/**
 * DPS planning — Orden del servicio (/dps/plan, tab «Orden»;
 * odd/tasks/dps-asistencia-pco.md, T13, S10; artboard
 * docs/design-system/prototipos/planificacion-dps/02-plan-domingo-orden.html,
 * the PDF of the 8-nov plan in L9). The order is a list of rows by posicion
 * (dps_orden_leer, supabase/migrations/20261108208000_dps_orden_servicio.sql):
 * headers (Pre servicio, Ensayo general, Banda…) with a fase, and items with
 * título, duración in seconds (edited as m:ss), notas and responsable.
 *
 * Times are never stored; they come from the plan's horarios and llegada:
 *   - 'pre' rows (the items under a header of fase pre) run once from the
 *     llegada, in the first service's column (Montaje 7:00, Reunión general
 *     7:45, Ensayo general 8:00);
 *   - 'servicio' rows repeat at each start (9:15 and 11:15, or one 19:00);
 *   - 'post' rows follow the end of each service.
 * Items before any header belong to the service. The end of each service is
 * its start plus the service rows (the artboard's «termina 10:22 y 12:22»),
 * and the screen warns when the pre servicio or one service runs into the
 * next start. Also the optimistic add / move / edit / remove of the client.
 * Pure: safe on the client.
 */
import { horaCortaSegundos, segundosHora } from './horarios'

export type FaseOrden = 'pre' | 'servicio' | 'post'
export type TipoFilaOrden = 'encabezado' | 'item'

export interface FilaOrden {
  readonly id: string
  readonly posicion: number
  readonly tipo: TipoFilaOrden
  readonly titulo: string
  readonly duracionSeg: number
  readonly notas: string | null
  readonly responsable: string | null
  /** Headers only (items take the fase of the header above them). */
  readonly fase: FaseOrden | null
}

export interface OrdenPlan {
  readonly planId: string
  readonly puedeEditar: boolean
  readonly filas: readonly FilaOrden[]
}

export const FASES: readonly FaseOrden[] = ['pre', 'servicio', 'post']
export const ETIQUETA_FASE: Record<FaseOrden, string> = { pre: 'Antes del servicio', servicio: 'En el servicio', post: 'Después del servicio' }
/** dps_orden_agregar refuses more ('orden_lleno'). */
export const MAX_FILAS_ORDEN = 150

type Objeto = Record<string, unknown>
const objeto = (v: unknown): Objeto | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : null)
const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const entero = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) ? v : 0)
const esFase = (v: unknown): v is FaseOrden => typeof v === 'string' && (FASES as readonly string[]).includes(v)

export function leerFilaOrden(v: unknown): FilaOrden | null {
  const f = objeto(v)
  if (!f || typeof f.id !== 'string' || f.id === '') return null
  const tipo: TipoFilaOrden = f.tipo === 'encabezado' ? 'encabezado' : 'item'
  return {
    id: f.id,
    posicion: entero(f.posicion),
    tipo,
    titulo: typeof f.titulo === 'string' ? f.titulo : '',
    duracionSeg: tipo === 'item' ? Math.max(entero(f.duracion_seg), 0) : 0,
    notas: textoONulo(f.notas),
    responsable: textoONulo(f.responsable),
    fase: tipo === 'encabezado' ? (esFase(f.fase) ? f.fase : 'servicio') : null,
  }
}

/** Reads dps_orden_leer, by posicion. */
export function leerOrden(data: unknown): OrdenPlan {
  const d = objeto(data) ?? {}
  const filas = (Array.isArray(d.items) ? d.items : []).map(leerFilaOrden).filter((f): f is FilaOrden => f !== null)
  return {
    planId: typeof d.plan_id === 'string' ? d.plan_id : '',
    puedeEditar: d.puede_editar === true,
    filas: filas.sort((a, b) => a.posicion - b.posicion),
  }
}

// ── duración ─────────────────────────────────────────────────────────

const DURACION_RE = /^(\d{1,3})(?::([0-5]\d))?$/
/** dps_orden_items.duracion_seg: up to 4 hours. */
export const MAX_DURACION_SEG = 4 * 3600
export const MENSAJE_DURACION = 'Escribe la duración como minutos:segundos, por ejemplo 4:30.'

/** "4:30" → 270, "45" → 2700 (minutes); null when it is not m or m:ss up to 240 minutes. */
export function parsearDuracion(texto: string): number | null {
  const m = DURACION_RE.exec(texto.trim())
  if (!m) return null
  const segundos = Number(m[1]) * 60 + Number(m[2] ?? 0)
  return segundos <= MAX_DURACION_SEG ? segundos : null
}

/** 270 → "4:30", 2700 → "45:00". */
export function formatearDuracion(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
}

/** For the summary: "45 min", "1 h 07 min", "2 h" (rounded to the minute). */
export function duracionLarga(segundos: number): string {
  const minutos = Math.round(segundos / 60)
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}

// ── times ────────────────────────────────────────────────────────────

export interface FilaCalculada {
  readonly fila: FilaOrden
  readonly fase: FaseOrden
  /** One per horario: the start of the row, or null where it does not happen (pre servicio after the first). */
  readonly horas: readonly (string | null)[]
  /** Headers: the length of their items. Items: their own duración. */
  readonly totalSeg: number
}

export interface CalculoOrden {
  readonly filas: readonly FilaCalculada[]
  /** The service rows: the length of each service. */
  readonly servicioSeg: number
  readonly comienzos: readonly string[]
  readonly fines: readonly string[]
  readonly avisos: readonly string[]
}

function fasesDe(filas: readonly FilaOrden[]): FaseOrden[] {
  let actual: FaseOrden = 'servicio'
  return filas.map((f) => {
    if (f.tipo === 'encabezado') actual = f.fase ?? 'servicio'
    return actual
  })
}

function totalesSeccion(filas: readonly FilaOrden[]): number[] {
  const totales = filas.map((f) => (f.tipo === 'item' ? f.duracionSeg : 0))
  let cabeza = -1
  filas.forEach((f, i) => {
    if (f.tipo === 'encabezado') cabeza = i
    else if (cabeza >= 0) totales[cabeza]! += f.duracionSeg
  })
  return totales
}

export function calcularOrden(filas: readonly FilaOrden[], horarios: readonly string[], llegada: string): CalculoOrden {
  const inicios = horarios.map(segundosHora).filter((s): s is number => s !== null)
  const fases = fasesDe(filas)
  const totales = totalesSeccion(filas)
  const servicioSeg = filas.reduce((n, f, i) => n + (f.tipo === 'item' && fases[i] === 'servicio' ? f.duracionSeg : 0), 0)

  let pre = segundosHora(llegada) ?? inicios[0] ?? 0
  const servicio = [...inicios]
  const post = inicios.map((s) => s + servicioSeg)
  let hayPre = false

  const calculadas = filas.map((fila, i): FilaCalculada => {
    const fase = fases[i]!
    const dura = fila.tipo === 'item' ? fila.duracionSeg : 0
    let horas: (string | null)[]
    if (fase === 'pre') {
      hayPre = true
      horas = inicios.map((_, k) => (k === 0 ? horaCortaSegundos(pre) : null))
      pre += dura
    } else {
      const cursores = fase === 'servicio' ? servicio : post
      horas = cursores.map(horaCortaSegundos)
      cursores.forEach((_, k) => (cursores[k]! += dura))
    }
    return { fila, fase, horas, totalSeg: totales[i]! }
  })

  const avisos: string[] = []
  if (hayPre && inicios.length > 0 && pre > inicios[0]!) {
    avisos.push(`El pre servicio termina a las ${horaCortaSegundos(pre)}, después del comienzo del servicio (${horaCortaSegundos(inicios[0]!)}).`)
  }
  inicios.forEach((s, k) => {
    const siguiente = inicios[k + 1]
    if (siguiente !== undefined && s + servicioSeg > siguiente) {
      avisos.push(
        `El servicio de las ${horaCortaSegundos(s)} termina a las ${horaCortaSegundos(s + servicioSeg)}, después del comienzo del de las ${horaCortaSegundos(siguiente)}.`,
      )
    }
  })

  return {
    filas: calculadas,
    servicioSeg,
    comienzos: inicios.map(horaCortaSegundos),
    fines: inicios.map((s) => horaCortaSegundos(s + servicioSeg)),
    avisos,
  }
}

export interface PasoCronograma {
  readonly etiqueta: string
  readonly hora: string
  readonly fin?: string
}

/** The «Horarios» list of the sidebar: llegada, the later pre servicio sections, each service with its end once the order has one. */
export function cronogramaPlan(calculo: CalculoOrden, llegada: string): PasoCronograma[] {
  const inicio = segundosHora(llegada)
  const llegadaCorta = inicio === null ? '' : horaCortaSegundos(inicio)
  const pasos: PasoCronograma[] = llegadaCorta ? [{ etiqueta: 'Llegada del equipo', hora: llegadaCorta }] : []
  for (const f of calculo.filas) {
    const hora = f.horas[0]
    if (f.fila.tipo === 'encabezado' && f.fase === 'pre' && hora && hora !== llegadaCorta) pasos.push({ etiqueta: f.fila.titulo, hora })
  }
  calculo.comienzos.forEach((hora, k) => {
    pasos.push(calculo.servicioSeg > 0 ? { etiqueta: 'Servicio', hora, fin: calculo.fines[k]! } : { etiqueta: 'Servicio', hora })
  })
  return pasos
}

// ── optimistic changes ───────────────────────────────────────────────

const numerar = (filas: readonly FilaOrden[]): FilaOrden[] => filas.map((f, i) => (f.posicion === i ? f : { ...f, posicion: i }))
const acotar = (posicion: number, max: number): number => Math.min(Math.max(posicion, 0), max)

/** The row moved to `destino` (clamped), as dps_orden_mover; the same list when the id is unknown. */
export function moverFila(filas: readonly FilaOrden[], id: string, destino: number): readonly FilaOrden[] {
  const desde = filas.findIndex((f) => f.id === id)
  if (desde === -1) return filas
  const resto = filas.filter((f) => f.id !== id)
  resto.splice(acotar(destino, resto.length), 0, filas[desde]!)
  return numerar(resto)
}

/** The new row at `posicion` (clamped), as dps_orden_agregar. */
export function insertarFila(filas: readonly FilaOrden[], fila: FilaOrden, posicion: number): FilaOrden[] {
  const lista = filas.filter((f) => f.id !== fila.id)
  lista.splice(acotar(posicion, lista.length), 0, fila)
  return numerar(lista)
}

/** The row as saved (dps_orden_item_guardar), in its place. */
export function reemplazarFila(filas: readonly FilaOrden[], fila: FilaOrden): FilaOrden[] {
  return filas.map((f) => (f.id === fila.id ? { ...fila, posicion: f.posicion } : f))
}

export function quitarFila(filas: readonly FilaOrden[], id: string): FilaOrden[] {
  return numerar(filas.filter((f) => f.id !== id))
}

/** Where «+ Elemento» and «+ Encabezado» insert: before the first Post servicio header, else at the end. */
export function posicionNueva(filas: readonly FilaOrden[]): number {
  const post = filas.findIndex((f) => f.tipo === 'encabezado' && f.fase === 'post')
  return post === -1 ? filas.length : post
}

/** The header a row belongs to (itself for a header), or null before any header. */
export function encabezadoDe(filas: readonly FilaOrden[], indice: number): FilaOrden | null {
  for (let i = indice; i >= 0; i -= 1) if (filas[i]?.tipo === 'encabezado') return filas[i]!
  return null
}

/** The live sentence after a move: "Montaje: posición 2 de 3 en Banda", or the header's place in the order. */
export function textoPosicion(filas: readonly FilaOrden[], id: string): string {
  const i = filas.findIndex((f) => f.id === id)
  if (i === -1) return ''
  const fila = filas[i]!
  if (fila.tipo === 'encabezado') return `${fila.titulo}: encabezado, posición ${i + 1} de ${filas.length}`
  let inicio = i
  while (inicio > 0 && filas[inicio - 1]!.tipo === 'item') inicio -= 1
  let fin = i
  while (fin < filas.length - 1 && filas[fin + 1]!.tipo === 'item') fin += 1
  const cabeza = encabezadoDe(filas, i)
  const donde = `posición ${i - inicio + 1} de ${fin - inicio + 1}`
  return cabeza ? `${fila.titulo}: ${donde} en ${cabeza.titulo}` : `${fila.titulo}: ${donde}`
}
