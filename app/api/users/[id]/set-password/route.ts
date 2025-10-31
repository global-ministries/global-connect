import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

const schema = z.object({
  newPassword: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const { params } = ctx
    const targetUserAuthId = params?.id
    if (!targetUserAuthId) {
      return NextResponse.json({ error: 'Falta el parámetro id de usuario' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const current = await getUserWithRoles(supabase)

    if (!current?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const isAdmin = (current.roles || []).includes('admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'No autorizado. Solo administradores.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const parse = schema.safeParse(body)
    if (!parse.success) {
      return NextResponse.json({ error: parse.error.issues?.[0]?.message || 'Payload inválido' }, { status: 400 })
    }

    const { newPassword } = parse.data

    const supabaseAdmin = createSupabaseAdminClient()
    const maxIntentos = 5
    const baseDelayMs = 500
    let ultimoError: any = null

    for (let intento = 0; intento < maxIntentos; intento++) {
      try {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserAuthId, { password: newPassword })
        if (!error) {
          return NextResponse.json({ ok: true, message: 'Contraseña actualizada correctamente' })
        }
        ultimoError = error
        const msg = String(error?.message || '')
        const reintentar = /protocol error|incomplete envelope|reset by peer|ECONNRESET|ETIMEDOUT/i.test(msg)
        if (!reintentar) break
      } catch (err: any) {
        ultimoError = err
        const msg = String(err?.message || '')
        const reintentar = /protocol error|incomplete envelope|reset by peer|ECONNRESET|ETIMEDOUT/i.test(msg)
        if (!reintentar) break
      }
      // backoff exponencial
      const esperar = baseDelayMs * Math.pow(2, intento)
      await new Promise((r) => setTimeout(r, esperar))
    }

    return NextResponse.json({ error: (ultimoError?.message || 'No se pudo asignar la contraseña (servicio de auth no disponible)') }, { status: 502 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
