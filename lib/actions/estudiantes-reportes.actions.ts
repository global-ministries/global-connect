'use server'

/**
 * Estudiantes — server actions of the reports screen (/estudiantes/reportes,
 * C6d3 of odd/tasks/estudiantes-fase-b.md, S17–S19): the group and person
 * drawers load estudiantes_reporte_detalle when they open, with the session
 * client and named parameters (exactly one of p_grupo_id / p_persona_id).
 * For The Living Room the person drawer also loads the 4 connections of one
 * person (C7c, S21) from estudiantes_reporte_conexiones with p_persona_id.
 * Read only: nothing is revalidated.
 *
 * Gate: an authenticated session only. Who may read is decided in the
 * database (sub-área level >= 2, campus rule), which raises its code as the
 * message (supabase/migrations/20261102140000_estudiantes_reportes.sql and
 * 20261102170500_estudiantes_reporte_conexiones.sql);
 * lib/platform/estudiantes/reportes.ts turns it into Spanish.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { leerConexionesPersona, type ConexionesPersona } from '@/lib/platform/estudiantes/conexiones'
import {
  MENSAJES_ERROR_REPORTES,
  SIN_CARGAR_REPORTE,
  codigoErrorReportes,
  leerDetalleGrupo,
  leerDetallePersona,
  mensajeErrorReportes,
  type CodigoErrorReportes,
  type DetalleGrupoReporte,
  type DetallePersonaReporte,
} from '@/lib/platform/estudiantes/reportes'

export type ResultadoReporte<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string; readonly codigo: CodigoErrorReportes | null }

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const esFecha = (valor: unknown): valor is string =>
  typeof valor === 'string' && FECHA_RE.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`))

interface Rango {
  readonly desde: string
  readonly hasta: string
}

const invalido = (codigo: 'parametros_invalidos' | 'rango_invalido') => ({ ok: false as const, message: MENSAJES_ERROR_REPORTES[codigo], codigo })

/** A range check before calling, so a bad date never reaches the RPC. */
function revisarRango(input: Partial<Rango> | null | undefined): ReturnType<typeof invalido> | null {
  if (!esFecha(input?.desde) || !esFecha(input?.hasta)) return invalido('parametros_invalidos')
  if (input.desde > input.hasta) return invalido('rango_invalido')
  return null
}

type RpcReporte = 'estudiantes_reporte_detalle' | 'estudiantes_reporte_conexiones'

async function leerDetalle<T>(args: Record<string, string>, leer: (data: unknown) => T | null, rpc: RpcReporte = 'estudiantes_reporte_detalle'): Promise<ResultadoReporte<T>> {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  if (!user) return { ok: false, message: SIN_SESION, codigo: null }

  const { data, error } = await cliente.rpc(rpc, args as { p_ambito_id: string; p_campus_id: string; p_desde: string; p_hasta: string })
  if (error) return { ok: false, message: mensajeErrorReportes(error), codigo: codigoErrorReportes(error) }
  const detalle = leer(data)
  if (!detalle) return { ok: false, message: SIN_CARGAR_REPORTE, codigo: null }
  return { ok: true, data: detalle }
}

export interface DetalleGrupoInput extends Rango {
  readonly grupoId: string
}

/** A group's meetings, summary and members in the range. */
export async function detalleGrupoReporte(input: DetalleGrupoInput): Promise<ResultadoReporte<DetalleGrupoReporte>> {
  const rango = revisarRango(input)
  if (rango) return rango
  if (!esUuid(input.grupoId)) return invalido('parametros_invalidos')
  return leerDetalle({ p_desde: input.desde, p_hasta: input.hasta, p_grupo_id: input.grupoId }, leerDetalleGrupo)
}

export interface DetallePersonaInput extends Rango {
  readonly personaId: string
  /** The ámbito of the report: the person's meetings in its groups only. */
  readonly ambitoId: string
}

/** A person's meeting-by-meeting attendance in the range, in the groups of one ámbito the caller sees. */
export async function detallePersonaReporte(input: DetallePersonaInput): Promise<ResultadoReporte<DetallePersonaReporte>> {
  const rango = revisarRango(input)
  if (rango) return rango
  if (!esUuid(input.personaId) || !esUuid(input.ambitoId)) return invalido('parametros_invalidos')
  return leerDetalle({ p_desde: input.desde, p_hasta: input.hasta, p_persona_id: input.personaId, p_ambito_id: input.ambitoId }, leerDetallePersona)
}

export interface ConexionesPersonaInput extends Rango {
  readonly personaId: string
  /** The The Living Room ámbito of the report. */
  readonly ambitoId: string
  readonly campusId: string
}

/** The 4 connections of one young adult of The Living Room in the range (S21). */
export async function conexionesPersonaReporte(input: ConexionesPersonaInput): Promise<ResultadoReporte<ConexionesPersona>> {
  const rango = revisarRango(input)
  if (rango) return rango
  if (!esUuid(input.personaId) || !esUuid(input.ambitoId) || !esUuid(input.campusId)) return invalido('parametros_invalidos')
  return leerDetalle(
    { p_ambito_id: input.ambitoId, p_campus_id: input.campusId, p_desde: input.desde, p_hasta: input.hasta, p_persona_id: input.personaId },
    (data) => leerConexionesPersona(data, input.personaId),
    'estudiantes_reporte_conexiones',
  )
}
