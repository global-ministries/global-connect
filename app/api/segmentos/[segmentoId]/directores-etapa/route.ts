import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
      .select('id, usuario_id, usuario:usuario_id (nombre, apellido, email)')
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
        let usuariosMap = new Map<string, { nombre: string; apellido: string; email?: string | null }>();
        if (usuarioIds.length > 0) {
          const { data: usuariosData, error: usuariosErr } = await supabase
            .from('usuarios')
            .select('id, nombre, apellido, email')
            .in('id', usuarioIds)
            .limit(200);
          if (usuariosErr) {
            console.warn('[directores-etapa] usuariosErr', usuariosErr.message);
          } else {
            for (const u of usuariosData || []) {
              usuariosMap.set(u.id, { nombre: u.nombre || '', apellido: u.apellido || '', email: u.email || null });
            }
          }
        }
        registros = filasBase.map(f => {
          const info = usuariosMap.get(f.usuario_id) || { nombre: '', apellido: '', email: null };
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
        nombre: baseNombre || fallback
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
