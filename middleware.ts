import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import * as Sentry from '@sentry/nextjs'
import type { NextRequest } from 'next/server'
import { AUTH_FETCH_TIMEOUT_MS } from '@/lib/platform/auth-timeout'

/**
 * Rutas públicas que no requieren autenticación.
 * El code exchange se maneja en /auth/callback y el token hash recovery en /auth/confirm.
 */
const PUBLIC_PATHS = new Set([
  '/',               // login
  '/signup',
  '/reset-password',
  '/verify-email',
  '/auth/callback',
  '/auth/confirm',
  '/auth/reset-password',
])

export function isPublicPath(path: string) {
  return PUBLIC_PATHS.has(path)
}

/**
 * Bound on how long middleware will wait for supabase.auth.getUser() before
 * failing closed. Shared with hooks/useCurrentUser.ts via
 * lib/platform/auth-timeout.ts so client and server cannot drift apart
 * (Finding 7 in 4R).
 *
 * See GH issue #257 — this is the server-side root cause that made the
 * client-side hook fix in PR #258 appear not to work in the preview
 * deployment.
 *
 * Exported so tests can advance timers by the same value rather than
 * hand-coding magic numbers.
 */
export const MIDDLEWARE_FETCH_TIMEOUT_MS = AUTH_FETCH_TIMEOUT_MS

export async function middleware(request: NextRequest) {
  const url = new URL(request.url)
  const path = url.pathname

  // Crear response mutable para poder setear cookies
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Setear cookies en el request (para Server Components downstream)
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          // Re-crear response con cookies actualizadas
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Para rutas públicas el middleware no necesita validar sesión contra el
  // servidor: el handler de la ruta hace su propio gating (p.ej. /auth/callback
  // intercambia el code y redirige). Saltarse el getUser() aquí elimina una
  // llamada de red y un punto de bloqueo potencial en cada navegación a una
  // ruta pública.
  if (isPublicPath(path)) {
    return supabaseResponse
  }

  // IMPORTANTE: NO usar getSession() — getUser() valida contra el servidor de
  // Supabase. Bound la llamada con un Promise.race: si Supabase cuelga, la
  // navegación no debe quedar esperando eternamente. On timeout, tratamos al
  // usuario como no autenticado y redirigimos a login (fail closed).
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const getUserPromise = supabase.auth.getUser()
  const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) => {
    timeoutHandle = setTimeout(
      () =>
        resolve({
          data: { user: null },
          error: new Error('middleware getUser timeout'),
        }),
      MIDDLEWARE_FETCH_TIMEOUT_MS
    )
  })

  let authResult: { data: { user: { id: string } | null }; error: { message?: string; code?: string } | null }
  try {
    authResult = await Promise.race([getUserPromise, timeoutPromise])
    if (authResult.error?.message === 'middleware getUser timeout') {
      // Sentry soporta Edge runtime via @sentry/nextjs; la breadcrumb queda
      // visible en la sesión del usuario y en el dashboard de ops sin
      // necesidad de instrumentar el cliente. Wrap in try/catch so a failure
      // to initialize the SDK (Edge bundling issue, instrumentation disabled)
      // cannot break the auth flow.
      try {
        Sentry.addBreadcrumb({
          category: 'auth',
          level: 'warning',
          message: 'middleware getUser timed out',
          data: { timeoutMs: MIDDLEWARE_FETCH_TIMEOUT_MS, path },
        })
      } catch {
        // Sentry SDK not initialized — observability is best-effort.
      }
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }

  const { data: { user }, error } = authResult

  // Si hay error de refresh token expirado, limpiar cookies
  if (error && (
    error.message?.includes('refresh_token_not_found') ||
    error.code === 'refresh_token_not_found'
  )) {
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.startsWith('sb-') || cookie.name.includes('supabase')) {
        supabaseResponse.cookies.delete(cookie.name)
      }
    })

    if (!isPublicPath(path)) {
      const redirectUrl = new URL('/', request.url)
      redirectUrl.searchParams.set('redirect', path)
      return NextResponse.redirect(redirectUrl)
    }
    return supabaseResponse
  }

  // No autenticado + ruta privada → login
  if (!user) {
    const redirectUrl = new URL('/', request.url)
    redirectUrl.searchParams.set('redirect', path)
    return NextResponse.redirect(redirectUrl)
  }

  // Autenticado + login → dashboard
  if (user && path === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api|_next|static|monitoring|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}
