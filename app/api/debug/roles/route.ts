import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await supabase.from("roles_sistema").select("nombre_interno, nombre_visible").order("nombre_visible");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roles: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nuevoRol = body?.rol as string | undefined;
  if (!nuevoRol) return NextResponse.json({ error: "Rol requerido" }, { status: 400 });

  const { data, error } = await supabase.rpc("debug_cambiar_rol_usuario", {
    p_auth_id: user.id,
    p_nuevo_rol: nuevoRol,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  return NextResponse.json({ ok: true });
}
