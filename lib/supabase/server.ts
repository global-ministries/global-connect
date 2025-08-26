import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase para el servidor')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Devuelve el cliente supabase para usar en server actions
export function createServerSupabaseClient() {
  return supabase
}
