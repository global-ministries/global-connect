import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Versión simplificada y más robusta: evita join implícito que causaba 500 bajo algunas políticas RLS.
// 1. Obtiene ids de grupos del segmento.
// 2. Obtiene líderes activos de esos grupos.
// 3. Lista usuarios y excluye los líderes ya presentes.
export async function GET(req: Request, context: { params: Promise<{ segmentoId: string }> | { segmentoId: string } }) {
  try {
    const awaitedParams = 'then' in context.params ? await context.params : context.params;
    const { segmentoId } = awaitedParams;
    if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    // 1. Grupos del segmento (limit razonable por seguridad)
    const { data: grupos, error: gruposErr } = await supabase
      .from('grupos')
      .select('id')
      .eq('segmento_id', segmentoId)
      .limit(500);
    if (gruposErr) {
      console.warn('[usuarios-posibles-lideres] gruposErr', gruposErr.message);
    }
    const grupoIds = (grupos || []).map(g => g.id);

    let yaLiderIds = new Set<string>();
    if (grupoIds.length > 0) {
      const { data: lideresActivos, error: lideresErr } = await supabase
        .from('grupo_miembros')
        .select('usuario_id, fecha_salida, rol')
        .in('grupo_id', grupoIds)
        .eq('rol', 'Líder')
        .is('fecha_salida', null)
        .limit(2000);
      if (lideresErr) {
        console.warn('[usuarios-posibles-lideres] lideresErr', lideresErr.message);
      } else {
        yaLiderIds = new Set((lideresActivos || []).map(l => l.usuario_id));
      }
    }

    // 3. Usuarios base (se podría filtrar por segmento si existiera relación directa; por ahora global + exclusión)
    const { data: usuariosData, error: usuariosErr } = await supabase
      .from('usuarios')
      .select('id, nombre, apellido')
      .order('nombre', { ascending: true })
      .limit(300);
    if (usuariosErr) return NextResponse.json({ error: usuariosErr.message }, { status: 500 });

    const usuarios = (usuariosData || [])
      .filter(u => !yaLiderIds.has(u.id))
      .slice(0, 100)
      .map(u => ({ id: u.id, nombre: `${u.nombre || ''} ${u.apellido || ''}`.trim() }));

    return NextResponse.json({ usuarios });
  } catch (e: any) {
    console.error('[usuarios-posibles-lideres] Exception', e);
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 });
  }
}
