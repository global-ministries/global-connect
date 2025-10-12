"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const createGroupSchema = z.object({
  nombre: z.string().min(1, "El nombre del grupo es requerido"),
  temporada_id: z.string().uuid("Temporada inválida"),
  segmento_id: z.string().uuid("Segmento inválido"),
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

type CreateGroupData = z.infer<typeof createGroupSchema>;

export async function updateGroup(groupId: string, data: any) {
  try {
    // Validar datos
    const validatedData = groupEditSchema.parse(data);

    // 1. Crear instancia del cliente de Supabase para servidor
    const supabase = await createSupabaseServerClient();

    // 2. Obtener usuario autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Error de autenticación:", authError);
      throw new Error("Usuario no autenticado");
    }

    console.log("Usuario autenticado:", user.id);

  // 3. Verificar permisos para editar el grupo usando el auth.id obtenido (no requerimos fila en "usuarios")
    const { data: permiso, error: permisoError } = await supabase.rpc("puede_editar_grupo", {
      p_auth_id: user.id,
      p_grupo_id: groupId
    });

    if (permisoError) {
      console.error("Error en verificación de permisos:", permisoError);
      throw new Error("Error al verificar permisos");
    }

    if (!permiso) {
      console.error("Permiso denegado para usuario auth:", user.id, "en grupo:", groupId);
      throw new Error("No tienes permisos para editar este grupo");
    }

    console.log("Permisos verificados correctamente");

    // Preparar datos para actualización
    const updateData: any = {
      nombre: validatedData.nombre,
      temporada_id: validatedData.temporada_id,
      segmento_id: validatedData.segmento_id,
      dia_reunion: validatedData.dia_reunion || null,
      hora_reunion: validatedData.hora_reunion || null,
      activo: validatedData.activo,
      notas_privadas: validatedData.notas_privadas || null,
    };

    // Actualizar el grupo
    const { error: updateError } = await supabase
      .from("grupos")
      .update(updateData)
      .eq("id", groupId);

    if (updateError) {
      console.error("Error actualizando grupo:", updateError);
      throw new Error("Error al actualizar el grupo");
    }

        // Si hay datos de dirección, hacer upsert
    if (validatedData.direccion) {
      const direccionData = {
        calle: validatedData.direccion.calle || null,
        barrio: validatedData.direccion.barrio || null,
        codigo_postal: validatedData.direccion.codigo_postal || null,
        referencia: validatedData.direccion.referencia || null,
        latitud: validatedData.direccion.lat || null,
        longitud: validatedData.direccion.lng || null,
        parroquia_id: validatedData.direccion.parroquia_id || null,
      };

      // Obtener el grupo actual para saber si tiene dirección
      const { data: grupoActual } = await supabase
        .from("grupos")
        .select("direccion_anfitrion_id")
        .eq("id", groupId)
        .single();

      if (grupoActual?.direccion_anfitrion_id) {
        // Actualizar dirección existente usando upsert
        const { error: upsertError } = await supabase
          .from("direcciones")
          .upsert(
            {
              id: grupoActual.direccion_anfitrion_id,
              ...direccionData,
            },
            { onConflict: "id" }
          );

        if (upsertError) {
          console.error("Error haciendo upsert de dirección:", upsertError);
          throw new Error("Error al actualizar la dirección");
        }
      } else if (validatedData.direccion.calle || validatedData.direccion.barrio) {
        // Crear nueva dirección usando upsert (sin ID para que genere uno nuevo)
        const { data: newDireccion, error: upsertError } = await supabase
          .from("direcciones")
          .upsert(direccionData, { onConflict: "id" })
          .select("id")
          .single();

        if (upsertError) {
          console.error("Error creando dirección:", upsertError);
          throw new Error("Error al crear la dirección");
        }

        // Actualizar el grupo con el ID de la nueva dirección
        updateData.direccion_anfitrion_id = newDireccion.id;
      }
    }

    // Actualizar el grupo (incluyendo direccion_anfitrion_id si se creó nueva)
    const { error: finalUpdateError } = await supabase
      .from("grupos")
      .update(updateData)
      .eq("id", groupId);

    if (finalUpdateError) {
      console.error("Error actualizando grupo:", finalUpdateError);
      throw new Error("Error al actualizar el grupo");
    }

    // Revalidar la página del grupo
    revalidatePath(`/dashboard/grupos/${groupId}`);

    console.log("Grupo actualizado exitosamente");
    return { success: true };
  } catch (error) {
    console.error("Error en updateGroup:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    };
  }
}

export async function createGroup(data: { nombre: string; temporada_id: string; segmento_id: string; segmento_ubicacion_id?: string | null; director_etapa_segmento_lider_id?: string | null; lider_usuario_id?: string | null; estado_aprobacion?: 'pendiente' | 'aprobado' | 'rechazado'; }) {
  // Validación de entrada
  const parsed = createGroupSchema.safeParse({ nombre: data.nombre, temporada_id: data.temporada_id, segmento_id: data.segmento_id })
  if (!parsed.success) {
    const msg = parsed.error.errors.map(e => e.message).join(" | ")
    return { success: false, error: msg }
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "No autenticado" }
    }

    const { data: permitido, error: permisoError } = await supabase.rpc("puede_crear_grupo", {
      p_auth_id: user.id,
      p_segmento_id: parsed.data.segmento_id,
    })
    if (permisoError) {
      console.error("[createGroup] Error permiso:", permisoError)
      return { success: false, error: "No fue posible validar permisos" }
    }
    if (!permitido) {
      return { success: false, error: "No tienes permisos para crear grupos en este segmento" }
    }

    const { data: newId, error } = await supabase.rpc('crear_grupo', {
      p_auth_id: user.id,
      p_nombre: parsed.data.nombre,
      p_temporada_id: parsed.data.temporada_id,
      p_segmento_id: parsed.data.segmento_id,
    })
    if (error || !newId) {
      return { success: false, error: error?.message || 'Error creando grupo' };
    }

    const grupoId = newId as unknown as string;

    // Acumulamos updates posteriores (estado + ubicación) para minimizar roundtrips
    const postUpdate: Record<string, any> = {};
    if (data.estado_aprobacion && ['pendiente','aprobado','rechazado'].includes(data.estado_aprobacion)) {
      postUpdate.estado_aprobacion = data.estado_aprobacion;
    }
    if (data.segmento_ubicacion_id) {
      postUpdate.segmento_ubicacion_id = data.segmento_ubicacion_id;
    }
    if (Object.keys(postUpdate).length) {
      const { error: updErr } = await supabase.from('grupos').update(postUpdate).eq('id', grupoId);
      if (updErr) console.warn('[createGroup] Actualización post-crear falló:', updErr.message)
    }

    // Asignar director de etapa inicial si viene param
    if (data.director_etapa_segmento_lider_id) {
      const { error: dirErr } = await supabase.rpc('asignar_director_etapa_a_grupo', {
        p_auth_id: user.id,
        p_grupo_id: grupoId,
        p_segmento_lider_id: data.director_etapa_segmento_lider_id,
        p_accion: 'agregar'
      })
      if (dirErr) {
        console.warn('[createGroup] Falló asignar director etapa inicial:', dirErr.message)
      }
    }

    // Asignar líder inicial si proporcionado
    if (data.lider_usuario_id) {
      const { error: liderErr } = await supabase.from('grupo_miembros').insert({ grupo_id: grupoId, usuario_id: data.lider_usuario_id, rol: 'Líder' })
      if (liderErr) {
        console.warn('[createGroup] Falló asignar líder inicial:', liderErr.message)
      }
    }

    revalidatePath('/dashboard/grupos')
    return { success: true, newGroupId: grupoId };
  } catch (err: any) {
    console.error('[createGroup] Excepción:', err)
    return { success: false, error: err?.message || "Error al crear el grupo" }
  }
}
