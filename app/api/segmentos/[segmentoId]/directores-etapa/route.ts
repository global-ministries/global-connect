import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getUserWithRoles } from '@/lib/getUserWithRoles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// Nota: manejar params potencialmente como Promise (Next.js >= 15 msg sync-dynamic-apis)
export async function GET(req: Request, context: { params: Promise<{ segmentoId: string }> | { segmentoId: string } }) {
  try {
    const awaitedParams = 'then' in context.params ? await context.params : context.params;
    const { segmentoId } = awaitedParams;
    if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido' }, { status: 400 });
    const supabase = await createSupabaseServerClient();

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const url = new URL(req.url);
    const debug = url.searchParams.get('debug') === '1';

    // Intento primario: join anidado (puede fallar silenciosamente bajo RLS devolviendo 0 filas)
    const { data: dataJoin, error: errorJoin } = await supabase
      .from('segmento_lideres')
      .select('id, usuario_id, usuario:usuario_id (nombre, apellido, email, foto_perfil_url)')
      .eq('segmento_id', segmentoId)
      .eq('tipo_lider', 'director_etapa')
      .limit(100);

    if (errorJoin) {
      console.warn('[directores-etapa] errorJoin', errorJoin.message);
    }

    let registros = dataJoin || [];

    // Fallback: si vacío, intentar obtener ids y luego fetch usuarios en dos pasos (más tolerante a RLS)
    if (registros.length === 0) {
      const { data: filasBase, error: baseErr } = await supabase
        .from('segmento_lideres')
        .select('id, usuario_id')
        .eq('segmento_id', segmentoId)
        .eq('tipo_lider', 'director_etapa')
        .limit(100);
      if (baseErr) {
        console.warn('[directores-etapa] baseErr', baseErr.message);
      }
      if (filasBase && filasBase.length > 0) {
        const usuarioIds = [...new Set(filasBase.map(f => f.usuario_id))];
        let usuariosMap = new Map<string, { nombre: string; apellido: string; email?: string | null; foto_perfil_url?: string | null }>();
        if (usuarioIds.length > 0) {
          const { data: usuariosData, error: usuariosErr } = await supabase
            .from('usuarios')
            .select('id, nombre, apellido, email, foto_perfil_url')
            .in('id', usuarioIds)
            .limit(200);
          if (usuariosErr) {
            console.warn('[directores-etapa] usuariosErr', usuariosErr.message);
          } else {
            for (const u of usuariosData || []) {
              usuariosMap.set(u.id, { nombre: u.nombre || '', apellido: u.apellido || '', email: u.email || null, foto_perfil_url: (u as any).foto_perfil_url || null });
            }
          }
        }
        registros = filasBase.map(f => {
          const info = usuariosMap.get(f.usuario_id) || { nombre: '', apellido: '', email: null, foto_perfil_url: null };
            return {
              id: f.id,
              usuario_id: f.usuario_id,
              usuario: info
            } as any;
        });
      }
    }

    const directores = registros.map((d: any) => {
      const baseNombre = `${d.usuario?.nombre || ''} ${d.usuario?.apellido || ''}`.trim();
      const fallback = d.usuario?.email || '(Sin nombre)';
      return {
        id: d.id,
        usuario_id: d.usuario_id,
        nombre: baseNombre || fallback,
        foto_perfil_url: d.usuario?.foto_perfil_url || null
      };
    });

    if (debug) {
      // Consulta adicional sin filtros (solo limit) para ver cuántas filas se pueden ver en total bajo RLS
      const { data: allVisible, error: allVisibleErr } = await supabase
        .from('segmento_lideres')
        .select('id, segmento_id, usuario_id, tipo_lider')
        .limit(50);
      return NextResponse.json({
        debug: true,
        total: directores.length,
        directores,
        dataJoinCount: (dataJoin || []).length,
        fallbackApplied: (dataJoin || []).length === 0,
        allVisibleCount: (allVisible || []).length,
        sampleAllVisible: allVisible,
        joinError: errorJoin?.message,
        allVisibleErr: allVisibleErr?.message
      });
    }

    return NextResponse.json({ directores, total: directores.length });
  } catch (e: any) {
    console.error('[directores-etapa] Exception', e);
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 });
  }
}

// POST: asignar o quitar un director de etapa a un grupo
export async function POST(req: Request, context: { params: Promise<{ segmentoId: string }> | { segmentoId: string } }) {
  try {
    const awaitedParams = 'then' in context.params ? await context.params : context.params;
    const { segmentoId } = awaitedParams;
    if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const supabaseAdmin = createSupabaseAdminClient();
  const userWithRoles = await getUserWithRoles(supabase);
  if (!userWithRoles) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    let payload: any;
    try { payload = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
    const { director_etapa_segmento_lider_id, grupo_id, accion } = payload || {};
    if (!director_etapa_segmento_lider_id || !grupo_id || !accion) {
      return NextResponse.json({ error: 'director_etapa_segmento_lider_id, grupo_id y accion requeridos' }, { status: 400 });
    }
    if (!['agregar','quitar'].includes(accion)) {
      return NextResponse.json({ error: 'accion debe ser agregar|quitar' }, { status: 400 });
    }

    // Intentar RPC oficial
    let rpcError: any = null;
    const { error: rpcErr } = await supabase.rpc('asignar_director_etapa_a_grupo', {
      p_auth_id: user.id,
      p_grupo_id: grupo_id,
      p_segmento_lider_id: director_etapa_segmento_lider_id,
      p_accion: accion
    });
    rpcError = rpcErr;
    if (rpcError && /(could not find|does not exist)/i.test(rpcError.message)) {
      // Fallback directo
      if (accion === 'agregar') {
        const { error: insErr } = await supabase.from('director_etapa_grupos').insert({ director_etapa_id: director_etapa_segmento_lider_id, grupo_id });
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
      } else if (accion === 'quitar') {
        const { error: delErr } = await supabase.from('director_etapa_grupos').delete().eq('director_etapa_id', director_etapa_segmento_lider_id).eq('grupo_id', grupo_id);
        if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
      }
      rpcError = null; // considerado resuelto por fallback
    } else if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // Listar asignaciones actuales de ese director (para refrescar UI)
    const { data: asignaciones, error: listErr } = await supabase
      .from('director_etapa_grupos')
      .select('id, grupo_id')
      .eq('director_etapa_id', director_etapa_segmento_lider_id)
      .limit(200);
    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, asignaciones });
  } catch (e: any) {
    console.error('[directores-etapa POST] Exception', e);
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 });
  }
}

// DELETE: elimina un director de etapa del segmento (y su ciudad asociada si existe)
export async function DELETE(req: Request, context: { params: Promise<{ segmentoId: string }> | { segmentoId: string } }) {
  try {
    const awaitedParams = 'then' in context.params ? await context.params : context.params;
    const { segmentoId } = awaitedParams;
    if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido' }, { status: 400 });
    const supabase = await createSupabaseServerClient();
    const supabaseAdmin = createSupabaseAdminClient();
    const userData = await getUserWithRoles(supabase);
    if (!userData) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const roles = userData.roles || [];
    const esSuperior = roles.some(r => ['admin','pastor','director-general'].includes(r));
    if (!esSuperior) return NextResponse.json({ error: 'Permiso denegado', rolesActuales: roles }, { status: 403 });

    const url = new URL(req.url);
    const directorId = url.searchParams.get('directorId'); // id de segmento_lideres
    if (!directorId) return NextResponse.json({ error: 'directorId requerido' }, { status: 400 });

    // Obtener registro del director usando admin para evitar RLS
    const { data: dirRow, error: dirErr } = await supabaseAdmin
      .from('segmento_lideres')
      .select('id, segmento_id, tipo_lider')
      .eq('id', directorId)
      .maybeSingle();
    if (dirErr) return NextResponse.json({ error: dirErr.message }, { status: 400 });
    if (!dirRow) return NextResponse.json({ error: 'Director no encontrado' }, { status: 404 });
    if (dirRow.segmento_id !== segmentoId) return NextResponse.json({ error: 'No pertenece al segmento' }, { status: 403 });
    if (dirRow.tipo_lider !== 'director_etapa') return NextResponse.json({ error: 'Registro no es director_etapa' }, { status: 400 });

    // Eliminar ubicación asociada (unique por director)
    const { error: delUbicErr } = await supabaseAdmin
      .from('director_etapa_ubicaciones')
      .delete()
      .eq('director_etapa_id', directorId);
    if (delUbicErr) return NextResponse.json({ error: delUbicErr.message }, { status: 400 });

    // Eliminar asignaciones de grupos (si existen)
    const { error: delGruposErr } = await supabaseAdmin
      .from('director_etapa_grupos')
      .delete()
      .eq('director_etapa_id', directorId);
    if (delGruposErr) return NextResponse.json({ error: delGruposErr.message }, { status: 400 });

    // Eliminar registro principal
    const { error: delDirErr } = await supabaseAdmin
      .from('segmento_lideres')
      .delete()
      .eq('id', directorId);
    if (delDirErr) return NextResponse.json({ error: delDirErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[directores-etapa DELETE] Exception', e);
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 });
  }
}
