/**
 * Dream Team — /api/dream-team/personas/[id]/ficha (T11 of
 * odd/tasks/ninos-voluntarios-waumba.md).
 *
 * GET   → { ficha }: the editable fields, to prefill the "Editar ficha" panel.
 * PATCH { fechaNacimiento?, cedula?, genero?, estadoCivil?, telefono?, redesSociales? }
 *       → { ficha }: partial update, only the keys present change.
 *
 * There is no capability gate here, as in POST /api/dream-team/usuarios: the
 * volunteer coordinator's only grant is dream_team.coordinate, so the database
 * functions (dream_team_ficha_persona, dream_team_editar_ficha;
 * 20261008100000) are the one authority: 42501 → 403, a cedula another person
 * holds → 409, a validation error → 422.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { esUuid } from '@/lib/platform/dream-team/alta-persona'
import { mapFicha, mapFichaError, parseEditarFicha } from '@/lib/platform/dream-team/ficha-persona'

// The functions are not in the generated database types yet, so the call is
// untyped (the same pattern lib/platform/dream-team/personas.ts uses).
type RpcSinTipos = (fn: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown
  error: { code?: string; message?: string } | null
}>
const rpcSinTipos = (supabase: { rpc: unknown }): RpcSinTipos =>
  (supabase.rpc as (...a: unknown[]) => ReturnType<RpcSinTipos>).bind(supabase) as RpcSinTipos

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id

function fallo(error: { code?: string; message?: string }, metodo: string) {
  const f = mapFichaError(error)
  if (f.status === 500) console.error(`[dream-team/personas/[id]/ficha ${metodo}] error:`, error)
  return NextResponse.json({ error: f.error }, { status: f.status })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const id = await resolveId(ctx)
    if (!esUuid(id)) return NextResponse.json({ error: 'Persona inválida' }, { status: 400 })

    const { data, error } = await rpcSinTipos(await createSupabaseServerClient())('dream_team_ficha_persona', { p_persona_id: id })
    if (error) return fallo(error, 'GET')
    if (!data) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })
    return NextResponse.json({ ficha: mapFicha(data) })
  } catch (error) {
    console.error('[dream-team/personas/[id]/ficha GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const id = await resolveId(ctx)
    if (!esUuid(id)) return NextResponse.json({ error: 'Persona inválida' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
    const input = parseEditarFicha(body)
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

    const { data, error } = await rpcSinTipos(await createSupabaseServerClient())('dream_team_editar_ficha', { p_persona_id: id, p_datos: input.datos })
    if (error) return fallo(error, 'PATCH')
    return NextResponse.json({ ficha: mapFicha(data) })
  } catch (error) {
    console.error('[dream-team/personas/[id]/ficha PATCH] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
