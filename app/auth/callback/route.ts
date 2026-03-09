import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Auth callback Route Handler.
 * Maneja el intercambio de código PKCE por sesión para:
 * - Confirmación de email (signup)
 * - Password reset (recovery)
 * - Magic links
 * - OAuth
 *
 * La sesión se establece via cookies automáticamente por el server client.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/dashboard'
  const type = requestUrl.searchParams.get('type')

  if (!code) {
    return NextResponse.redirect(new URL('/?error=missing_code', requestUrl.origin))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Auth callback error:', error.message)
    return NextResponse.redirect(new URL('/?error=auth_callback_failed', requestUrl.origin))
  }

  // Si es recovery (reset password), redirigir a la página de cambio
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/reset-password', requestUrl.origin))
  }

  // Para confirmación de email, signup, o magic link → destino o dashboard
  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
