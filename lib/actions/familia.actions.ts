'use server'

/**
 * Mi familia in Mi perfil (S15 of odd/tasks/sistema-diseno-v2.md, T11b-1):
 * thin server actions over the familia_* RPCs of
 * supabase/migrations/20261101200000_mi_familia.sql, always with the user's
 * session client (the actor is auth.uid() inside each SECURITY DEFINER
 * function). A search candidate travels only as its opaque token, never as a
 * usuarios id. Every answer becomes { ok, data } or { ok: false, codigo,
 * mensaje } with the tuteo message of lib/platform/usuarios/familia-vista.ts.
 */
import { revalidatePath } from 'next/cache'

import type { Json } from '@/lib/supabase/database.types'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  codigoDe,
  datosSinCuenta,
  mensajeFamilia,
  parseCandidatos,
  parseMiFamilia,
  validarSinCuenta,
  type CandidatoFamilia,
  type DatoVerificacion,
  type FormSinCuenta,
  type MiFamilia,
  type TipoFamilia,
  RELACIONES_FAMILIA,
} from '@/lib/platform/usuarios/familia-vista'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'

export type ResultadoFamilia<T = null> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly codigo: string | null; readonly mensaje: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
const esTipo = (v: unknown): v is TipoFamilia => RELACIONES_FAMILIA.some((r) => r.valor === v)

const fallo = (codigo: string | null): { ok: false; codigo: string | null; mensaje: string } => ({ ok: false, codigo, mensaje: mensajeFamilia(codigo) })

type Rpc = (cliente: Awaited<ReturnType<typeof createSupabaseServerClient>>) => PromiseLike<{ data: Json | null; error: unknown }>

/** Runs one RPC with the session client and hands back its jsonb answer, or the failure. */
async function llamar(rpc: Rpc): Promise<{ ok: true; json: Json } | { ok: false; codigo: string | null; mensaje: string }> {
  const cliente = await createSupabaseServerClient()
  const { data: { user } } = await cliente.auth.getUser()
  if (!user) return fallo('SIN_SESION')
  const { data, error } = await rpc(cliente)
  if (error || data === null) return fallo(null)
  const json = data as { ok?: unknown }
  if (typeof json === 'object' && json !== null && json.ok === true) return { ok: true, json: data }
  return fallo(codigoDe(data))
}

/** A mutation: the answer's codigo on success, and /perfil re-rendered. */
async function mutar(rpc: Rpc): Promise<ResultadoFamilia<string | null>> {
  const r = await llamar(rpc)
  if (!r.ok) return r
  revalidatePath('/perfil')
  return { ok: true, data: codigoDe(r.json) }
}

export async function cargarMiFamilia(): Promise<ResultadoFamilia<MiFamilia>> {
  const r = await llamar((c) => c.rpc('familia_mis_solicitudes'))
  if (!r.ok) return r
  const familia = parseMiFamilia(r.json)
  return familia ? { ok: true, data: familia } : fallo(null)
}

export async function buscarFamiliar(q: string): Promise<ResultadoFamilia<CandidatoFamilia[]>> {
  if (typeof q !== 'string') return fallo('BUSQUEDA_CORTA')
  const r = await llamar((c) => c.rpc('familia_buscar', { p_q: q.slice(0, 100) }))
  return r.ok ? { ok: true, data: parseCandidatos(r.json) } : r
}

/** Does the datum match the person behind the token? The server answers only yes or no. */
export async function verificarFamiliar(token: string, dato: DatoVerificacion): Promise<ResultadoFamilia<boolean>> {
  if (!esUuid(token)) return fallo('NO_ENCONTRADO')
  const args = 'ultimos4' in dato
    ? { p_candidato: token, p_ultimos4: String(dato.ultimos4) }
    : { p_candidato: token, p_dia: Number(dato.dia), p_mes: Number(dato.mes) }
  const r = await llamar((c) => c.rpc('familia_verificar', args))
  if (!r.ok) return r
  return { ok: true, data: (r.json as { coincide?: unknown }).coincide === true }
}

export async function solicitarFamiliar(token: string, tipo: TipoFamilia): Promise<ResultadoFamilia<string | null>> {
  if (!esUuid(token)) return fallo('NO_ENCONTRADO')
  if (!esTipo(tipo)) return fallo('TIPO_INVALIDO')
  return mutar((c) => c.rpc('familia_solicitar', { p_candidato: token, p_tipo: tipo }))
}

export async function solicitarFamiliarSinCuenta(form: FormSinCuenta, tipo: TipoFamilia): Promise<ResultadoFamilia<string | null>> {
  if (!esTipo(tipo)) return fallo('TIPO_INVALIDO')
  const { errores, menor } = validarSinCuenta(form, tipo, hoyEnCaracas())
  if (menor) return fallo('USAR_MIS_HIJOS')
  if (Object.keys(errores).length > 0) return fallo('DATOS_INVALIDOS')
  return mutar((c) => c.rpc('familia_solicitar_sin_cuenta', { p_datos: datosSinCuenta(form), p_tipo: tipo }))
}

export async function responderSolicitud(id: string, aceptar: boolean): Promise<ResultadoFamilia<string | null>> {
  if (!esUuid(id) || typeof aceptar !== 'boolean') return fallo('NO_ENCONTRADO')
  return mutar((c) => c.rpc('familia_responder', { p_id: id, p_aceptar: aceptar }))
}

export async function cancelarSolicitud(id: string): Promise<ResultadoFamilia<string | null>> {
  if (!esUuid(id)) return fallo('NO_ENCONTRADO')
  return mutar((c) => c.rpc('familia_cancelar', { p_id: id }))
}

export async function quitarFamiliar(relacionId: string): Promise<ResultadoFamilia<string | null>> {
  if (!esUuid(relacionId)) return fallo('NO_ENCONTRADO')
  return mutar((c) => c.rpc('familia_quitar', { p_relacion_id: relacionId }))
}
