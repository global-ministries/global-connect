import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

/**
 * Crea un cliente de Supabase para uso en Client Components.
 * Llamar esta función cada vez que se necesite — no usar singleton.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}