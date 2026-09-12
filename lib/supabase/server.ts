import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options)
            } catch {
              // setAll solo permitido en Server Actions / Route Handlers. Ignorar en RSC.
            }
          })
        },
      },
    }
  )
}

/**
 * Same as createSupabaseServerClient, but degrades to `null` instead of
 * throwing when construction fails (a missing cookies() request context, a
 * misconfigured env). Some callers — like app/(auth)/layout.tsx, which
 * renders for every authenticated page — must keep rendering with sane
 * defaults instead of crashing the whole route group if this ever throws.
 * Most callers should keep using createSupabaseServerClient directly and
 * let a genuine construction failure surface normally; reach for this one
 * only where "render with defaults" is the correct fallback.
 */
export async function createSupabaseServerClientOrNull() {
  try {
    return await createSupabaseServerClient()
  } catch {
    return null
  }
}
