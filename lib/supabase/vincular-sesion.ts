import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { vincularFichaConfirmada } from '@/lib/supabase/vincular-ficha'

/**
 * After a confirmation link opened a session, binds the ficha to that confirmed
 * user and returns the redirect target. When the ficha could not be bound
 * unambiguously the account stays unlinked and the target carries a neutral
 * `vinculo=pendiente` notice; when a director must approve it, the person goes
 * to /auth/vinculo-pendiente. A failure here never blocks the login itself.
 */
export async function destinoTrasConfirmar(
  supabase: Pick<SupabaseClient, 'auth'>,
  destino: URL,
): Promise<URL> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) return destino

    const vinculo = await vincularFichaConfirmada(createSupabaseAdminClient(), data.user)
    if (vinculo.estado === 'pendiente_aprobacion') {
      return new URL('/auth/vinculo-pendiente', destino.origin)
    }
    if (vinculo.estado === 'ambigua' || vinculo.estado === 'error') {
      console.error('Ficha sin vincular tras confirmar:', vinculo.estado)
      destino.searchParams.set('vinculo', 'pendiente')
    }
  } catch (error) {
    console.error('Ficha sin vincular tras confirmar:', error)
    destino.searchParams.set('vinculo', 'pendiente')
  }
  return destino
}
