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
          try {
            ;(await cookieStore).set(name, value, options)
          } catch {
            // set solo permitido en Server Actions / Route Handlers. Ignorar en RSC.
          }
        },
        remove: async (name: string, options: any) => {
          try {
            const store = await cookieStore
            if (typeof (store as any).delete === 'function') {
              ;(store as any).delete(name, options)
            } else {
              store.set(name, '', options)
            }
          } catch {
            // remove solo permitido en Server Actions / Route Handlers. Ignorar en RSC.
          }
        }
      }
    }
  )
}
