import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const { id: grupoId } = await params;
    const body = await req.json();
    const usuarioId: string = body?.usuarioId;
    const rol: "Líder" | "Colíder" | "Miembro" = body?.rol || "Miembro";
    if (!usuarioId) return NextResponse.json({ error: "usuarioId requerido" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { error } = await supabase.rpc("agregar_miembro_a_grupo", {
      p_auth_id: user.id,
      p_grupo_id: grupoId,
      p_usuario_id: usuarioId,
      p_rol: rol
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
