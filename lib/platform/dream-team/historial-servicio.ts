/**
 * Desde cuándo se guarda el historial de un servicio que se quita (S7 de
 * odd/tasks/dream-team-estructura-correcciones.md): hasta el 2027-01-01 00:00
 * de Caracas «Quitar de este equipo» borra el servicio sin dejar rastro
 * (se están ajustando los equipos); desde ese momento lo retira y su historial
 * se conserva. Única fuente de la fecha: la ruta y el diálogo la leen de aquí.
 *
 * Caracas es UTC-4 todo el año (sin horario de verano).
 */
export const INICIO_HISTORIAL_SERVICIO = new Date('2027-01-01T00:00:00-04:00')

/** `true` cuando quitar un servicio lo retira con historial; `false` cuando lo borra. */
export function guardaHistorialServicio(ahora: Date): boolean {
  return ahora.getTime() >= INICIO_HISTORIAL_SERVICIO.getTime()
}
