/**
 * Return path after sign-in (`?redirect=` on the login at `/`, set by the
 * middleware and by /ninos/registro). Only a relative path inside this app is
 * accepted, so the login can never send someone to another site.
 */

// No whitespace or control characters anywhere (C0, DEL, C1).
const CARACTER_PROHIBIDO = /[\s\u0000-\u001f\u007f-\u009f]/

function esRutaInterna(ruta: string): boolean {
  return (
    ruta.startsWith('/') &&
    !ruta.startsWith('//') && // protocol-relative URL: //evil.com
    !ruta.includes('\\') && // browsers read /\evil.com as //evil.com
    !CARACTER_PROHIBIDO.test(ruta)
  )
}

/** The path itself when it is a safe internal path, otherwise null. */
export function safeInternalPath(valor: unknown): string | null {
  if (typeof valor !== 'string' || !esRutaInterna(valor)) return null
  // Encoded slashes or backslashes must not turn into an external URL once decoded.
  let decodificada: string
  try {
    decodificada = decodeURIComponent(valor)
  } catch {
    return null
  }
  return esRutaInterna(decodificada) ? valor : null
}
