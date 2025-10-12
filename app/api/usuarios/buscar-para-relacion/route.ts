import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Endpoint de búsqueda unificada para relaciones familiares.
// Replica la lógica de permisos de listar_usuarios_con_permisos y filtra:
//  - Usuario actual (siempre). Anteriormente se excluían familiares existentes, ahora se incluyen para mostrar badge.
// Parámetros:
//  - q: término de búsqueda
//  - limit: opcional (default 10)
//  - excluir: lista separada por comas de ids a excluir
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);
  // Ya no usamos lista de excluir salvo casos especiales futuros

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    // Usamos la función robusta de permisos existente.
    const { data, error } = await supabase.rpc('listar_usuarios_con_permisos', {
      p_auth_id: user.id,
      p_busqueda: q,
      p_roles_filtro: [],
      p_con_email: null,
      p_con_telefono: null,
      p_en_grupo: null,
      p_limite: limit,
      p_offset: 0,
      p_contexto_relacion: true
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const filtrados = (data || [])
      .filter((u: any) => u.id !== user.id); // excluir solo al usuario actual

    // Normalizar al shape que espera el modal (Usuario)
    const respuesta = filtrados.map((u: any) => ({
      id: u.id,
      nombre: u.nombre,
      apellido: u.apellido,
      email: u.email || '',
      genero: 'Otro',
      cedula: u.cedula || '',
      foto_perfil_url: u.foto_perfil_url || null
    }));

    return NextResponse.json(respuesta);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
