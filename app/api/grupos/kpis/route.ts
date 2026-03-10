import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const campusId = req.nextUrl.searchParams.get('campus_id');
    const rpcParams: { p_auth_id: string; p_campus_id?: string } = { p_auth_id: user.id };
    if (campusId) rpcParams.p_campus_id = campusId;

    const { data, error } = await supabase.rpc('obtener_kpis_grupos_para_usuario', rpcParams as any);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ kpis: data && Array.isArray(data) ? data[0] : null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
