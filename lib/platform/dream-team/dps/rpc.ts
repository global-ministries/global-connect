/**
 * DPS planning — the untyped RPC of a Supabase client: the dps_* functions
 * are not in the generated types (lib/supabase/database.types.ts) yet, as
 * rpcDeCliente in lib/platform/dream-team/servidores-invitaciones.ts.
 * Resolved on call, so a client without `rpc` fails inside the caller's
 * try/catch and reads as no data.
 */
import type { ErrorRpc } from './errores'

export interface RespuestaRpc {
  readonly data: unknown
  readonly error: ErrorRpc | null
}

export type RpcDps = (nombre: string, args?: Record<string, unknown>) => PromiseLike<RespuestaRpc>

export const rpcDps =
  (cliente: { rpc?: unknown }): RpcDps =>
  (nombre, args) =>
    (cliente.rpc as RpcDps).call(cliente, nombre, args)
