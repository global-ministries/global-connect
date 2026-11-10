'use server'

/**
 * Turns one automatic notice of a taller on or off (odd/tasks/talleres-reserva-publica.md
 * T7; design/talleres-reserva/15). `talleres_avisos_config_guardar` checks
 * coordinator.write, director.write or admin.manage on the taller's node and
 * refuses the fixed notices; this action only validates the input and maps
 * the errors.
 */
import { revalidatePath } from 'next/cache'

import { esTipoConfigurable } from '@/lib/platform/talleres/avisos-catalogo'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface ResultadoConfigAviso {
  readonly ok: boolean
  readonly mensaje?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function guardarAvisoTallerAction(input: {
  tallerId: string
  tipo: string
  activo: boolean
}): Promise<ResultadoConfigAviso> {
  if (!isTalleresEnabled()) return { ok: false, mensaje: 'El módulo de talleres está deshabilitado.' }
  if (!UUID.test(input.tallerId) || !esTipoConfigurable(input.tipo) || typeof input.activo !== 'boolean') {
    return { ok: false, mensaje: 'Ese aviso no se puede cambiar.' }
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the RPC is newer than database.types
  const client: any = supabase
  const { error } = await client.rpc('talleres_avisos_config_guardar', {
    p_taller_id: input.tallerId,
    p_tipo: input.tipo,
    p_activo: input.activo,
  })
  if (error) {
    return {
      ok: false,
      mensaje:
        error.code === '42501' ? 'Solo la coordinación o la dirección del taller puede cambiar sus avisos.' : 'No se pudo guardar. Inténtalo de nuevo.',
    }
  }

  revalidatePath('/talleres/[taller]/avisos', 'page')
  return { ok: true, mensaje: input.activo ? 'Aviso encendido.' : 'Aviso apagado.' }
}
