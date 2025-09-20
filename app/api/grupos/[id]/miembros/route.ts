import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: grupoId } = await params;
    const body = await req.json();
    const usuarioId: string = body?.usuarioId;
  const rol: "Líder" | "Colíder" | "Miembro" = body?.rol || "Miembro"; // UI muestra 'Aprendiz'
    const incluirConyuge: boolean = body?.incluirConyuge || false;
    
    if (!usuarioId) return NextResponse.json({ error: "usuarioId requerido" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // Agregar el miembro principal
    const { error: errorPrincipal } = await supabase.rpc("agregar_miembro_a_grupo", {
      p_auth_id: user.id,
      p_grupo_id: grupoId,
      p_usuario_id: usuarioId,
      p_rol: rol
    });
    
    if (errorPrincipal) {
      return NextResponse.json({ error: errorPrincipal.message }, { status: 400 });
    }

    // Si debe incluir cónyuge, buscar y agregar
    if (incluirConyuge) {
      // Buscar cónyuge
      const { data: conyuge, error: errorBusqueda } = await supabase
        .from('relaciones_usuarios')
        .select(`
          usuario1_id,
          usuario2_id,
          usuario1:usuarios!relaciones_usuarios_usuario1_id_fkey(id, nombre, apellido),
          usuario2:usuarios!relaciones_usuarios_usuario2_id_fkey(id, nombre, apellido)
        `)
        .eq('tipo_relacion', 'conyuge')
        .or(`usuario1_id.eq.${usuarioId},usuario2_id.eq.${usuarioId}`)
        .single();

      if (!errorBusqueda && conyuge) {
        // Determinar el ID del cónyuge
        const conyugeId = conyuge.usuario1_id === usuarioId ? conyuge.usuario2_id : conyuge.usuario1_id;
        
        // Agregar el cónyuge con el mismo rol
        const { error: errorConyuge } = await supabase.rpc("agregar_miembro_a_grupo", {
          p_auth_id: user.id,
          p_grupo_id: grupoId,
          p_usuario_id: conyugeId,
          p_rol: rol
        });
        
        // No fallar si el cónyuge ya es miembro o hay otro error menor
        if (errorConyuge && !errorConyuge.message.includes('ya es miembro')) {
          console.warn('Error al agregar cónyuge:', errorConyuge.message);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
