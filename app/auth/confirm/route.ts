import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
])

function getSafeRecoveryRedirect(requestUrl: URL) {
  const next = requestUrl.searchParams.get('next')

  if (!next) {
    return '/auth/reset-password'
  }

  const nextUrl = new URL(next, requestUrl.origin)

  if (nextUrl.origin !== requestUrl.origin || nextUrl.pathname !== '/auth/reset-password') {
    return '/auth/reset-password'
  }

  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

function getSafeRedirect(requestUrl: URL) {
  const next = requestUrl.searchParams.get('next') || '/dashboard'
  const nextUrl = new URL(next, requestUrl.origin)

  if (nextUrl.origin !== requestUrl.origin) {
    return '/dashboard'
  }

  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')

  if (!tokenHash || !type || !EMAIL_OTP_TYPES.has(type as EmailOtpType)) {
    return NextResponse.redirect(new URL('/reset-password?error=invalid_or_expired_recovery_link', requestUrl.origin))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  })

  if (error) {
    console.error('Auth confirmation error:', error.message)
    return NextResponse.redirect(new URL('/reset-password?error=invalid_or_expired_recovery_link', requestUrl.origin))
  }

  if (type === 'recovery') {
    return NextResponse.redirect(new URL(getSafeRecoveryRedirect(requestUrl), requestUrl.origin))
  }

  return NextResponse.redirect(new URL(getSafeRedirect(requestUrl), requestUrl.origin))
}
