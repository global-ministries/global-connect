import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RelationSearchUser = {
  id: string
  nombre: string
  apellido: string
  foto_perfil_url: string | null
}

// Endpoint de búsqueda mínima para relaciones familiares.
// Parámetros:
//  - q: término de búsqueda por nombre/apellido
//  - limit: opcional (default 10)
//  - excluir: id del usuario base al que se agregará la relación
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const usuarioBaseId = searchParams.get('excluir');

    if (!usuarioBaseId) {
      return NextResponse.json({ error: 'Usuario base requerido' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { data, error } = await supabase.rpc('buscar_usuarios_para_relacion_familiar', {
      p_auth_id: user.id,
      p_usuario_base_id: usuarioBaseId,
      p_busqueda: q,
      p_limite: limit,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const respuesta: RelationSearchUser[] = (data || []).map((u) => ({
      id: u.id,
      nombre: u.nombre,
      apellido: u.apellido,
      foto_perfil_url: u.foto_perfil_url || null
    }));

    return NextResponse.json(respuesta);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
