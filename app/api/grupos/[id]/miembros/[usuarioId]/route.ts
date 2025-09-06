import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; usuarioId: string } }) {
  try {
    const grupoId = params.id;
    const usuarioId = params.usuarioId;
    const body = await req.json();
    const rol: "Líder" | "Colíder" | "Miembro" = body?.rol;
    if (!rol) return NextResponse.json({ error: "rol requerido" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { error } = await supabase.rpc("actualizar_rol_miembro", {
      p_auth_id: user.id,
      p_grupo_id: grupoId,
      p_usuario_id: usuarioId,
      p_rol: rol,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; usuarioId: string } }) {
  try {
    const grupoId = params.id;
    const usuarioId = params.usuarioId;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { error } = await supabase.rpc("eliminar_miembro_de_grupo", {
      p_auth_id: user.id,
      p_grupo_id: grupoId,
      p_usuario_id: usuarioId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
