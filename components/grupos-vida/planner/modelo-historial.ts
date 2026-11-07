/**
 * Planner — the view model of the history panel (T8a of
 * odd/tasks/planner-gdv.md; artboard 09; S13, S15): relative times, days in
 * Caracas time (the church's time zone, as the rest of the app), the
 * filters by director, segment and text, and their options. Pure, no React.
 */
import { normalizar, type PasoHistorial, type SegmentoPlanner } from '@/lib/platform/grupos-vida/planner'

const ZONA = 'America/Caracas'

const DIA = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: ZONA })
const HORA = new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: ZONA })
/** YYYY-MM-DD in Caracas, to compare days. */
const CLAVE_DIA = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ZONA })

const sinPunto = (texto: string): string => texto.replace('.', '')

/** "7 nov". */
export const diaCorto = (fecha: Date): string => sinPunto(DIA.format(fecha))
/** "8:42 p. m.". */
export const horaDelDia = (fecha: Date): string => HORA.format(fecha)

/** "hace 5 s", "hace 3 min", "hace 2 h"; past a day the time (the day heading carries the date). */
export function tiempoPaso(creadoEn: string, ahora: Date): string {
  const fecha = new Date(creadoEn)
  if (Number.isNaN(fecha.getTime())) return ''
  const segundos = Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / 1000))
  if (segundos < 60) return `hace ${segundos} s`
  if (segundos < 60 * 60) return `hace ${Math.floor(segundos / 60)} min`
  if (segundos < 24 * 60 * 60) return `hace ${Math.floor(segundos / 3600)} h`
  return horaDelDia(fecha)
}

export interface DiaHistorial {
  /** "Hoy · 7 nov", "Ayer · 6 nov", "2 nov". */
  readonly titulo: string
  readonly pasos: readonly PasoHistorial[]
}

/** The steps (newest first) by day, in their order. */
export function agruparPorDia(pasos: readonly PasoHistorial[], ahora: Date): DiaHistorial[] {
  const hoy = CLAVE_DIA.format(ahora)
  const ayer = CLAVE_DIA.format(new Date(ahora.getTime() - 24 * 60 * 60 * 1000))
  const dias: { clave: string; titulo: string; pasos: PasoHistorial[] }[] = []
  pasos.forEach((paso) => {
    const fecha = new Date(paso.creado_en)
    const valida = !Number.isNaN(fecha.getTime())
    const clave = valida ? CLAVE_DIA.format(fecha) : ''
    let dia = dias.at(-1)
    if (!dia || dia.clave !== clave) {
      const corto = valida ? diaCorto(fecha) : 'Sin fecha'
      const titulo = clave === hoy ? `Hoy · ${corto}` : clave === ayer ? `Ayer · ${corto}` : corto
      dia = { clave, titulo, pasos: [] }
      dias.push(dia)
    }
    dia.pasos.push(paso)
  })
  return dias.map(({ titulo, pasos: delDia }) => ({ titulo, pasos: delDia }))
}

export interface FiltrosHistorial {
  /** actor_id; '' for everyone. */
  readonly actor: string
  /** segmento id; '' for every segment. */
  readonly segmento: string
  readonly texto: string
}

export const FILTROS_HISTORIAL: FiltrosHistorial = { actor: '', segmento: '', texto: '' }

export function filtrarPasos(pasos: readonly PasoHistorial[], filtros: FiltrosHistorial): PasoHistorial[] {
  const texto = normalizar(filtros.texto)
  return pasos.filter(
    (p) =>
      (!filtros.actor || p.actor_id === filtros.actor) &&
      (!filtros.segmento || p.segmentos.some((s) => s.id === filtros.segmento)) &&
      (!texto || normalizar(`${p.actor_nombre} ${p.descripcion} ${p.deshecho_por_nombre ?? ''}`).includes(texto)),
  )
}

export interface Opcion {
  readonly valor: string
  readonly etiqueta: string
}

/** The directors who have steps in the list, "Tú · <nombre>" first. */
export function opcionesDirector(pasos: readonly PasoHistorial[], usuarioId: string): Opcion[] {
  const actores = new Map<string, string>()
  pasos.forEach((p) => p.actor_id && !actores.has(p.actor_id) && actores.set(p.actor_id, p.actor_nombre))
  const opciones = [...actores].map(([valor, nombre]) => ({ valor, etiqueta: valor === usuarioId ? `Tú · ${nombre}` : nombre }))
  return [
    { valor: '', etiqueta: 'Todos los directores' },
    ...opciones.sort((a, b) => Number(b.valor === usuarioId) - Number(a.valor === usuarioId) || a.etiqueta.localeCompare(b.etiqueta, 'es')),
  ]
}

/** The actor's segments and any other one a listed step touches, by name. */
export function opcionesSegmento(pasos: readonly PasoHistorial[], segmentos: readonly SegmentoPlanner[]): Opcion[] {
  const todos = new Map(segmentos.map((s) => [s.id, s.nombre]))
  pasos.forEach((p) => p.segmentos.forEach((s) => !todos.has(s.id) && todos.set(s.id, s.nombre)))
  const opciones = [...todos].map(([valor, etiqueta]) => ({ valor, etiqueta })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
  return [{ valor: '', etiqueta: 'Todos los segmentos' }, ...opciones]
}

/** Initials for the avatar: "Gladys Suárez" → "GS". */
export const iniciales = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toLocaleUpperCase('es'))
    .join('')
