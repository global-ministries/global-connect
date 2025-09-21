import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

type Payload = {
  userIds: string[]
  rol: 'miembro' | 'lider' | 'pastor' | 'director-etapa' | 'director-general' | 'admin'
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // Resolver id interno del usuario (usuarios.id) a partir de auth_id
    const { data: me, error: meErr } = await supabase
      .from('usuarios')
      .select('id')
      .eq('auth_id', user.id)
      .single()
    if (meErr || !me?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    // Validar que sea admin usando usuarios.id
    const { data: rolesData, error: rolesErr } = await supabase
      .from('usuario_roles')
      .select('roles_sistema:roles_sistema!usuario_roles_rol_id_fkey (nombre_interno)')
      .eq('usuario_id', me.id)
    if (rolesErr) return NextResponse.json({ error: rolesErr.message }, { status: 500 })
    const esAdmin = (rolesData || []).some((r: any) => r.roles_sistema?.nombre_interno === 'admin')
    if (!esAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const body: Payload = await req.json()
    const { userIds, rol } = body || {}
    if (!Array.isArray(userIds) || userIds.length === 0 || !rol) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()

    // Resolver rol_id
    const { data: rolData, error: rolErr } = await admin
      .from('roles_sistema')
      .select('id, nombre_interno')
      .eq('nombre_interno', rol)
      .single()
    if (rolErr || !rolData) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 400 })

    // Para simplicidad, reemplazar rol principal: borrar existentes y asignar uno
    // (Si se desea multi-rol en el futuro, ajustar lógica)
    for (const uid of userIds) {
      await admin.from('usuario_roles').delete().eq('usuario_id', uid)
      await admin.from('usuario_roles').insert({ usuario_id: uid, rol_id: rolData.id })
    }

    return NextResponse.json({ ok: true, updated: userIds.length })
  } catch (e: any) {
    console.error('[usuarios/cambiar-rol] error', e)
    return NextResponse.json({ error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
