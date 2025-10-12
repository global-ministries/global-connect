import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

// GET /api/segmentos
// Devuelve lista básica de segmentos (id, nombre, descripcion opcional)
// Acceso: roles de liderazgo (admin, pastor, director-general, director-etapa, lider)
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const userData = await getUserWithRoles(supabase);
    if (!userData) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const rolesPermitidos = ['admin','pastor','director-general','director-etapa','lider'];
    const autorizado = userData.roles.some(r => rolesPermitidos.includes(r));
    if (!autorizado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    const { data, error } = await supabase
      .from('segmentos')
      .select('id, nombre, descripcion')
      .order('nombre',{ ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ segmentos: data || [] });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || 'Error inesperado' }, { status: 500 });
  }
}
