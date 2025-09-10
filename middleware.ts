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
  '/auth/callback' // callback oauth
])

export async function middleware(request: NextRequest) {
  const url = new URL(request.url)
  const path = url.pathname

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

  const { data: { user } } = await supabase.auth.getUser()

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
