import { createClient } from '@supabase/supabase-js';

// Exporta una función para crear el cliente admin de Supabase SOLO en el servidor
export function createSupabaseAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createSupabaseAdminClient solo puede usarse en el servidor');
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
