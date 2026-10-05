/**
 * Talleres — ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md
 * C2). The access email links here. The token is moved into a short-lived
 * HttpOnly cookie scoped to /activar and the browser is redirected to the
 * token-free /activar, so the token never sits in a page URL that Sentry,
 * Vercel analytics or a Referer header could record. A malformed token is
 * dropped (and any older cookie cleared); /activar then shows the
 * invalid-link message.
 */

import { NextResponse, type NextRequest } from 'next/server'

import {
  COOKIE_ACTIVACION,
  COOKIE_ACTIVACION_MAX_AGE_S,
  esTokenConFormato,
} from '@/lib/platform/talleres/activacion-acceso'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params
  const response = NextResponse.redirect(new URL('/activar', request.url), 303)
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Cache-Control', 'no-store')

  if (esTokenConFormato(token)) {
    response.cookies.set(COOKIE_ACTIVACION, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/activar',
      maxAge: COOKIE_ACTIVACION_MAX_AGE_S,
    })
  } else {
    response.cookies.set(COOKIE_ACTIVACION, '', { path: '/activar', maxAge: 0 })
  }
  return response
}
