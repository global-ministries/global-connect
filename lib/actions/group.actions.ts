"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
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
    parroquia_id: z.string().uuid().or(z.literal("")).optional(),
  }).optional(),
});

export async function updateGroup(groupId: string, data: unknown) {
  try {
    if (data && typeof data === "object" && "casa_anfitriona_id" in data) {
      throw new Error("La Casa Anfitriona se asigna desde el flujo guiado");
    }

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

    // Resolver dirección manual solo cuando el formulario la envía como referencia legada.
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
  ubicacion_nombre?: string | null;
  director_etapa_segmento_lider_id?: string | null;
  lider_usuario_id?: string | null;
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
    const userData = await getUserWithRoles(supabase);
    if (!userData) return { success: false, error: "No autenticado" };
    const user = userData.user;

    // Auto-determinar estado de aprobación según rol del creador
    const roles = userData.roles || [];
    const esSuperior = roles.some(r => ["admin", "pastor", "director-general"].includes(r));
    const estadoAprobacion = esSuperior ? "aprobado" : "pendiente";

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

    // ─── Usar admin client para todas las operaciones post-creación ─────
    // El usuario (director de etapa) puede no tener permisos RLS para UPDATE/INSERT
    // en tablas del grupo recién creado, especialmente si es pendiente.
    const adminDb = (await import("@/lib/supabase/admin")).createSupabaseAdminClient();

    // ─── Auto-derivar campus_id, localidad_id y tipo_grupo_id ─────
    // El formulario envía ubicacion_nombre (ej. "Barquisimeto", "Cabudare")
    // que corresponde a una localidad dentro de un campus.
    let campusId = parsed.data.campus_id ?? null;
    let localidadId: string | null = null;

    if (data.ubicacion_nombre) {
      const { data: localidad } = await adminDb
        .from("campus_localidades")
        .select("id, campus_id")
        .ilike("nombre", data.ubicacion_nombre)
        .limit(1)
        .single();

      if (localidad) {
        localidadId = localidad.id;
        if (!campusId) campusId = localidad.campus_id;
      }
    }

    // tipo_grupo_id: usar el tipo por defecto "Grupos de Vida"
    let tipoGrupoId: string | null = null;
    const { data: tipoDefault } = await adminDb
      .from("tipos_grupo")
      .select("id")
      .limit(1)
      .single();
    if (tipoDefault) tipoGrupoId = tipoDefault.id;

    // Post-create: campus_id, localidad_id, tipo_grupo_id, estado, ubicación — un solo UPDATE con admin
    const postUpdate: Record<string, unknown> = {};
    if (campusId) postUpdate.campus_id = campusId;
    if (localidadId) postUpdate.localidad_id = localidadId;
    if (tipoGrupoId) postUpdate.tipo_grupo_id = tipoGrupoId;
    postUpdate.estado_aprobacion = estadoAprobacion;
    if (data.segmento_ubicacion_id) postUpdate.segmento_ubicacion_id = data.segmento_ubicacion_id;
    // Si es pendiente, el grupo inicia inactivo hasta que se apruebe
    if (estadoAprobacion === "pendiente") postUpdate.activo = false;

    if (Object.keys(postUpdate).length) {
      const { error: updErr } = await adminDb.from("grupos").update(postUpdate).eq("id", grupoId);
      if (updErr) return { success: false, error: `Error al configurar el grupo: ${updErr.message}` };
    }

    // Asignar director de etapa (columna: director_etapa_id, valor: segmento_lider_id)
    if (data.director_etapa_segmento_lider_id) {
      const { error: dirError } = await adminDb
        .from("director_etapa_grupos")
        .insert({
          grupo_id: grupoId,
          director_etapa_id: data.director_etapa_segmento_lider_id,
        });
      if (dirError) {
        console.error("[createGroup] Error al asignar director de etapa:", dirError.message);
      }
    }

    // Asignar líder inicial
    if (data.lider_usuario_id) {
      const { error: liderError } = await adminDb
        .from("grupo_miembros")
        .insert({ grupo_id: grupoId, usuario_id: data.lider_usuario_id, rol: "Líder" });
      if (liderError) {
        console.error("[createGroup] Error al asignar líder:", liderError.message);
      }
    }

    // Si el grupo queda pendiente, crear solicitud de activación
    if (estadoAprobacion === "pendiente") {
      // Obtener ID interno del usuario (usuarios.id, no auth.uid)
      const { data: usuarioInterno } = await supabase
        .from("usuarios")
        .select("id")
        .eq("auth_id", user.id)
        .single();

      if (usuarioInterno) {
        const { error: solErr } = await adminDb
          .from("solicitudes_grupo")
          .insert({
            tipo: "activacion_grupo",
            estado: "pendiente",
            solicitado_por: usuarioInterno.id,
            grupo_id: grupoId,
            motivo: `Solicitud de creación de grupo "${parsed.data.nombre}" por director de etapa`,
            temporada_id: parsed.data.temporada_id,
          });
        if (solErr) {
          console.error("[createGroup] Error creando solicitud:", solErr.message);
        }
      }
    }

    revalidatePath("/grupos-vida");
    revalidatePath("/grupos-vida/solicitudes");
    return { success: true, newGroupId: grupoId, pendiente: estadoAprobacion === "pendiente" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al crear el grupo";
    return { success: false, error: message };
  }
}
