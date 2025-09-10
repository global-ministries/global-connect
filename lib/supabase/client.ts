import { createBrowserClient } from '@supabase/ssr'

// Función para crear el cliente de Supabase
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Exportación por defecto para compatibilidad
export const supabase = createClient()