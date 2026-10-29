/**
 * Mi equipo — where a servicio sits in the tree, for the person panel: the
 * path shown under its equipo ("Dirección de Conexión › Talleres") and the
 * level "Ver su equipo" enters. Only the nodes the cards reach are levels
 * (the dirección's cards and those of every área that can be entered, as
 * calcularVistaMiEquipo), so a lone node skipped by the cards is neither.
 */
import type { PersonaVista, TarjetaEquipo, VistaDireccion } from '@/lib/platform/dream-team/mi-equipo-vista'

export interface NivelesMiEquipo {
  /** "Dirección de Conexión › Talleres": the dirección and the levels above the equipo; empty at the dirección. */
  readonly rutaDe: (servicio: PersonaVista) => string
  /** The deepest level that holds the servicio; `null` = the dirección. */
  readonly nivelDe: (servicio: PersonaVista) => string | null
}

export function nivelesMiEquipo(vista: VistaDireccion): NivelesMiEquipo {
  const etiquetas = new Map<string, string>()
  const agregar = (tarjetas: readonly TarjetaEquipo[]): void => tarjetas.forEach((tarjeta) => etiquetas.set(tarjeta.id, tarjeta.label))
  agregar(vista.equipos)
  Object.values(vista.niveles).forEach((nivel) => agregar(nivel.equipos))

  const rama = (servicio: PersonaVista): readonly string[] =>
    servicio.equipoId === vista.id ? [] : (servicio.ramaIds ?? [servicio.equipoId])

  return {
    rutaDe(servicio) {
      const ids = rama(servicio)
      if (ids.length === 0) return ''
      const encima = ids.slice(0, -1).flatMap((id) => etiquetas.get(id) ?? [])
      return [vista.label, ...encima].join(' › ')
    },
    nivelDe(servicio) {
      const ids = rama(servicio)
      for (let i = ids.length - 1; i >= 0; i -= 1) if (etiquetas.has(ids[i])) return ids[i]
      return null
    },
  }
}
