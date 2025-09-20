import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // set solo permitido en Server Actions / Route Handlers. Ignorar en RSC.
          }
        },
        remove: (name: string, options: any) => {
          try {
            cookieStore.delete(name)
          } catch {
            // remove solo permitido en Server Actions / Route Handlers. Ignorar en RSC.
          }
        }
      }
    }
  )
}
