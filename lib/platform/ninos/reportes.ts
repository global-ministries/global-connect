/**
 * Niños attendance reports (odd/tasks/ninos-checkin.md, N7). The server
 * (ninos_reporte_asistencia) does every aggregation over check-ins; these
 * helpers only shape its rows for the page and the CSV export.
 */

export type AreaNinos = 'waumba' | 'upstreet'

export interface FilaSalonReporte {
  fecha: string
  turno_id: string
  turno: string
  turno_orden: number
  salon_id: string
  salon: string
  salon_orden: number
  area: AreaNinos
  capacidad: number
  /** Children checked in to the room in that service. */
  ninos: number
  /** Most children present at the same time. */
  pico: number
}

export interface DiaReporte {
  fecha: string
  /** Distinct children that day (a child in both services counts once). */
  ninos: number
  checkins: number
}

export interface NinoNuevo {
  nino_id: string
  nombre: string
  fecha: string
  salon: string
  visita_id: string
  padres: string[]
}

export interface NinoAusente {
  nino_id: string
  nombre: string
  ultima_fecha: string
  salon: string
  /** Sundays attended out of the 4 before the last two. */
  veces: number
  padres: string[]
}

export interface Reporte {
  domingo_referencia: string | null
  salones: FilaSalonReporte[]
  dias: DiaReporte[]
  nuevos: NinoNuevo[]
  ausentes: NinoAusente[]
}

export const NOMBRE_AREA: Record<AreaNinos, string> = { waumba: 'Waumba Land', upstreet: 'UpStreet' }

const SEMANAS_POR_DEFECTO = 8

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** The last 8 Sundays, ending on the last Sunday up to `hoy` (YYYY-MM-DD, Caracas). */
export function rangoPorDefecto(hoy: string): { desde: string; hasta: string } {
  const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay()
  const hasta = sumarDias(hoy, -dow)
  return { desde: sumarDias(hasta, -7 * (SEMANAS_POR_DEFECTO - 1)), hasta }
}

function lista<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** Reads the RPC's jsonb defensively. */
export function leerReporte(data: unknown): Reporte {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  return {
    domingo_referencia: typeof o.domingo_referencia === 'string' ? o.domingo_referencia : null,
    salones: lista<FilaSalonReporte>(o.salones),
    dias: lista<DiaReporte>(o.dias),
    nuevos: lista<NinoNuevo>(o.nuevos),
    ausentes: lista<NinoAusente>(o.ausentes),
  }
}

export interface ResumenDia {
  fecha: string
  total: number
  turnos: { turno: string; ninos: number }[]
  waumba: number
  upstreet: number
}

/** One row per Sunday: distinct total (server), then check-ins per service and per area. */
export function resumenPorDia(filas: readonly FilaSalonReporte[], dias: readonly DiaReporte[]): ResumenDia[] {
  return dias.map((d) => {
    const delDia = filas.filter((f) => f.fecha === d.fecha)
    const turnos = new Map<string, { turno: string; orden: number; ninos: number }>()
    let waumba = 0
    let upstreet = 0
    for (const f of delDia) {
      const t = turnos.get(f.turno_id) ?? { turno: f.turno, orden: f.turno_orden, ninos: 0 }
      t.ninos += f.ninos
      turnos.set(f.turno_id, t)
      if (f.area === 'waumba') waumba += f.ninos
      else upstreet += f.ninos
    }
    return {
      fecha: d.fecha,
      total: d.ninos,
      turnos: [...turnos.values()].sort((a, b) => a.orden - b.orden).map(({ turno, ninos }) => ({ turno, ninos })),
      waumba,
      upstreet,
    }
  })
}

/** A family is one first visit (siblings share the visita of their check-in). */
export function familiasNuevas(nuevos: readonly NinoNuevo[]): number {
  return new Set(nuevos.map((n) => n.visita_id)).size
}

/** Peak as a percentage of capacity, rounded. */
export function usoPico(f: Pick<FilaSalonReporte, 'pico' | 'capacidad'>): number {
  return f.capacidad > 0 ? Math.round((f.pico / f.capacidad) * 100) : 0
}

function celda(valor: string | number): string {
  let v = String(valor)
  let citar = /[",\r\n]/.test(v)
  // Spreadsheet formula injection: prefix and quote.
  if (/^[=+\-@\t]/.test(v)) {
    v = `'${v}`
    citar = true
  }
  return citar ? `"${v.replace(/"/g, '""')}"` : v
}

/** CSV of the per-room table (comma separated, CRLF). */
export function csvSalones(filas: readonly FilaSalonReporte[]): string {
  const cabecera = ['Fecha', 'Servicio', 'Área', 'Salón', 'Niños', 'Pico', 'Capacidad', 'Uso del pico (%)']
  const cuerpo = filas.map((f) =>
    [f.fecha, f.turno, NOMBRE_AREA[f.area] ?? f.area, f.salon, f.ninos, f.pico, f.capacidad, usoPico(f)].map(celda).join(','),
  )
  return [cabecera.join(','), ...cuerpo].join('\r\n')
}
