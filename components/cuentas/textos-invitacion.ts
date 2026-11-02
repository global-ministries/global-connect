/**
 * Copy of the invitation to register in Global Connect (T4 of
 * odd/tasks/invitaciones-pendientes.md, S2; artboard
 * design/invitaciones/05-mezcla-escritorio.html): relative times, short dates,
 * the history entries of the drawer and the bulk-action counts. Pure: the
 * caller passes `ahora`.
 */
import type { ResumenInvitacion } from '@/lib/platform/cuentas/invitaciones-pendientes'
import type { TonoEstado } from '@/components/ui/punto-estado'

const MS_HORA = 60 * 60 * 1000
const MS_DIA = 24 * MS_HORA

export const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

/** "hace 3 días", "hace 2 horas", "hace un momento". */
export function hace(iso: string, ahora: Date): string {
  const ms = ahora.getTime() - Date.parse(iso)
  const dias = Math.floor(ms / MS_DIA)
  if (dias >= 1) return `hace ${plural(dias, 'día', 'días')}`
  const horas = Math.floor(ms / MS_HORA)
  return horas < 1 ? 'hace un momento' : `hace ${plural(horas, 'hora', 'horas')}`
}

/** Whole hours left of the 24 h link (S4), at least 1. */
export function horasParaVencer(iso: string, ahora: Date): number {
  return Math.max(1, 24 - Math.floor((ahora.getTime() - Date.parse(iso)) / MS_HORA))
}

/** "9 oct". */
export function fechaCorta(iso: string): string {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/** The WhatsApp nudge after sending (S7). */
export const AVISO_WHATSAPP =
  'Hola, te envié a tu correo la invitación para crear tu cuenta en Global Connect. Revisa también spam'

export const NOTA_CORREO =
  'El correo llega con el asunto «Te invitamos a GlobalConnect» y el botón «Aceptar invitación», que lleva a elegir su contraseña.'

export interface EntradaHistorial {
  readonly texto: string
  /** The email the entry went to, shown after `texto`. */
  readonly email?: string
  readonly detalle: string
  readonly tono: TonoEstado
}

const por = (nombre: string | null): string => (nombre ? ` · por ${nombre}` : '')

/**
 * "9 oct" when the latest invitation was closed without a newer one
 * ('sin_invitar' with sends; the date of that row), `null` when nothing was
 * ever sent. Shown as "Invitación cancelada el 9 oct".
 */
export function fechaCancelada(invitacion: ResumenInvitacion | null | undefined): string | null {
  if (!invitacion || invitacion.estado !== 'sin_invitar' || invitacion.envios === 0) return null
  return fechaCorta(invitacion.enviadaEl)
}

/**
 * The history, oldest first: the first send, every later send ("Reenviada":
 * a resend closes the previous row and opens a new one), then "El enlace
 * venció sin abrirse" for an expired one or "Eligió su contraseña y entró".
 * A cancelled latest row reads "Invitación cancelada" with its date (after
 * the first send when it is the only row).
 */
export function entradasHistorial(invitacion: ResumenInvitacion): EntradaHistorial[] {
  const { historial } = invitacion
  const ultima = historial.length - 1
  const cancelada = (fecha: string): EntradaHistorial => ({ texto: 'Invitación cancelada', detalle: fechaCorta(fecha), tono: 'muted' })
  const entradas: EntradaHistorial[] = historial.map((envio, i) => {
    const anterior = historial[i - 1]
    const detalle = `${fechaCorta(envio.fecha)}${por(envio.invitadoPor)}`
    if (i === 0) return { texto: 'Invitación para crear su cuenta enviada a', email: envio.email, detalle, tono: 'info' }
    if (i === ultima && envio.estado === 'cancelada') return cancelada(envio.fecha)
    if (anterior.email !== envio.email) return { texto: 'Reenviada a', email: envio.email, detalle, tono: 'info' }
    return { texto: 'Reenviada', detalle, tono: 'info' }
  })
  if (ultima === 0 && historial[0].estado === 'cancelada') entradas.push(cancelada(historial[0].fecha))
  if (invitacion.estado === 'vencida') {
    entradas.push({ texto: 'El enlace venció sin abrirse', detalle: '24 h después del último envío', tono: 'warning' })
  }
  if (invitacion.estado === 'registrada' && invitacion.aceptadaEl) {
    entradas.push({ texto: 'Eligió su contraseña y entró', detalle: fechaCorta(invitacion.aceptadaEl), tono: 'success' })
  }
  return entradas
}
