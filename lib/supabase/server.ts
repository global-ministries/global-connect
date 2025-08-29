import { createServerClient } from '@supabase/ssr'
import { cookies as nextCookies } from 'next/headers'

export function createSupabaseServerClient() {
  const cookieStore = nextCookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: async (name: string) => (await cookieStore).get(name)?.value,
        set: async (name: string, value: string, options: any) => {
          (await cookieStore).set({ name, value, ...options })
        },
        remove: async (name: string, options: any) => {
          (await cookieStore).set({ name, value: '', ...options })
        }
      }
    }
  )
}
