import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ allowed: false }, { status: 200 })

  const [{ data: allowed }, { data: rolesData }] = await Promise.all([
    supabase.rpc('puede_ver_debug_toolbar', { p_auth_id: user.id }),
    supabase.rpc('obtener_roles_usuario', { p_auth_id: user.id }),
  ])

  return NextResponse.json({ allowed: !!allowed, roles: rolesData || [], authId: user.id, email: user.email })
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const nuevoRol: string | undefined = body?.rol
  if (!nuevoRol) return NextResponse.json({ ok: false, error: 'Rol requerido' }, { status: 400 })

  const { data, error } = await supabase.rpc('debug_cambiar_rol', { p_auth_id: user.id, p_nuevo_rol: nuevoRol })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: !!data })
}
