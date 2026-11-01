'use server'

/**
 * Familia in the Usuarios pending panel (S15 decision 10 of
 * odd/tasks/sistema-diseno-v2.md, T11b-2): thin server actions over
 * familia_pendientes_listar and familia_resolver
 * (supabase/migrations/20261101200000_mi_familia.sql) with the user's session
 * client. The RPCs decide who may resolve (the approver must be able to edit
 * both people), so a caller without rights just gets an empty list.
 */
import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  mensajeResolverFamilia,
  parseFamiliaPendientes,
  type SolicitudFamiliaPendiente,
} from '@/lib/platform/usuarios/familia-pendientes-vista'

export type ResultadoResolverFamilia =
  | { readonly ok: true; readonly codigo: 'APROBADA' | 'RECHAZADA'; readonly fichaCreada: boolean }
  | { readonly ok: false; readonly codigo: string | null; readonly mensaje: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The family requests the signed-in person may resolve. */
export async function listarFamiliaPendientes(): Promise<{ ok: boolean; solicitudes: SolicitudFamiliaPendiente[] }> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('familia_pendientes_listar')
  const solicitudes = error ? null : parseFamiliaPendientes(data)
  return solicitudes ? { ok: true, solicitudes } : { ok: false, solicitudes: [] }
}

export async function resolverFamiliaPendiente(id: string, aprobar: boolean): Promise<ResultadoResolverFamilia> {
  if (typeof id !== 'string' || !UUID_RE.test(id) || typeof aprobar !== 'boolean') {
    return { ok: false, codigo: 'PARAMETROS_INVALIDOS', mensaje: mensajeResolverFamilia('PARAMETROS_INVALIDOS') }
  }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('familia_resolver', { p_id: id, p_aprobar: aprobar })
  const res = (typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  const codigo = typeof res.codigo === 'string' ? res.codigo : null
  if (error || res.ok !== true || (codigo !== 'APROBADA' && codigo !== 'RECHAZADA')) {
    return { ok: false, codigo: error ? null : codigo, mensaje: mensajeResolverFamilia(error ? null : codigo) }
  }
  // An approval may create a ficha and always adds a relation: the list and the fichas change.
  if (codigo === 'APROBADA') revalidatePath('/users')
  return { ok: true, codigo, fichaCreada: res.ficha_creada === true }
}
