import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const grupoId = params.id;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data, error } = await supabase.rpc("buscar_usuarios_para_grupo", {
      p_auth_id: user.id,
      p_grupo_id: grupoId,
      p_query: q,
      p_limit: 10
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
