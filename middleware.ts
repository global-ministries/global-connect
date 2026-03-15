import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

/**
 * Rutas públicas que no requieren autenticación.
 * El code exchange se maneja exclusivamente en /auth/callback (Route Handler).
 */
const PUBLIC_PATHS = new Set([
  '/',               // login
  '/signup',
  '/reset-password',
  '/verify-email',
  '/auth/callback',
  '/auth/reset-password',
])

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
          cookiesToSet.forEach(({ name, value, options }) => {
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

  // IMPORTANTE: NO usar getSession() — getUser() valida contra el servidor de Supabase
  const { data: { user }, error } = await supabase.auth.getUser()

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

    if (!PUBLIC_PATHS.has(path)) {
      const redirectUrl = new URL('/', request.url)
      redirectUrl.searchParams.set('redirect', path)
      return NextResponse.redirect(redirectUrl)
    }
    return supabaseResponse
  }

  const isPublic = PUBLIC_PATHS.has(path)

  // No autenticado + ruta privada → login
  if (!user && !isPublic) {
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
