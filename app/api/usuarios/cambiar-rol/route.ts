import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

/*
POST /api/usuarios/cambiar-rol
Body: { userIds: string[], rol: 'miembro'|'lider'|'pastor'|'director-etapa'|'director-general'|'admin' }
Reemplaza (upsert) el rol principal del usuario:
  - Elimina cualquier rol existente del set manejado y asigna el nuevo
  - Requiere que el solicitante sea admin
Nota: Si se desea permitir escalonamiento por otros roles superiores, ajustar la lista allowed.
*/

const ROLES_VALIDOS = ['miembro','lider','pastor','director-etapa','director-general','admin'];

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const supabaseAdmin = createSupabaseAdminClient();
    const userData = await getUserWithRoles(supabase);
    if (!userData) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const solicitanteRoles = userData.roles || [];
    const esAdmin = solicitanteRoles.includes('admin');
    if (!esAdmin) return NextResponse.json({ error: 'Permiso denegado', rolesActuales: solicitanteRoles }, { status: 403 });

    let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
    const { userIds, rol } = body || {};
    if (!Array.isArray(userIds) || userIds.length === 0) return NextResponse.json({ error: 'userIds requerido' }, { status: 400 });
    if (!ROLES_VALIDOS.includes(rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });

    // Obtener ids de roles_sistema
    const { data: rolesSistema, error: rolesErr } = await supabaseAdmin.from('roles_sistema').select('id, nombre_interno').in('nombre_interno', ROLES_VALIDOS);
    if (rolesErr) return NextResponse.json({ error: rolesErr.message }, { status: 500 });
    const rolTarget = rolesSistema.find(r => r.nombre_interno === rol);
    if (!rolTarget) return NextResponse.json({ error: 'Rol no encontrado en catálogo' }, { status: 400 });

    // Para simplificar: borrar roles previos del set manejado y luego insertar solo el nuevo
    const roleIdsManejados = rolesSistema.map(r => r.id);

    // Borrado en bloque
    const { error: delErr } = await supabaseAdmin
      .from('usuario_roles')
      .delete()
      .in('usuario_id', userIds)
      .in('rol_id', roleIdsManejados);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    // Insertar nuevos
    const rowsInsert = userIds.map(uid => ({ usuario_id: uid, rol_id: rolTarget.id }));
    const { error: insErr } = await supabaseAdmin.from('usuario_roles').insert(rowsInsert);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: userIds.length, rol });
  } catch (e: any) {
    console.error('[cambiar-rol] Exception', e);
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 });
  }
}
