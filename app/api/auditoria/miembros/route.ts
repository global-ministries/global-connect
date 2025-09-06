import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const grupoId = searchParams.get("grupoId");
    const usuarioId = searchParams.get("usuarioId");
    const action = searchParams.get("action"); // CREATE|UPDATE|DELETE
    const desde = searchParams.get("desde"); // ISO string
    const hasta = searchParams.get("hasta"); // ISO string
    const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
    const offset = Number(searchParams.get("offset") || 0);

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data, error } = await supabase.rpc("obtener_auditoria_miembros", {
      p_auth_id: user.id,
      p_grupo_id: grupoId,
      p_usuario_id: usuarioId,
      p_action: action,
      p_desde: desde ? new Date(desde).toISOString() : null,
      p_hasta: hasta ? new Date(hasta).toISOString() : null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
