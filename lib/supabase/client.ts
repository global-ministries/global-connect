import { createBrowserClient } from '@supabase/ssr'

// Solo una exportación, sin duplicados ni chequeos innecesarios
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)