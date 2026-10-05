/**
 * Talleres — ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md
 * C2). Adds the access invitation estado to the inscription rows whose
 * partner ficha the member created, for the coordinator badge.
 *
 * `invitaciones_acceso` is service_role only, so it is read with the admin
 * client, and only for rows the caller already received through RLS.
 * Best effort: any failure returns the rows unchanged (badge without status).
 */

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

interface FilaConOrigen {
  readonly id: string
  readonly pareja_origen?: string | null
}

interface ClienteLectura {
  from(tabla: 'invitaciones_acceso'): {
    select(columnas: string): {
      in(columna: string, valores: readonly string[]): {
        order(columna: string, opciones: { ascending: boolean }): PromiseLike<{ data: unknown; error: unknown }>
      }
    }
  }
}

export async function conEstadoAcceso<T extends FilaConOrigen>(
  filas: readonly T[],
  crearAdmin: () => ClienteLectura = () => createSupabaseAdminClient() as unknown as ClienteLectura,
): Promise<
  readonly (T & { readonly acceso_estado?: string | null; readonly acceso_ultimo_envio_fallido?: boolean })[]
> {
  const ids = filas.filter((f) => f.pareja_origen === 'ficha_nueva').map((f) => f.id)
  if (ids.length === 0) return filas
  try {
    const { data, error } = await crearAdmin()
      .from('invitaciones_acceso')
      .select('inscripcion_id, estado, ultimo_error')
      .in('inscripcion_id', ids)
      .order('created_at', { ascending: false })
    if (error || !Array.isArray(data)) return filas
    // Newest first: keep the first estado seen per inscription.
    const estados = new Map<string, { estado: string; error: boolean }>()
    for (const fila of data as { inscripcion_id?: unknown; estado?: unknown; ultimo_error?: unknown }[]) {
      if (typeof fila.inscripcion_id === 'string' && typeof fila.estado === 'string' && !estados.has(fila.inscripcion_id)) {
        estados.set(fila.inscripcion_id, {
          estado: fila.estado,
          error: typeof fila.ultimo_error === 'string' && fila.ultimo_error !== '',
        })
      }
    }
    return filas.map((f) => {
      const e = estados.get(f.id)
      return e ? { ...f, acceso_estado: e.estado, acceso_ultimo_envio_fallido: e.error } : f
    })
  } catch {
    return filas
  }
}
