/**
 * Check-in screen logic (odd/tasks/ninos-checkin.md, N4): the service picked
 * from the URL query, the aligned arrays sent to ninos_checkin, and the
 * capacity warnings read back from it.
 */

/** A dream_team_turnos row as selected by the screen. */
export type TurnoFila = { id: string; nombre: string; hora: string; orden: number }

export type Servicio = { turnoId: string | null; fecha: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function esFechaValida(value: string | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** `hoy` (YYYY-MM-DD) when it is a Sunday, otherwise the coming Sunday. */
export function fechaServicioPorDefecto(hoy: string): string {
  const d = new Date(`${hoy}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
}

/** Today's date in the browser/server local time zone, YYYY-MM-DD. */
export function hoyLocal(ahora: Date = new Date()): string {
  const y = ahora.getFullYear()
  const m = String(ahora.getMonth() + 1).padStart(2, '0')
  const d = String(ahora.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** The service from the query (?turno=&fecha=), falling back to defaults. */
export function resolverServicio(
  query: { turno?: string; fecha?: string },
  turnos: readonly TurnoFila[],
  hoy: string,
): Servicio {
  const ordenados = [...turnos].sort((a, b) => a.orden - b.orden || a.hora.localeCompare(b.hora))
  const turno = ordenados.find((t) => t.id === query.turno) ?? ordenados[0] ?? null
  return {
    turnoId: turno?.id ?? null,
    fecha: esFechaValida(query.fecha) ? query.fecha : fechaServicioPorDefecto(hoy),
  }
}

export type Seleccion = { ninoId: string; salonId: string | null; nombre?: string }

export function armarCheckin(
  seleccion: readonly Seleccion[],
): { ok: true; ninoIds: string[]; salonIds: string[] } | { ok: false; error: string } {
  if (seleccion.length === 0) return { ok: false, error: 'Elige al menos un niño.' }
  const sinSalon = seleccion.find((s) => !s.salonId)
  if (sinSalon) return { ok: false, error: `${sinSalon.nombre ?? 'Un niño'} no tiene salón: asígnalo antes de registrar.` }
  return { ok: true, ninoIds: seleccion.map((s) => s.ninoId), salonIds: seleccion.map((s) => s.salonId as string) }
}

export type FilaCheckin = { salon_id: string; ocupacion: number; capacidad: number; sobre_capacidad: boolean }

/** One "Salón lleno" line per room the check-in pushed over capacity. */
export function avisosDeCapacidad(filas: readonly FilaCheckin[], nombres: Readonly<Record<string, string>>): string[] {
  const vistos = new Set<string>()
  const avisos: string[] = []
  for (const f of filas) {
    if (!f.sobre_capacidad || vistos.has(f.salon_id)) continue
    vistos.add(f.salon_id)
    avisos.push(`Salón lleno: ${nombres[f.salon_id] ?? 'salón'} ${f.ocupacion}/${f.capacidad}`)
  }
  return avisos
}

export function mensajeDeErrorCheckin(error: { code?: string; message?: string } | null): string {
  if (error?.code === '23505') return 'Uno de los niños ya ingresó en este servicio.'
  if (error?.code === '42501') return 'No tienes permiso para registrar ingresos en ese salón.'
  if (error?.code === '53000') return 'No hay códigos libres para este servicio.'
  if (error?.code === '22023') return 'Revisa el servicio y los salones elegidos.'
  return 'No se pudo registrar el ingreso. Intenta de nuevo.'
}

export type AlertasFicha = {
  alergias: string | null
  necesidades_especiales: string | null
  cambio_panal: boolean | null
  puede_comer: boolean | null
  autoriza_imagen: boolean | null
}

/** The short alerts shown next to a child at the table. */
export function alertasDeHijo(h: AlertasFicha): string[] {
  const alertas: string[] = []
  if (h.alergias) alertas.push(`Alergias: ${h.alergias}`)
  if (h.necesidades_especiales) alertas.push(`Necesidades especiales: ${h.necesidades_especiales}`)
  if (h.cambio_panal) alertas.push('Cambio de pañal')
  if (h.puede_comer === false) alertas.push('No puede comer merienda')
  if (h.autoriza_imagen === false) alertas.push('Sin fotos')
  return alertas
}
