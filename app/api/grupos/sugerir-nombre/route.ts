import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ubicacion = searchParams.get("ubicacion");
    const temporada_id = searchParams.get("temporada_id");
    const segmento_id = searchParams.get("segmento_id");

    if (!ubicacion || !["Barquisimeto", "Cabudare"].includes(ubicacion)) {
      return NextResponse.json({ error: "Ubicación inválida" }, { status: 400 });
    }
    if (!temporada_id || !segmento_id) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    // Verificar usuario
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Obtener nombre del segmento (para validar existencia)
    const { data: segmento, error: segError } = await supabase
      .from("segmentos")
      .select("nombre")
      .eq("id", segmento_id)
      .single();
    if (segError || !segmento?.nombre) {
      return NextResponse.json({ error: "Segmento inválido" }, { status: 400 });
    }

    // Delegar cálculo a la función SECURITY DEFINER global
    const { data: nombre, error: rpcError } = await supabase.rpc('sugerir_nombre_grupo', {
      p_ubicacion: ubicacion,
      p_temporada_id: temporada_id,
      p_segmento_id: segmento_id,
    });
    if (rpcError) {
      console.error("[sugerir-nombre] rpc error:", rpcError);
      return NextResponse.json({ error: "No es posible sugerir el nombre" }, { status: 500 });
    }

    return NextResponse.json({ nombre });
  } catch (e) {
    console.error("[sugerir-nombre] error:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
