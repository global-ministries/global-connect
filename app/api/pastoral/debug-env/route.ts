/**
 * F4 staging debug endpoint v3 — exhaustive runtime diagnostics.
 * Inspects: env vars, computed pastoral flags, cookie list, direct Supabase auth probe.
 * Temporary diagnostic for the access blocker investigation. DELETE after.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

async function buildSessionDiag() {
  const cookieStore = await cookies()
  const cookieList = cookieStore.getAll()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieList,
      },
    }
  )
  const { data, error } = await supabase.auth.getUser()
  return {
    cookies: cookieList.map((c) => ({
      name: c.name,
      hasValue: !!c.value && c.value.length > 0,
      path: c.path,
      // sameSite y secure no están en RequestCookie tipado de Next.js 16 — se omiten aquí
    })),
    auth: {
      data,
      error: error ? { message: error.message, code: error.code } : null,
    },
  }
}

export async function GET() {
  let diag: unknown = null
  let diagError: unknown = null
  try {
    diag = await buildSessionDiag()
  } catch (e: unknown) {
    diagError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
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
    session_diag: diag,
    diag_error: diagError,
    diagnosis:
      'Si auth.data.user es null pero hay cookies sb-*-auth-token, hay drift entre ' +
      'la cookie que setea @supabase/ssr y lo que getUser() ve — probablemente ' +
      'cross-domain de cookies sb-* sin name específico.',
  })
}
