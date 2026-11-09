/**
 * Check-in screen logic (odd/tasks/ninos-checkin.md, N4): the service picked
 * from the URL query, the aligned arrays sent to ninos_checkin, and the
 * capacity warnings read back from it.
 */
import { fechaServicioPorDefecto } from './fecha'
import { TEXTO_FALTA } from './familias-vista'
import type { DatoFaltante } from './sugerir-salon'

export { fechaServicioPorDefecto }

/**
 * A dream_team_turnos row as selected by the screen. `tipo: 'fechas'` marks a
 * dated turno of a Niños event (T1b, S8.1); the Sunday turnos carry no tipo.
 */
export type TurnoFila = { id: string; nombre: string; hora: string; orden: number; tipo?: 'semanal' | 'fechas' }

export type Servicio = { turnoId: string | null; fecha: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function esFechaValida(value: string | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * The service from the query (?turno=&fecha=), falling back to defaults. Off
 * Sunday the default turno is a dated one when listed: the event of that day.
 */
export function resolverServicio(
  query: { turno?: string; fecha?: string },
  turnos: readonly TurnoFila[],
  hoy: string,
): Servicio {
  const ordenados = [...turnos].sort((a, b) => a.orden - b.orden || a.hora.localeCompare(b.hora))
  const fecha = esFechaValida(query.fecha) ? query.fecha : fechaServicioPorDefecto(hoy)
  const delDia = new Date(`${fecha}T00:00:00Z`).getUTCDay() === 0 ? undefined : ordenados.find((t) => t.tipo === 'fechas')
  const turno = ordenados.find((t) => t.id === query.turno) ?? delDia ?? ordenados[0] ?? null
  return { turnoId: turno?.id ?? null, fecha }
}

/** Why a child has no salón: its salones are closed or full (explicarSalon), or the data that is missing (datoFaltante). */
export type MotivoSinSalon = 'cerrado' | 'lleno' | DatoFaltante

/** `motivo`: why the child has no salón, for the desk message; null or absent when unknown. */
export type Seleccion = { ninoId: string; salonId: string | null; nombre?: string; motivo?: MotivoSinSalon | null }

/** The desk message for a child without a salón, in plain words (S9.8, T2i). */
function mensajeSinSalonMesa(nombre: string, motivo: MotivoSinSalon | null | undefined): string {
  if (motivo === 'cerrado') return `${nombre} no tiene salón abierto hoy: abre su salón o registra a los demás.`
  if (motivo === 'lleno') return `${nombre}: su salón está lleno. Dale ingreso desde la mesa o registra a los demás.`
  if (motivo === 'revisar') return `${nombre} no corresponde a ningún salón: revisa su fecha de nacimiento o grado, o registra a los demás.`
  if (motivo) return `${nombre} todavía no tiene salón: ${TEXTO_FALTA[motivo].toLowerCase()}. Completa el dato o registra a los demás.`
  return `${nombre} todavía no tiene salón. Revisa sus datos o registra a los demás.`
}

export function armarCheckin(
  seleccion: readonly Seleccion[],
): { ok: true; ninoIds: string[]; salonIds: string[] } | { ok: false; error: string } {
  if (seleccion.length === 0) return { ok: false, error: 'Elige al menos un niño.' }
  const sinSalon = seleccion.find((s) => !s.salonId)
  if (sinSalon) return { ok: false, error: mensajeSinSalonMesa(sinSalon.nombre ?? 'Un niño', sinSalon.motivo) }
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

/** The rooms picked by hand that differ from the suggestion, to save as salon_preferido_id. */
export function preferidosAGuardar(
  filas: readonly { ninoId: string; salonId: string; sugeridoId: string | null }[],
): { ninoId: string; salonId: string }[] {
  return filas.filter((f) => f.salonId !== f.sugeridoId).map(({ ninoId, salonId }) => ({ ninoId, salonId }))
}
