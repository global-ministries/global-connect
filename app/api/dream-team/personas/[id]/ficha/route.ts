/**
 * Dream Team — /api/dream-team/personas/[id]/ficha (T11 of
 * odd/tasks/ninos-voluntarios-waumba.md).
 *
 * GET   → { ficha }: the editable fields, to prefill the "Editar ficha" panel.
 * PATCH { fechaNacimiento?, cedula?, genero?, estadoCivil?, telefono?, redesSociales?, email? }
 *       → { ficha }: partial update, only the keys present change. The email of
 *       a person with account only by an admin (20261106100000): otherwise 403
 *       with that reason; an email another person holds → 409. When an admin
 *       changes it, the login email (auth.users) follows; if that fails the
 *       ficha's email goes back and the answer is 502 (409 when auth already
 *       holds the address; 502 "could not confirm" when auth cannot be re-read),
 *       the other fields stay saved (ficha-correo-auth.ts, S8). Logs carry ids
 *       and error codes only.
 *
 * There is no capability gate here, as in POST /api/dream-team/usuarios: the
 * volunteer coordinator's only grant is dream_team.coordinate, so the database
 * functions (dream_team_ficha_persona, dream_team_editar_ficha;
 * 20261008100000) are the one authority: 42501 → 403, a cedula another person
 * holds → 409, a validation error → 422.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { esUuid } from '@/lib/platform/dream-team/alta-persona'
import { adminCorreoDesdeCliente, editarFichaConCorreo } from '@/lib/platform/dream-team/ficha-correo-auth'
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
  if (f.status === 500) console.error(`[dream-team/personas/[id]/ficha ${metodo}] unexpected RPC error:`, error.code ?? 'sin_codigo')
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

    const r = await editarFichaConCorreo(
      { rpcUsuario: rpcSinTipos(await createSupabaseServerClient()), admin: () => adminCorreoDesdeCliente(createSupabaseAdminClient()) },
      id,
      input.datos,
    )
    if (!r.ok) {
      if (r.causa !== undefined) console.error('[dream-team/personas/[id]/ficha PATCH] error:', id, r.causa)
      return NextResponse.json({ error: r.error }, { status: r.status })
    }
    return NextResponse.json({ ficha: mapFicha(r.data) })
  } catch (error) {
    console.error('[dream-team/personas/[id]/ficha PATCH] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
