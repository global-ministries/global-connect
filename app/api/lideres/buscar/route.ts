import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/lideres/buscar
 *
 * Busca usuarios con rol 'lider' y devuelve información de sus grupos
 * actuales para saber quién está disponible.
 *
 * Query params:
 *  - q: término de búsqueda (nombre, apellido, email)
 *  - segmento_id: opcional, filtrar líderes por segmento de su grupo
 *  - limit: máximo de resultados (default 30)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const segmentoId = searchParams.get('segmento_id') || null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 200);

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    // 1. Obtener el rol_id de 'lider'
    const { data: rolData } = await admin
      .from('roles_sistema')
      .select('id')
      .eq('nombre_interno', 'lider')
      .maybeSingle();

    if (!rolData) {
      return NextResponse.json({ lideres: [], total: 0 });
    }

    // 2. Obtener usuario_ids que tienen rol 'lider'
    const { data: rolUsuarios } = await admin
      .from('usuario_roles')
      .select('usuario_id')
      .eq('rol_id', rolData.id)
      .limit(500);

    if (!rolUsuarios || rolUsuarios.length === 0) {
      return NextResponse.json({ lideres: [], total: 0 });
    }

    const liderUserIds = rolUsuarios.map(r => r.usuario_id);

    // 3. Buscar usuarios que son líderes, filtrar por búsqueda
    let query = admin
      .from('usuarios')
      .select('id, nombre, apellido, email, foto_perfil_url')
      .in('id', liderUserIds)
      .order('nombre')
      .limit(limit);

    if (q) {
      // Buscar en nombre, apellido o email
      query = query.or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data: usuarios, error: usrErr } = await query;
    if (usrErr) {
      return NextResponse.json({ error: usrErr.message }, { status: 400 });
    }
    if (!usuarios || usuarios.length === 0) {
      return NextResponse.json({ lideres: [], total: 0 });
    }

    const userIds = usuarios.map(u => u.id);

    // 4. Obtener todas las asignaciones como "Líder" de estos usuarios en grupos NO eliminados
    const { data: asignaciones } = await admin
      .from('grupo_miembros')
      .select(`
        usuario_id,
        rol,
        grupo_id,
        grupos!inner (
          id,
          nombre,
          activo,
          estado_ciclo,
          estado_aprobacion,
          eliminado,
          temporada_id,
          segmento_id,
          temporadas!inner (
            id,
            nombre,
            activa,
            estado
          )
        )
      `)
      .in('usuario_id', userIds)
      .eq('rol', 'Líder')
      .eq('grupos.eliminado', false)
      .limit(500);

    // 5. Agrupar asignaciones por usuario
    type GrupoInfo = {
      grupo_nombre: string;
      grupo_activo: boolean;
      temporada_nombre: string;
      temporada_estado: string;
      temporada_activa: boolean;
      segmento_id: string;
    };

    const asignacionesPorUsuario = new Map<string, GrupoInfo[]>();

    for (const a of asignaciones || []) {
      const grupo = a.grupos as any;
      if (!grupo) continue;
      const temporada = grupo.temporadas as any;
      if (!temporada) continue;

      const info: GrupoInfo = {
        grupo_nombre: grupo.nombre,
        grupo_activo: grupo.activo && grupo.estado_aprobacion === 'aprobado',
        temporada_nombre: temporada.nombre,
        temporada_estado: temporada.estado,
        temporada_activa: temporada.activa,
        segmento_id: grupo.segmento_id,
      };

      const lista = asignacionesPorUsuario.get(a.usuario_id) || [];
      lista.push(info);
      asignacionesPorUsuario.set(a.usuario_id, lista);
    }

    // 6. Construir respuesta con estado de liderazgo
    const lideres = usuarios.map(u => {
      const grupos = asignacionesPorUsuario.get(u.id) || [];

      // Clasificar grupos
      const gruposActivos = grupos.filter(g =>
        g.grupo_activo && (g.temporada_estado === 'activa' && g.temporada_activa)
      );
      const gruposPlanificacion = grupos.filter(g =>
        g.temporada_estado === 'planificacion'
      );

      // Determinar estado
      let estado: 'disponible' | 'liderando' | 'planificacion' | 'liderando_y_planificacion' = 'disponible';
      if (gruposActivos.length > 0 && gruposPlanificacion.length > 0) {
        estado = 'liderando_y_planificacion';
      } else if (gruposActivos.length > 0) {
        estado = 'liderando';
      } else if (gruposPlanificacion.length > 0) {
        estado = 'planificacion';
      }

      // Filtrar por segmento si aplica
      const gruposEnSegmento = segmentoId
        ? gruposActivos.filter(g => g.segmento_id === segmentoId)
        : gruposActivos;

      return {
        id: u.id,
        nombre: u.nombre,
        apellido: u.apellido,
        email: u.email || null,
        foto_perfil_url: u.foto_perfil_url || null,
        estado,
        grupos_activos: gruposActivos.map(g => ({
          nombre: g.grupo_nombre,
          temporada: g.temporada_nombre,
        })),
        grupos_planificacion: gruposPlanificacion.map(g => ({
          nombre: g.grupo_nombre,
          temporada: g.temporada_nombre,
        })),
        en_segmento_actual: segmentoId ? gruposEnSegmento.length > 0 : false,
      };
    });

    // Ordenar: disponibles primero, luego planificación, luego liderando
    const orden: Record<string, number> = {
      disponible: 0,
      planificacion: 1,
      liderando: 2,
      liderando_y_planificacion: 3,
    };
    lideres.sort((a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9));

    return NextResponse.json({ lideres, total: lideres.length });
  } catch (e: any) {
    console.error('[lideres/buscar] Error:', e);
    return NextResponse.json({ error: e?.message || 'Error interno' }, { status: 500 });
  }
}
