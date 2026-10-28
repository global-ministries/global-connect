/**
 * Shared by the write routes of a dated shift's dates (T2 of
 * odd/tasks/tlr-calendario-servicios.md): the flag and session gate, the ids
 * of the path and the answer to a refusal of the database functions, which
 * are the one authority (A1, dream_team_puede_gestionar_turno).
 */
import { NextResponse } from 'next/server'

import { esUuid } from '@/lib/platform/dream-team/alta-persona'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { estadoErrorTurnoFecha, mensajeErrorTurnoFecha } from '@/lib/platform/dream-team/turno-fechas'

export type Ctx<P> = { params: Promise<P> | P }

export const resolverParams = async <P>(ctx: Ctx<P>): Promise<P> =>
  ctx.params instanceof Promise ? await ctx.params : (ctx.params as P)

/** A response when the flag is off, there is no session or an id is not a uuid; null to go on. */
export async function rechazoPrevio(ids: readonly string[]): Promise<NextResponse | null> {
  if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await requireDreamTeamSession())) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!ids.every(esUuid)) return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 })
  return null
}

export async function leerCuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const cuerpo: unknown = await req.json()
    return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** A refusal of the database as { error } in Spanish with its status; anything unexpected is a logged 500. */
export function respuestaDeError(error: unknown, contexto: string): NextResponse {
  const base = error as { code?: string; message?: string } | null
  const status = estadoErrorTurnoFecha(base)
  if (status === 500) {
    console.error(`[dream-team/turnos] ${contexto} error:`, error)
    return NextResponse.json({ error: 'Error interno' }, { status })
  }
  return NextResponse.json({ error: mensajeErrorTurnoFecha(base) }, { status })
}
