/**
 * POST /api/ninos/mis-hijos/[id] — a parent saves a child's data from Mis
 * hijos (odd/tasks/ninos-mis-hijos.md, M6c).
 *
 * { payload } → { campos } (the fields that changed). The save runs AS THE
 * USER (ninos_mis_hijos_guardar). When the pickup list changed, the other
 * linked parents get an email after the response; the recipients are read
 * server-side with the service role and never reach the client.
 */
import { createElement } from 'react'
import { after, NextRequest, NextResponse } from 'next/server'

import { sendEmail } from '@/lib/email/send'
import { NinosAutorizadosEmail } from '@/lib/email/ninos-autorizados-email'
import { guardarMiHijo } from '@/lib/platform/ninos/aviso-autorizados'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import { rpcSinTipos } from '../../_lib/avisos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The RPC refuses payloads over 32 KB; a little room for the envelope. */
const MAX_CUERPO = 40_000

type Ctx = { params: Promise<{ id: string }> }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: auth, error: errorAuth } = await supabase.auth.getUser()
    if (errorAuth || !auth?.user) return NextResponse.json({ error: { code: '401' } }, { status: 401 })
    const { id } = await ctx.params
    if (!UUID.test(id)) return NextResponse.json({ error: { code: '22023' } }, { status: 400 })

    const crudo = await req.text()
    if (crudo.length > MAX_CUERPO) return NextResponse.json({ error: { code: '22023' } }, { status: 413 })
    let body: unknown
    try { body = JSON.parse(crudo) } catch { return NextResponse.json({ error: { code: '22023' } }, { status: 400 }) }
    if (!esObjeto(body) || !esObjeto(body.payload)) return NextResponse.json({ error: { code: '22023' } }, { status: 400 })

    const r = await guardarMiHijo(
      {
        rpcUsuario: rpcSinTipos(supabase),
        rpcAdmin: () => rpcSinTipos(createSupabaseAdminClient()),
        enviar: ({ to, subject, nombre, lineas, idempotencyKey }) =>
          sendEmail({ to, subject, template: createElement(NinosAutorizadosEmail, { nombre, lineas }), idempotencyKey }),
        enSegundoPlano: (tarea) => after(tarea),
      },
      { authId: auth.user.id, ninoId: id, payload: body.payload },
    )
    return NextResponse.json(r.body, { status: r.status })
  } catch {
    console.error('[ninos/mis-hijos/[id]] error inesperado')
    return NextResponse.json({ error: { code: '500' } }, { status: 500 })
  }
}
