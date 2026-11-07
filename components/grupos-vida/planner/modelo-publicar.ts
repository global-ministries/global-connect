/**
 * Planner — the view model of the publish review (T8a of
 * odd/tasks/planner-gdv.md; artboard 04; S6, S8, S12, S14, S19): why the
 * publish button is disabled, each segment's state, what publishing does
 * and the success line. Pure, no React; the words follow planner_publicar
 * (supabase/migrations/20261107120000_planner_temporada.sql).
 */
import { contar, enLista, type EstadoPublicacion, type SegmentoPublicacion } from '@/lib/platform/grupos-vida/planner'
import type { TemporadaPublicada } from '@/lib/platform/grupos-vida/planner/acciones'

import { diaCorto, horaDelDia } from './modelo-historial'

/** The segments with groups that their director de etapa has not marked yet (S14). */
export const segmentosSinTerminar = (estado: EstadoPublicacion): SegmentoPublicacion[] => estado.segmentos.filter((s) => s.grupos > 0 && !s.terminado)

/** Why "Publicar y activar" is disabled; null when planner_estado_publicacion says it can publish. */
export function motivoNoPublicar(estado: EstadoPublicacion): string | null {
  if (estado.puede_publicar) return null
  const nombre = estado.temporada.nombre
  if (!estado.rol_puede_publicar) return 'Solo el director general, un pastor o un administrador pueden publicar.'
  if (estado.temporada.estado !== 'planificacion') return `${nombre} ya no está en planificación.`
  const partes: string[] = []
  if (estado.grupos === 0) partes.push(`${nombre} no tiene grupos`)
  const { total } = estado.bloqueos
  if (total > 0) partes.push(`${total === 1 ? 'queda' : 'quedan'} ${contar(total, 'bloqueo', 'bloqueos')}`)
  if (estado.faltan_segmentos > 0) {
    const nombres = segmentosSinTerminar(estado).map((s) => s.nombre)
    const n = estado.faltan_segmentos
    partes.push(`${n === 1 ? 'falta' : 'faltan'} ${contar(n, 'segmento', 'segmentos')} por terminar${nombres.length > 0 ? ` (${enLista(nombres)})` : ''}`)
  }
  return partes.length > 0 ? `No puedes publicar todavía: ${enLista(partes)}.` : 'Todavía no se puede publicar.'
}

/** The line under an enabled button. */
export const textoListo = (avisos: number): string =>
  avisos === 0 ? 'Sin bloqueos ni avisos.' : `Sin bloqueos. Se publica con ${contar(avisos, 'aviso', 'avisos')}.`

/** "7 nov, 9:40 a. m." in Caracas time. */
export function fechaMarca(instante: string | null): string | null {
  if (!instante) return null
  const fecha = new Date(instante)
  return Number.isNaN(fecha.getTime()) ? null : `${diaCorto(fecha)}, ${horaDelDia(fecha)}`
}

export interface EstadoSegmento {
  readonly texto: string
  readonly tono: 'success' | 'danger' | 'warning' | 'neutro'
}

/** S14: "Terminado por X · 7 nov, 9:40 a. m." or "Sin terminar · N bloqueos". */
export function estadoSegmento(segmento: SegmentoPublicacion): EstadoSegmento {
  if (segmento.grupos === 0) return { texto: 'Sin grupos en esta temporada', tono: 'neutro' }
  if (segmento.terminado) {
    const quien = segmento.marcado_por?.nombre ?? 'su director de etapa'
    const cuando = fechaMarca(segmento.marcado_en)
    return { texto: `Terminado por ${quien}${cuando ? ` · ${cuando}` : ''}`, tono: 'success' }
  }
  if (segmento.bloqueos > 0) return { texto: `Sin terminar · ${contar(segmento.bloqueos, 'bloqueo', 'bloqueos')}`, tono: 'danger' }
  return { texto: 'Sin terminar · sin bloqueos, falta que su director lo marque', tono: 'warning' }
}

export interface Efecto {
  readonly titulo: string
  readonly detalle: string | null
}

const archivados = (n: number): string =>
  n === 1 ? 'Su 1 grupo activo se archiva, con toda su asistencia.' : `Sus ${n} grupos activos se archivan, con toda su asistencia.`

/** What publishing does (S8, S19): only the origin of the same cohort closes. */
export function efectosPublicar(estado: EstadoPublicacion): Efecto[] {
  const { nombre, cohorte } = estado.temporada
  const efectos: Efecto[] = [
    {
      titulo: `${nombre} pasa a activa.`,
      detalle: `${estado.grupos === 1 ? 'Su 1 grupo queda activo' : `Sus ${estado.grupos} grupos quedan activos`}; los que ya se reúnen siguen igual.`,
    },
  ]
  const { origen } = estado
  if (origen) {
    efectos.push({
      titulo: `${origen.nombre} se cierra.`,
      detalle: origen.grupos_a_archivar > 0 ? archivados(origen.grupos_a_archivar) : 'No le quedan grupos activos que archivar.',
    })
  } else {
    efectos.push({ titulo: `No hay otra temporada ${cohorte ? `-${cohorte}` : 'de su cohorte'} que cerrar.`, detalle: null })
  }
  const otras = estado.otras_activas.map((t) => t.nombre)
  if (otras.length > 0) {
    efectos.push({
      titulo: otras.length === 1 ? `${otras[0]} sigue activa: publicar no la toca.` : `${enLista(otras)} siguen activas: publicar no las toca.`,
      detalle: 'Cada cohorte (-I y -II) cierra solo su temporada anterior.',
    })
  }
  efectos.push({ titulo: 'La asistencia se conserva.', detalle: `Los líderes ven sus grupos de ${nombre} en Asistencia desde ese momento.` })
  efectos.push({ titulo: 'No se deshace desde «Historial».', detalle: 'Después de publicar, los cambios se hacen sobre la temporada activa.' })
  return efectos
}

/** The confirm dialog's sentence. */
export function textoConfirmar(estado: EstadoPublicacion): string {
  const { nombre } = estado.temporada
  const partes = [`${nombre} queda activa con ${estado.grupos === 1 ? 'su grupo' : `sus ${estado.grupos} grupos`}.`]
  const { origen } = estado
  const otras = estado.otras_activas.map((t) => t.nombre)
  const otrasTexto = otras.length === 0 ? '' : `; ${enLista(otras)} no ${otras.length === 1 ? 'se toca' : 'se tocan'}`
  if (origen) {
    const archivo = origen.grupos_a_archivar === 0 ? 'no le quedan grupos activos' : `${origen.grupos_a_archivar === 1 ? 'su grupo activo se archiva' : `sus ${origen.grupos_a_archivar} grupos activos se archivan`}`
    partes.push(`${origen.nombre} se cierra y ${archivo}${otrasTexto}.`)
  } else if (otras.length > 0) {
    partes.push(`${enLista(otras)} no ${otras.length === 1 ? 'se toca' : 'se tocan'}.`)
  }
  partes.push('La asistencia se conserva. Esto no se deshace desde «Historial».')
  return partes.join(' ')
}

/** "2026-II está activa · 27 grupos activados · 2025 - II archivada con 19 grupos". */
export function textoPublicada(publicada: TemporadaPublicada, nombre: string): string {
  const partes = [`${publicada.nombre || nombre} está activa`, contar(publicada.grupos, 'grupo activado', 'grupos activados')]
  if (publicada.origenNombre) partes.push(`${publicada.origenNombre} archivada con ${contar(publicada.gruposArchivados, 'grupo', 'grupos')}`)
  return partes.join(' · ')
}
