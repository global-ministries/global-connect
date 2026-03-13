import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const patchSchema = z.object({
  rol: z.enum(["Líder", "Colíder", "Miembro"]),
});

/**
 * PATCH /api/grupos/[id]/miembros/[usuarioId]
 *
 * Cambia el rol de un miembro a través del flujo de solicitudes.
 * - DG+ → cambio directo
 * - DE/líder → solicitud pendiente
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; usuarioId: string }> }) {
  try {
    const { id: grupoId, usuarioId } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "rol requerido" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: resultado, error } = await supabase.rpc("crear_solicitud_grupo", {
      p_auth_id: user.id,
      p_tipo: "cambio_rol",
      p_usuario_id: usuarioId,
      p_grupo_id: grupoId,
      p_rol_solicitado: parsed.data.rol,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      modo: resultado?.modo ?? "solicitud",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/grupos/[id]/miembros/[usuarioId]
 *
 * Quita un miembro del grupo a través del flujo de solicitudes.
 * - DG+ → egreso directo
 * - DE/líder → solicitud pendiente
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; usuarioId: string }> }) {
  try {
    const { id: grupoId, usuarioId } = await params;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: resultado, error } = await supabase.rpc("crear_solicitud_grupo", {
      p_auth_id: user.id,
      p_tipo: "egreso",
      p_usuario_id: usuarioId,
      p_grupo_id: grupoId,
    });

    if (error) {
      const mensajes: Record<string, string> = {
        sin_permisos: "No tienes permisos para quitar miembros de este grupo",
      };
      return NextResponse.json(
        { error: mensajes[error.message] ?? error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      modo: resultado?.modo ?? "solicitud",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}

