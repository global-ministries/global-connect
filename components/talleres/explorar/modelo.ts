/**
 * R3a (odd/tasks/talleres-rediseno.md, S1 S6) — the shape of one Explorar
 * row as the client receives it, and the pure rules of the screen: one card
 * per taller with its ediciones (design/talleres-interior/20 and 21), the
 * state of each edición for the viewer, and the date / hora / cupo copy.
 */

import type { CupoExplorar } from '@/lib/platform/talleres/participante'
import { diaSemana, fechaCorta, horaLegible } from '@/lib/platform/talleres/reserva-publica'

export interface TallerExplorarFila {
  readonly id: string
  /** Abstract taller name (talleres.nombre) — e.g. "Matrimonio sobre la Roca". */
  readonly nombre: string
  /** talleres.slug: groups the ediciones of one taller. */
  readonly slug: string
  readonly tipo: 'individual' | 'pareja'
  /** Couple vínculo of the edición; null lets the member choose it. */
  readonly link_type: 'matrimonio' | 'novios' | null
  /** When a new partner's access email goes out; only changes the picker copy. */
  readonly momento_envio_acceso?: 'al_aprobar' | 'al_inscribirse'
  /** Edición label (nombre_snapshot), e.g. "Septiembre 2026". */
  readonly edicion: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly ya_inscrito: boolean
  /** Estado of the viewer's own active inscripción in this edición, if any. */
  readonly estado_inscripcion?: 'pendiente' | 'aprobado' | null
  readonly descripcion: string | null
  /** The edición's own cierre de inscripción (YYYY-MM-DD), if any. */
  readonly cierre_inscripcion: string | null
  /** First clase (YYYY-MM-DD), or null when unknown. */
  readonly primera_clase?: string | null
  readonly cupo_completo: boolean
  readonly hora?: string | null
  readonly lugar?: string | null
  readonly clases?: number | null
  readonly cupo?: CupoExplorar | null
  readonly genero_requerido?: 'Masculino' | 'Femenino' | null
  readonly inscripcion_automatica?: boolean
}

export interface TallerAgrupado {
  readonly clave: string
  readonly nombre: string
  readonly descripcion: string | null
  readonly audiencia: string | null
  readonly ediciones: readonly TallerExplorarFila[]
}

/** One card per taller, in the order the ediciones arrive. */
export function agruparPorTaller(filas: readonly TallerExplorarFila[]): TallerAgrupado[] {
  const grupos = new Map<string, TallerExplorarFila[]>()
  for (const fila of filas) {
    const clave = fila.slug || fila.id
    const lista = grupos.get(clave)
    if (lista) lista.push(fila)
    else grupos.set(clave, [fila])
  }
  return [...grupos.entries()].map(([clave, ediciones]) => {
    const primera = ediciones[0]!
    return {
      clave,
      nombre: primera.nombre,
      descripcion: primera.descripcion,
      audiencia: audienciaExplorar(primera),
      ediciones,
    }
  })
}

/** "Para mujeres", "Para matrimonios · se inscriben los dos"… */
export function audienciaExplorar(fila: TallerExplorarFila): string | null {
  if (fila.tipo === 'pareja') {
    const para =
      fila.link_type === 'matrimonio' ? 'Para matrimonios' : fila.link_type === 'novios' ? 'Para novios' : 'Para parejas'
    return `${para} · se inscriben los dos`
  }
  if (fila.genero_requerido === 'Femenino') return 'Para mujeres'
  if (fila.genero_requerido === 'Masculino') return 'Para hombres'
  return null
}

export type EstadoEdicion = 'inscribible' | 'pendiente' | 'inscrito' | 'lleno'

/** What the viewer can do with an edición: their own inscripción first, then the cupo. */
export function estadoEdicion(fila: TallerExplorarFila): EstadoEdicion {
  if (fila.ya_inscrito) return fila.estado_inscripcion === 'pendiente' ? 'pendiente' : 'inscrito'
  if (fila.cupo_completo) return 'lleno'
  return 'inscribible'
}

/** The first clase is shown until the edición is en curso. */
export function primeraClaseVisible(fila: TallerExplorarFila): string | null {
  return fila.primera_clase && fila.estado !== 'en_curso' ? fila.primera_clase : null
}

/** "jue 26 nov" */
export const fechaTarjeta = fechaCorta

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "26 de noviembre de 2026" for a YYYY-MM-DD, read as a calendar day; null when malformed. */
export function fechaLarga(fecha: string | null | undefined): string | null {
  const partes = fecha ? /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha) : null
  if (!partes) return null
  const mes = MESES_LARGOS[Number(partes[2]) - 1]
  return mes ? `${Number(partes[3])} de ${mes} de ${partes[1]}` : null
}

/** "Jueves" (from the first clase) and "7:00 p.m.", each when known. */
export function diaYHora(fila: TallerExplorarFila): { dia: string | null; hora: string | null } {
  const primera = fila.primera_clase ?? null
  return { dia: primera ? diaSemana(primera) : null, hora: horaLegible(fila.hora ?? null) }
}

/** "Una sola clase" / "6 clases"; null when unknown. */
export function textoClases(clases: number | null | undefined): string | null {
  if (!clases) return null
  return clases === 1 ? 'Una sola clase' : `${clases} clases`
}

/** "lugares" or "parejas", as the cupo counts. */
export const unidadCupo = (cupo: CupoExplorar) => (cupo.unidad === 'parejas' ? 'parejas' : 'lugares')
