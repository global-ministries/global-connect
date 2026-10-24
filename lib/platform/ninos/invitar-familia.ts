/**
 * Account invitation for the new adult of a family registered at the table
 * (G5 of odd/tasks/ninos-cobertura.md), behind
 * POST /api/ninos/familia/[id]/invitar.
 *
 * The shared flow of lib/platform/cuentas/invitacion-cuenta.ts, whose first
 * step the route binds to ninos_familia_invitar: only the operator who
 * registered that NEW ficha, within one hour, never replacing another email.
 */
import {
  enviarInvitacionCuenta,
  parseInvitacion,
  type DependenciasInvitacion,
} from '@/lib/platform/cuentas/invitacion-cuenta'

export type RespuestaRuta = { status: number; body: Record<string, unknown> }

const FUERA_DE_PLAZO =
  'Ya no se puede invitar desde aquí (pasó más de una hora o la registró otra persona). Un coordinador puede invitarla desde su ficha.'

export async function invitarFamiliaNueva(deps: DependenciasInvitacion, padreId: string, body: unknown): Promise<RespuestaRuta> {
  const entrada = parseInvitacion(body)
  if ('error' in entrada) return { status: 400, body: { error: 'Escribe un correo válido.' } }

  const r = await enviarInvitacionCuenta(deps, padreId, { email: entrada.email, reemplazarEmail: false })
  if (r.ok) return { status: 200, body: { ok: true, email: r.email } }
  if (r.codigo === 'sin_autoridad') return { status: 403, body: { error: FUERA_DE_PLAZO, codigo: r.codigo } }
  return { status: r.status, body: { error: r.error, ...(r.codigo ? { codigo: r.codigo } : {}) } }
}
