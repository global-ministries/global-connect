/**
 * Estructura — shared copy and result reporting for the mutations of the
 * screen. Every action's success or failure goes through the notifications
 * hook (never `alert()`); a failed action never throws to the island, it
 * returns `{ ok: false, error, message? }`.
 */
import type { useNotificaciones } from '@/hooks/use-notificaciones'

export type Toast = ReturnType<typeof useNotificaciones>

export type ResultadoAccion =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string; readonly message?: string }

export function mensajeParaError(codigo: string): string {
  switch (codigo) {
    case 'forbidden':
      return 'No tienes permiso para esta acción.'
    case 'not-found':
      return 'No se encontró el elemento (puede haber sido modificado por otra persona).'
    case 'unauthorized':
      return 'Tu sesión expiró. Inicia sesión nuevamente.'
    case 'invalid-input':
      return 'Los datos ingresados no son válidos.'
    default:
      return 'Ocurrió un error inesperado. Inténtalo de nuevo.'
  }
}

/** Toasts the outcome and tells the caller whether it worked. */
export function reportarResultado(toast: Toast, resultado: ResultadoAccion, exito: string): boolean {
  if (!resultado.ok) {
    toast.error(resultado.message ?? mensajeParaError(resultado.error))
    return false
  }
  toast.success(exito)
  return true
}

/** "Sin personas", "1 persona", "9 personas". */
export function personasTexto(cantidad: number): string {
  if (cantidad === 0) return 'Sin personas'
  return cantidad === 1 ? '1 persona' : `${cantidad} personas`
}

/** Focus ring shared by the custom buttons of this screen. */
export const ANILLO_FOCO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'
