/**
 * Account invitation for the parent of a family without an account, from the
 * desk (G5 of odd/tasks/ninos-cobertura.md; T2k of
 * odd/tasks/ninos-checkin-pco.md, S9.9), behind
 * POST /api/ninos/familia/[id]/invitar.
 *
 * The shared flow of lib/platform/cuentas/invitacion-cuenta.ts, whose first
 * step the route binds to ninos_familia_cuenta_invitar: anfitriones and
 * coordinación of the family's campus, right after registering it or at any
 * later visit, never replacing another email, one invitation per family
 * every 10 minutes. cargarCuentaFamilia reads «Sin cuenta» for the family
 * card (ninos_familia_cuenta, same scope).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  enviarInvitacionCuenta,
  mapEstadoInvitacion,
  parseInvitacion,
  type DependenciasInvitacion,
  type EstadoInvitacion,
} from '@/lib/platform/cuentas/invitacion-cuenta'

export type RespuestaRuta = { status: number; body: Record<string, unknown> }

const FUERA_DE_ALCANCE = 'Solo el equipo de la mesa del campus de esta familia puede invitarla.'
const RECIENTE = 'Ya le enviamos una invitación hace poco. Espera unos minutos para reenviarla.'

export async function invitarFamiliaNueva(deps: DependenciasInvitacion, padreId: string, body: unknown): Promise<RespuestaRuta> {
  const entrada = parseInvitacion(body)
  if ('error' in entrada) return { status: 400, body: { error: 'Escribe un correo válido.' } }

  // The shared flow does not know the cooldown code; notice it on the way.
  let reciente = false
  const conCooldown: DependenciasInvitacion = {
    ...deps,
    rpcUsuario: async (nombre, args) => {
      const r = await deps.rpcUsuario(nombre, args)
      if ((r.error?.message ?? '').trim() === 'invitacion_reciente') reciente = true
      return r
    },
  }

  const r = await enviarInvitacionCuenta(conCooldown, padreId, { email: entrada.email, reemplazarEmail: false })
  if (r.ok) return { status: 200, body: { ok: true, email: r.email } }
  if (reciente) return { status: 429, body: { error: RECIENTE, codigo: 'invitacion_reciente' } }
  if (r.codigo === 'sin_autoridad') return { status: 403, body: { error: FUERA_DE_ALCANCE, codigo: r.codigo } }
  return { status: r.status, body: { error: r.error, ...(r.codigo ? { codigo: r.codigo } : {}) } }
}

type Cliente = Pick<SupabaseClient, 'rpc'>

/** ninos_familia_cuenta: whether the parent has an account, the ficha's email and the last invitation; null on error. */
export async function cargarCuentaFamilia(cliente: Cliente, padreId: string): Promise<EstadoInvitacion | null> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_familia_cuenta', { p_padre_id: padreId })
  return error ? null : mapEstadoInvitacion(data)
}
