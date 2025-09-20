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

    // Obtener nombre del segmento
    const { data: segmento, error: segError } = await supabase
      .from("segmentos")
      .select("nombre")
      .eq("id", segmento_id)
      .single();
    if (segError || !segmento?.nombre) {
      return NextResponse.json({ error: "Segmento inválido" }, { status: 400 });
    }

    const base = `${ubicacion} ${segmento.nombre}`.trim();

    // Buscar nombres existentes en misma temporada y segmento que empiecen con base
    const { data: grupos, error: gruposError } = await supabase
      .from("grupos")
      .select("nombre")
      .eq("temporada_id", temporada_id)
      .eq("segmento_id", segmento_id)
      .ilike("nombre", `${base}%`);

    if (gruposError) {
      return NextResponse.json({ error: "No es posible sugerir el nombre" }, { status: 500 });
    }

    // Extraer sufijos numéricos
    let maxN = 0;
    for (const g of grupos || []) {
      const m = String(g.nombre || "").match(new RegExp(`^${base}\\s+(\\d+)$`));
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n)) maxN = Math.max(maxN, n);
      }
    }
    const next = maxN + 1;
    const nombre = `${base} ${next}`;
    return NextResponse.json({ nombre });
  } catch (e) {
    console.error("[sugerir-nombre] error:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
