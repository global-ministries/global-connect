import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea un teléfono para llamadas: elimina guiones, espacios y puntos.
 * Mantiene el + si existe (prefijo internacional).
 */
export function formatPhoneForCall(phone: string | null | undefined): string | null {
  if (!phone) return null
  return phone.replace(/[\s\-\.]/g, '')
}
