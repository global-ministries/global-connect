/**
 * Planner — the spouse rule (S2 of odd/tasks/planner-gdv.md): moving a person
 * into a Matrimonios group brings the spouse along; into any other segment
 * only the person moves (a wife can attend Mujeres alone while her husband
 * does not attend).
 */
import { esMatrimonios } from './grupo'
import type { PersonaBanco } from './tipos'

/** The ids to send to planner_mover_personas: the couple only into Matrimonios. */
export function personasAMover(personaId: string, conyugeId: string | null, segmentoDestinoNombre: string | null): string[] {
  const conPareja = conyugeId !== null && conyugeId !== personaId && esMatrimonios(segmentoDestinoNombre)
  return conPareja ? [personaId, conyugeId] : [personaId]
}

export interface DatosConyugeQueSeQueda {
  /** The spouse's bank row, or null without spouse. */
  readonly conyuge: Pick<PersonaBanco, 'genero' | 'grupo_actual_id' | 'grupo_actual_nombre'> | null
  readonly segmentoDestinoNombre: string | null
  readonly grupoDestinoId: string
}

const conyugeSegunGenero = (genero: string | null): string =>
  genero === 'Masculino' ? 'Su esposo' : genero === 'Femenino' ? 'Su esposa' : 'Su cónyuge'

/**
 * The note under "Agregar personas" when the spouse does not come: "Su esposo
 * no viene: está en el banco" or "Su esposa no viene: sigue en Grupo Rosas".
 * Null into Matrimonios, without spouse, or when the spouse is already there.
 */
export function mensajeConyugeQueSeQueda({ conyuge, segmentoDestinoNombre, grupoDestinoId }: DatosConyugeQueSeQueda): string | null {
  if (!conyuge || esMatrimonios(segmentoDestinoNombre) || conyuge.grupo_actual_id === grupoDestinoId) return null
  const donde = conyuge.grupo_actual_id ? `sigue en ${conyuge.grupo_actual_nombre ?? 'otro grupo'}` : 'está en el banco'
  return `${conyugeSegunGenero(conyuge.genero)} no viene: ${donde}`
}
