import type { TipoPresencia, TiempoTardanza, MotivoTardanza } from "@/lib/types/asistencia-avanzada.types"

/** Estado editable de un miembro en el registro de asistencia. */
export interface EstadoMiembro {
    tipo_presencia: TipoPresencia
    motivo?: string
    nota?: string
    tiempo_tardanza?: TiempoTardanza
    motivo_tardanza?: MotivoTardanza
    motivo_tardanza_otro?: string
}

export interface MiembroAsistencia {
    id: string
    nombre: string
    apellido: string
    rol?: string
}

/** Orden del control segmentado: de lo más común a lo menos común. */
export const OPCIONES_PRESENCIA: Array<{ valor: TipoPresencia; etiqueta: string }> = [
    { valor: "presente", etiqueta: "Presente" },
    { valor: "tarde", etiqueta: "Tarde" },
    { valor: "ausente", etiqueta: "Ausente" },
    { valor: "justificado", etiqueta: "Justificado" },
]

export const OPCIONES_TIEMPO_TARDANZA: Array<{ valor: TiempoTardanza; etiqueta: string }> = [
    { valor: "5", etiqueta: "5 min" },
    { valor: "10", etiqueta: "10 min" },
    { valor: "15", etiqueta: "15 min" },
    { valor: "20", etiqueta: "20 min" },
    { valor: "30", etiqueta: "30 min" },
    { valor: "45", etiqueta: "45 min" },
    { valor: "60", etiqueta: "+1 hora" },
]

export const OPCIONES_MOTIVO_TARDANZA: Array<{ valor: MotivoTardanza; etiqueta: string }> = [
    { valor: "trafico", etiqueta: "Tráfico" },
    { valor: "hijos", etiqueta: "Hijos" },
    { valor: "trabajo", etiqueta: "Trabajo" },
    { valor: "sin_razon", etiqueta: "Sin razón" },
    { valor: "otro", etiqueta: "Otro" },
]

export function rolLabel(rol?: string): string {
    if (!rol) return "Miembro"
    if (rol === "Colíder" || rol === "Colider") return "Aprendiz"
    return rol
}

/**
 * Asistió a la reunión: presente o tarde. Es la misma regla que el porcentaje
 * del detalle del evento (`asistencia/[eventoId]/page.tsx`).
 */
export function asistio(tipo: TipoPresencia | undefined): boolean {
    return tipo === "presente" || tipo === "tarde"
}

/** "19:30:00" (base de datos) → "19:30" (valor de `<input type="time">"). */
export function horaParaInput(hora?: string | null): string {
    return hora ? hora.slice(0, 5) : ""
}

/**
 * "19:30" (input) → "19:30:00", el mismo formato que enviaban los selectores
 * HH / MM / AM-PM. Vacío o incompleto → undefined (no se envía hora).
 */
export function horaParaGuardar(valor: string): string | undefined {
    const hhmm = valor.slice(0, 5)
    return /^\d{2}:\d{2}$/.test(hhmm) ? `${hhmm}:00` : undefined
}
