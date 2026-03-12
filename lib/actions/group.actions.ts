"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { upsertDireccion } from "@/lib/helpers/direccion.helper";

const createGroupSchema = z.object({
  nombre: z.string().min(1, "El nombre del grupo es requerido"),
  temporada_id: z.string().uuid("Temporada inválida"),
  segmento_id: z.string().uuid("Segmento inválido"),
  campus_id: z.string().uuid().optional(),
});

const groupEditSchema = z.object({
  nombre: z.string().min(1, "El nombre del grupo es requerido"),
  temporada_id: z.string().uuid("Selecciona una temporada válida"),
  segmento_id: z.string().uuid("Selecciona un segmento válido"),
  dia_reunion: z.string().optional(),
  hora_reunion: z.string().optional(),
  activo: z.boolean(),
  notas_privadas: z.string().optional(),
  direccion: z.object({
    calle: z.string().optional(),
    barrio: z.string().optional(),
    codigo_postal: z.string().optional(),
    referencia: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    parroquia_id: z.string().uuid().optional(),
  }).optional(),
});

export async function updateGroup(groupId: string, data: unknown) {
  try {
    const validatedData = groupEditSchema.parse(data);
    const supabase = await createSupabaseServerClient();

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Usuario no autenticado");

    // Permisos
    const { data: permiso, error: permisoError } = await supabase.rpc("puede_editar_grupo", {
      p_auth_id: user.id,
      p_grupo_id: groupId,
    });
    if (permisoError) throw new Error("Error al verificar permisos");
    if (!permiso) throw new Error("No tienes permisos para editar este grupo");

    // Preparar payload (un solo UPDATE al final)
    const updatePayload: Record<string, unknown> = {
      nombre: validatedData.nombre,
      temporada_id: validatedData.temporada_id,
      segmento_id: validatedData.segmento_id,
      dia_reunion: validatedData.dia_reunion || null,
      hora_reunion: validatedData.hora_reunion || null,
      activo: validatedData.activo,
      notas_privadas: validatedData.notas_privadas || null,
      updated_at: new Date().toISOString(),
    };

    // Resolver dirección (upsert helper) antes del UPDATE del grupo
    if (validatedData.direccion) {
      // Obtener ID de dirección actual (si existe)
      const { data: grupoActual } = await supabase
        .from("grupos")
        .select("direccion_anfitrion_id")
        .eq("id", groupId)
        .single();

      const direccionId = await upsertDireccion(
        supabase,
        grupoActual?.direccion_anfitrion_id ?? null,
        validatedData.direccion
      );
      if (direccionId) updatePayload.direccion_anfitrion_id = direccionId;
    }

    // UN SOLO UPDATE al grupo
    const { error: updateError } = await supabase
      .from("grupos")
      .update(updatePayload)
      .eq("id", groupId);

    if (updateError) throw new Error("Error al actualizar el grupo");

    revalidatePath(`/grupos-vida/${groupId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

export async function createGroup(data: {
  nombre: string;
  temporada_id: string;
  segmento_id: string;
  campus_id?: string | null;
  segmento_ubicacion_id?: string | null;
  director_etapa_segmento_lider_id?: string | null;
  lider_usuario_id?: string | null;
  estado_aprobacion?: "pendiente" | "aprobado" | "rechazado";
}) {
  const parsed = createGroupSchema.safeParse({
    nombre: data.nombre,
    temporada_id: data.temporada_id,
    segmento_id: data.segmento_id,
    campus_id: data.campus_id ?? undefined,
  });
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(" | ");
    return { success: false, error: msg };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: "No autenticado" };

    const { data: permitido, error: permisoError } = await supabase.rpc("puede_crear_grupo", {
      p_auth_id: user.id,
      p_segmento_id: parsed.data.segmento_id,
    });
    if (permisoError) return { success: false, error: "No fue posible validar permisos" };
    if (!permitido) return { success: false, error: "No tienes permisos para crear grupos en este segmento" };

    const { data: newId, error } = await supabase.rpc("crear_grupo", {
      p_auth_id: user.id,
      p_nombre: parsed.data.nombre,
      p_temporada_id: parsed.data.temporada_id,
      p_segmento_id: parsed.data.segmento_id,
    });
    if (error || !newId) return { success: false, error: error?.message || "Error creando grupo" };

    // La RPC crear_grupo retorna uuid como text — validar tipo en runtime
    const grupoId = typeof newId === 'string' ? newId : String(newId);

    // Post-create: campus_id, estado, ubicación — un solo UPDATE
    const postUpdate: Record<string, unknown> = {};
    if (parsed.data.campus_id) postUpdate.campus_id = parsed.data.campus_id;
    if (data.estado_aprobacion && ["pendiente", "aprobado", "rechazado"].includes(data.estado_aprobacion)) {
      postUpdate.estado_aprobacion = data.estado_aprobacion;
    }
    if (data.segmento_ubicacion_id) postUpdate.segmento_ubicacion_id = data.segmento_ubicacion_id;

    if (Object.keys(postUpdate).length) {
      const { error: updErr } = await supabase.from("grupos").update(postUpdate).eq("id", grupoId);
      if (updErr) return { success: false, error: `Error al configurar el grupo: ${updErr.message}` };
    }

    // Asignar director de etapa inicial
    // La RPC existe en DB pero falta en tipos generados.
    // Se resolverá al ejecutar `pnpm gen:types`
    if (data.director_etapa_segmento_lider_id) {
      // @ts-expect-error — RPC no tipada, se corrige con pnpm gen:types
      const { error: dirError } = await supabase.rpc("asignar_director_etapa_a_grupo", {
        p_auth_id: user.id,
        p_grupo_id: grupoId,
        p_segmento_lider_id: data.director_etapa_segmento_lider_id,
        p_accion: "agregar",
      });
      if (dirError) {
        console.warn("Error al asignar director de etapa:", dirError.message);
      }
    }

    // Asignar líder inicial
    if (data.lider_usuario_id) {
      await supabase
        .from("grupo_miembros")
        .insert({ grupo_id: grupoId, usuario_id: data.lider_usuario_id, rol: "Líder" });
    }

    revalidatePath("/grupos-vida");
    return { success: true, newGroupId: grupoId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al crear el grupo";
    return { success: false, error: message };
  }
}
