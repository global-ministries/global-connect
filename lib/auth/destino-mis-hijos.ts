/**
 * Where a parent lands after choosing a password (R3b of
 * odd/tasks/ninos-roles-validacion.md). A Niños invitation carries
 * `next=/perfil#mis-hijos` to the password page; only Mi Perfil paths are
 * honored, so the parameter can never become an open redirect. Every other
 * invitation keeps /dashboard.
 */

export const DESTINO_MIS_HIJOS = '/perfil#mis-hijos'
export const DESTINO_POR_DEFECTO = '/dashboard'

const PAGINA_CONTRASENA = '/auth/reset-password'
// A throwaway origin: a relative path that resolves anywhere else is foreign.
const ORIGEN_LOCAL = 'http://destino.invalid'

export function destinoTrasContrasena(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return DESTINO_POR_DEFECTO
  let url: URL
  try {
    url = new URL(next, ORIGEN_LOCAL)
  } catch {
    return DESTINO_POR_DEFECTO
  }
  if (url.origin !== ORIGEN_LOCAL || url.pathname !== '/perfil') return DESTINO_POR_DEFECTO
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Rewrites an invitation confirm link (/auth/confirm?…&next=/auth/reset-password)
 * so the password page receives the post-password destination. It never
 * throws: an unparseable link is returned unchanged, so the email still goes
 * out with the plain invitation (landing on /dashboard).
 */
export function enlaceInvitacionConDestino(enlace: string, destino: string): string {
  let url: URL
  try {
    url = new URL(enlace)
  } catch {
    return enlace
  }
  const pagina = `${PAGINA_CONTRASENA}?${new URLSearchParams({ next: destinoTrasContrasena(destino) })}`
  url.searchParams.set('next', pagina)
  return url.toString()
}
