/**
 * Manual WhatsApp (odd/tasks/talleres-reserva-publica.md S14, L6: "por ahora
 * no whatsapp, quizas un boton pero para que envien el mensaje
 * manualmente"): a wa.me link that opens the sender's own WhatsApp with the
 * text ready. Nothing is ever sent automatically. Only for valid Venezuelan
 * mobile numbers (enlaceWhatsapp); null otherwise, so the caller hides the
 * button.
 */
import { enlaceWhatsapp } from '@/lib/utils/telefono'

export function enlaceWhatsappConTexto(telefono: string | null | undefined, texto: string | null | undefined): string | null {
  const enlace = enlaceWhatsapp(telefono)
  if (!enlace) return null
  const mensaje = (texto ?? '').trim()
  return mensaje ? `${enlace}?text=${encodeURIComponent(mensaje)}` : enlace
}
