/**
 * F4 staging debug endpoint v2 — exhaustive runtime diagnostics.
 * Inspects: env vars, computed pastoral flags, buildPlatformSession, hardcoded bearer identity.
 * Temporary diagnostic for the access blocker investigation.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

async function buildSessionDirectly() {
  // Mimics what buildPlatformSession probably does
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookies().getAll(),
      },
    }
  )
  const { data, error } = await supabase.auth.getUser()
  return { data, error: error ? { message: error.message, code: error.code } : null }
}

export async function GET() {
  const cookieList = cookies().getAll().map((c) => ({
    name: c.name,
    hasValue: !!c.value && c.value.length > 0,
    sameSite: c.sameSite,
    secure: c.secure,
    path: c.path,
  }))

  let sessionDiag: unknown = null
  let sessionError: unknown = null
  try {
    sessionDiag = await buildSessionDirectly()
  } catch (e: unknown) {
    sessionError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  }

  const allEnvKeys = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_'))
  const envSummary = Object.fromEntries(
    allEnvKeys.map((k) => [k, `${process.env[k]?.length ?? 0} chars`])
  )

  return NextResponse.json({
    deployment: {
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
      NODE_ENV: process.env.NODE_ENV,
    },
    env_summary: envSummary,
    cookies: cookieList,
    session_direct_auth_call: sessionDiag,
    session_error: sessionError,
    diagnosis:
      'Si session_direct_auth_call.data.user es null pero hay cookies sb-*-auth-token, ' +
      'entonces la Supabase SSR client no está leyendo bien las cookies — apunta a ' +
      'un dominio/path distinto al que la cookie pertenece.',
  })
}
