import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * POST /api/grupos/[id]/miembros
 *
 * Agrega un miembro a un grupo a través del flujo de solicitudes.
 * - DG+ (admin, pastor, director-general scoped) → inserción directa
 * - DE, líder → crea solicitud pendiente de aprobación
 *
 * Usa la RPC `crear_solicitud_grupo` que decide el modo según el rol.
 */

const bodySchema = z.object({
  usuarioId: z.string().uuid("usuarioId inválido"),
  rol: z.enum(["Líder", "Colíder", "Miembro"]).default("Miembro"),
  incluirConyuge: z.boolean().default(false),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: grupoId } = await params;
    const parsed = bodySchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }

    const { usuarioId, rol, incluirConyuge } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // ─── Flujo principal: RPC crear_solicitud_grupo decide directo vs solicitud ───
    const { data: resultado, error: errorPrincipal } = await supabase.rpc("crear_solicitud_grupo", {
      p_auth_id: user.id,
      p_tipo: "ingreso",
      p_usuario_id: usuarioId,
      p_grupo_id: grupoId,
      p_rol_solicitado: rol,
    });

    if (errorPrincipal) {
      // Mapear errores conocidos del RPC a mensajes user-friendly
      const mensajes: Record<string, string> = {
        usuario_no_encontrado: "Usuario no encontrado en el sistema",
        sin_permisos: "No tienes permisos para agregar miembros a este grupo",
        miembro_ya_en_grupo: "Esta persona ya pertenece a un grupo activo",
      };
      return NextResponse.json(
        { error: mensajes[errorPrincipal.message] ?? errorPrincipal.message },
        { status: 400 }
      );
    }

    const res = resultado as Record<string, unknown> | null;
    const modo = (res?.modo as string) ?? "solicitud";

    // ─── Si fue directo y debe incluir cónyuge, también agregar cónyuge ───
    if (incluirConyuge && modo === "directo") {
      const { data: conyuge } = await supabase
        .from("relaciones_usuarios")
        .select("usuario1_id, usuario2_id")
        .eq("tipo_relacion", "conyuge")
        .or(`usuario1_id.eq.${usuarioId},usuario2_id.eq.${usuarioId}`)
        .maybeSingle();

      if (conyuge) {
        const conyugeId = conyuge.usuario1_id === usuarioId
          ? conyuge.usuario2_id
          : conyuge.usuario1_id;

        // También pasar por el flujo de solicitudes para el cónyuge
        await supabase.rpc("crear_solicitud_grupo", {
          p_auth_id: user.id,
          p_tipo: "ingreso",
          p_usuario_id: conyugeId,
          p_grupo_id: grupoId,
          p_rol_solicitado: rol,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      modo,
      message: modo === "directo"
        ? "Miembro agregado correctamente"
        : "Solicitud creada — pendiente de aprobación por un director",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
