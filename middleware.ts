import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import type { NextRequest } from "next/server"

// Rutas públicas permitidas sin autenticación
const PUBLIC_PATHS = new Set([
  '/',           // login
  '/signup',
  '/reset-password',
  '/verify-email',
  '/update-password',
  '/welcome',
  '/auth/callback', // callback oauth
  '/auth/reset-password' // página de cambio de contraseña
])

export async function middleware(request: NextRequest) {
  const url = new URL(request.url)
  const path = url.pathname
  const code = url.searchParams.get('code')

  // Si hay un código de recuperación, procesarlo primero
  if (code && path === '/') {
    console.log('Procesando código de recuperación:', code)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => request.cookies.get(name)?.value ?? '',
          set: (name: string, value: string, options: any) => {
            request.cookies.set({ name, value, ...options })
          },
          remove: (name: string, options: any) => {
            request.cookies.delete({ name, ...options })
          }
        }
      }
    )

    try {
      // Procesar el código de recuperación
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error('Error procesando código de recuperación:', error)
        // Si hay error, limpiar cookies y continuar al login
        const response = NextResponse.redirect(new URL('/', request.url))
        const cookiesToClear = ['sb-access-token', 'sb-refresh-token', 'supabase-auth-token']
        cookiesToClear.forEach(cookieName => {
          response.cookies.delete(cookieName)
        })
        return response
      }

      // Si el intercambio fue exitoso, redirigir a la página de cambio de contraseña
      if (data?.session) {
        console.log('Código procesado exitosamente, redirigiendo a /auth/reset-password')
        // Obtener los tokens de la sesión para pasarlos como parámetros
        const accessToken = data.session.access_token
        const refreshToken = data.session.refresh_token

        const redirectUrl = new URL('/auth/reset-password', request.url)
        redirectUrl.searchParams.set('access_token', accessToken)
        redirectUrl.searchParams.set('refresh_token', refreshToken)

        return NextResponse.redirect(redirectUrl)
      }
    } catch (error) {
      console.error('Error en middleware procesando código:', error)
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Si es una ruta pública, continuar (la sesión se refresca pero no se fuerza redirección)
  const isPublic = PUBLIC_PATHS.has(path)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value ?? '',
        set: (name: string, value: string, options: any) => {
          request.cookies.set({ name, value, ...options })
        },
        remove: (name: string, options: any) => {
          request.cookies.delete({ name, ...options })
        }
      }
    }
  )

  let user = null
  try {
    const { data: { user: authUser }, error } = await supabase.auth.getUser()

    // Si hay error de refresh token, limpiar cookies
    if (error && (error.message?.includes('refresh_token_not_found') || error.code === 'refresh_token_not_found')) {
      const response = NextResponse.next()

      // Limpiar todas las cookies de Supabase (nombres comunes)
      const cookiesToClear = [
        'sb-access-token',
        'sb-refresh-token',
        'supabase-auth-token',
        'sb-localhost-auth-token',
        'sb-127.0.0.1-auth-token'
      ]

      // También limpiar cookies que empiecen con 'sb-'
      request.cookies.getAll().forEach(cookie => {
        if (cookie.name.startsWith('sb-') || cookie.name.includes('supabase')) {
          response.cookies.delete(cookie.name)
        }
      })

      cookiesToClear.forEach(cookieName => {
        response.cookies.delete(cookieName)
      })

      // Si es ruta privada, redirigir al login
      if (!isPublic) {
        const redirectUrl = new URL('/', request.url)
        redirectUrl.searchParams.set('redirect', path)
        return NextResponse.redirect(redirectUrl)
      }
      return response
    }

    user = authUser
  } catch (error) {
    console.log('Error en middleware auth:', error)
    // En caso de error, limpiar cookies y continuar
    if (!isPublic) {
      const redirectUrl = new URL('/', request.url)
      redirectUrl.searchParams.set('redirect', path)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Si no autenticado y ruta privada -> redirigir al login
  if (!user && !isPublic) {
    const redirectUrl = new URL('/', request.url)
    // opcional: conservar destino
    redirectUrl.searchParams.set('redirect', path)
    return NextResponse.redirect(redirectUrl)
  }

  // Si autenticado y trata de ir al login, redirigir al dashboard
  if (user && path === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}
export const config = {
  matcher: [
    "/((?!api|_next|static|favicon.ico|robots.txt|sitemap.xml).*)"
  ]
}
