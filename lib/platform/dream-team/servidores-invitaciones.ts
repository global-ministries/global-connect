/**
 * Invitations to register shown in Servidores (T3 of
 * odd/tasks/invitaciones-pendientes.md, S4/S5): reads, as the caller, the
 * invitations of the fichas they may invite (invitacion_cuenta_estados, in
 * chunks of MAX_IDS_ESTADOS) and the fichas without account they may invite
 * (invitacion_cuenta_sin_cuenta, same chunks), summarizes the invitations per
 * person and attaches to each row its summary, `null` (may invite, never
 * invited) or nothing (no authority: no derived state, no count, no pill). A
 * convenience on top of the pool: a failed lookup logs the error code only and
 * leaves the rows as they were (no invitation data).
 */
import type { DependenciasInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'
import {
  MAX_IDS_ESTADOS,
  parseFilasEstados,
  resumirInvitaciones,
  type FilaEstado,
  type ResumenInvitacion,
} from '@/lib/platform/cuentas/invitaciones-pendientes'
import type { FilaServidor } from './servidores-vista'

type Rpc = DependenciasInvitacion['rpcUsuario']

/**
 * The untyped RPC of a Supabase client (the function is not in the generated
 * types yet), as rpcSinTipos in cuentas/dependencias-invitacion.ts; kept here
 * so the page does not load the email modules. Resolved on call, so a client
 * without `rpc` fails inside the lookup and reads as no data.
 */
export const rpcDeCliente =
  (cliente: { rpc?: unknown }): Rpc =>
  (nombre, args) =>
    (cliente.rpc as Rpc).call(cliente, nombre, args)

export interface InvitacionesServidores {
  /** One summary per person with an invitation the caller may see. */
  readonly resumenes: ReadonlyMap<string, ResumenInvitacion>
  /** The fichas without account the caller may invite. */
  readonly sinCuenta: ReadonlySet<string>
}

const idsDe = (data: unknown): string[] =>
  Array.isArray(data) ? data.filter((id): id is string => typeof id === 'string') : []

function fallo(codigo: string | undefined): null {
  console.error('[dream-team/servidores] invitaciones lookup failed', codigo)
  return null
}

/** What the caller may see of the invitations of `ids`; `null` when either lookup failed. */
export async function fetchInvitacionesServidores(
  rpc: Rpc,
  ids: readonly string[],
  ahora: Date,
): Promise<InvitacionesServidores | null> {
  const distintos = [...new Set(ids)]
  const filas: FilaEstado[] = []
  const sinCuenta = new Set<string>()
  try {
    for (let i = 0; i < distintos.length; i += MAX_IDS_ESTADOS) {
      const lote = distintos.slice(i, i + MAX_IDS_ESTADOS)
      const estados = await rpc('invitacion_cuenta_estados', { p_usuario_ids: lote })
      if (estados.error) return fallo(estados.error.code)
      const autorizados = await rpc('invitacion_cuenta_sin_cuenta', { p_usuario_ids: lote })
      if (autorizados.error) return fallo(autorizados.error.code)
      filas.push(...parseFilasEstados(estados.data))
      for (const id of idsDe(autorizados.data)) sinCuenta.add(id)
    }
  } catch {
    console.error('[dream-team/servidores] invitaciones lookup failed')
    return null
  }
  return {
    resumenes: new Map(resumirInvitaciones(filas, ahora).map((resumen) => [resumen.usuarioId, resumen])),
    sinCuenta,
  }
}

/**
 * Each row with its person's summary, `null` when the caller may invite them
 * but never did, no summary otherwise; and whether the caller may invite them
 * (`invitable`, which gates Invitar). Without data the rows are returned as
 * they were.
 */
export function adjuntarInvitaciones(
  filas: readonly FilaServidor[],
  invitaciones: InvitacionesServidores | null,
): readonly FilaServidor[] {
  if (invitaciones === null) return filas
  return filas.map((fila) => {
    const invitable = invitaciones.sinCuenta.has(fila.personaId)
    const resumen = invitaciones.resumenes.get(fila.personaId)
    if (resumen) return { ...fila, invitacion: resumen, invitable }
    return invitable ? { ...fila, invitacion: null, invitable } : { ...fila, invitable }
  })
}
