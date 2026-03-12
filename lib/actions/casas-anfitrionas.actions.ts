"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ─── Schemas ─────────────────────────────────────────────────────────

const crearCasaSchema = z.object({
  nombre_lugar: z.string().min(2, "Nombre del lugar es requerido"),
  descripcion: z.string().optional(),
  capacidad_maxima: z.number().min(1).max(200).optional(),
  calle: z.string().min(2, "La calle es requerida"),
  barrio: z.string().optional(),
  codigo_postal: z.string().optional(),
  referencia: z.string().optional(),
  parroquia_id: z.string().uuid().optional(),
  notas_publicas: z.string().optional(),
  disponibilidad: z.array(z.string()).optional(),
});

const actualizarCasaSchema = crearCasaSchema.partial();

// ─── Types ───────────────────────────────────────────────────────────

interface ResultadoAccion<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function validarAuthYPermisos(requiereGestion = false): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  authId: string;
  error?: string;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      supabase,
      userId: "",
      authId: "",
      error: "Usuario no autenticado",
    };
  }

  // Obtener usuario interno
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!usuario) {
    return {
      supabase,
      userId: "",
      authId: user.id,
      error: "Usuario no encontrado",
    };
  }

  if (requiereGestion) {
    const { data: puede } = await supabase.rpc("puede_gestionar_casas", {
      p_auth_id: user.id,
    });
    if (!puede) {
      return {
        supabase,
        userId: usuario.id,
        authId: user.id,
        error: "No tienes permisos para gestionar casas anfitrionas",
      };
    }
  }

  return { supabase, userId: usuario.id, authId: user.id };
}

// ─── Actions ─────────────────────────────────────────────────────────

/**
 * Crea una nueva casa anfitriona y su dirección asociada.
 */
export async function crearCasaAnfitriona(
  datos: z.infer<typeof crearCasaSchema>
): Promise<ResultadoAccion<{ id: string }>> {
  try {
    const parsed = crearCasaSchema.parse(datos);
    const { supabase, userId, error } = await validarAuthYPermisos();
    if (error) return { success: false, error };

    // 1. Crear dirección
    const { data: direccion, error: dirError } = await supabase
      .from("direcciones")
      .insert({
        calle: parsed.calle,
        barrio: parsed.barrio || null,
        codigo_postal: parsed.codigo_postal || null,
        referencia: parsed.referencia || null,
        parroquia_id: parsed.parroquia_id || null,
      })
      .select("id")
      .single();

    if (dirError) return { success: false, error: `Error al crear dirección: ${dirError.message}` };

    // 2. Crear casa anfitriona
    const disponibilidadJson = (parsed.disponibilidad ?? []).map((dia) => ({
      dia,
      disponible: true,
    }));

    const { data: casa, error: casaError } = await supabase
      .from("casas_anfitrionas")
      .insert({
        usuario_id: userId,
        nombre_lugar: parsed.nombre_lugar,
        descripcion: parsed.descripcion || null,
        capacidad_maxima: parsed.capacidad_maxima || null,
        direccion_id: direccion.id,
        disponibilidad: disponibilidadJson,
        notas_publicas: parsed.notas_publicas || null,
      })
      .select("id")
      .single();

    if (casaError) return { success: false, error: `Error al crear casa: ${casaError.message}` };

    revalidatePath("/grupos-vida/casas-anfitrionas");
    return { success: true, data: { id: casa.id } };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.errors.map((e) => e.message).join(" | ") };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

/**
 * Actualiza una casa anfitriona existente.
 * El dueño puede editar la suya; admins pueden editar cualquiera.
 */
export async function actualizarCasaAnfitriona(
  casaId: string,
  datos: z.infer<typeof actualizarCasaSchema>
): Promise<ResultadoAccion<void>> {
  try {
    const parsed = actualizarCasaSchema.parse(datos);
    const { supabase, userId, authId, error } = await validarAuthYPermisos();
    if (error) return { success: false, error };

    // Verificar propiedad o permisos
    const { data: casa } = await supabase
      .from("casas_anfitrionas")
      .select("usuario_id, direccion_id")
      .eq("id", casaId)
      .single();

    if (!casa) return { success: false, error: "Casa no encontrada" };

    const esDueno = casa.usuario_id === userId;
    if (!esDueno) {
      const { data: puede } = await supabase.rpc("puede_gestionar_casas", {
        p_auth_id: authId,
      });
      if (!puede) return { success: false, error: "No tienes permisos" };
    }

    // Actualizar dirección si hay cambios
    if (casa.direccion_id && (parsed.calle || parsed.barrio || parsed.codigo_postal || parsed.referencia || parsed.parroquia_id)) {
      const dirUpdate: Record<string, unknown> = {};
      if (parsed.calle !== undefined) dirUpdate.calle = parsed.calle;
      if (parsed.barrio !== undefined) dirUpdate.barrio = parsed.barrio || null;
      if (parsed.codigo_postal !== undefined) dirUpdate.codigo_postal = parsed.codigo_postal || null;
      if (parsed.referencia !== undefined) dirUpdate.referencia = parsed.referencia || null;
      if (parsed.parroquia_id !== undefined) dirUpdate.parroquia_id = parsed.parroquia_id || null;

      if (Object.keys(dirUpdate).length > 0) {
        await supabase.from("direcciones").update(dirUpdate).eq("id", casa.direccion_id);
      }
    }

    // Actualizar casa
    const casaUpdate: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
    if (parsed.nombre_lugar !== undefined) casaUpdate.nombre_lugar = parsed.nombre_lugar;
    if (parsed.descripcion !== undefined) casaUpdate.descripcion = parsed.descripcion || null;
    if (parsed.capacidad_maxima !== undefined) casaUpdate.capacidad_maxima = parsed.capacidad_maxima || null;
    if (parsed.notas_publicas !== undefined) casaUpdate.notas_publicas = parsed.notas_publicas || null;
    if (parsed.disponibilidad !== undefined) {
      casaUpdate.disponibilidad = parsed.disponibilidad.map((dia) => ({
        dia,
        disponible: true,
      }));
    }

    const { error: updateError } = await supabase
      .from("casas_anfitrionas")
      .update(casaUpdate)
      .eq("id", casaId);

    if (updateError) return { success: false, error: `Error al actualizar: ${updateError.message}` };

    revalidatePath("/grupos-vida/casas-anfitrionas");
    revalidatePath(`/grupos-vida/casas-anfitrionas/${casaId}`);
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.errors.map((e) => e.message).join(" | ") };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

/**
 * Aprueba o rechaza una casa anfitriona.
 * Solo admins/pastores/directores.
 */
export async function procesarAprobacionCasa(
  casaId: string,
  accion: "aprobar" | "rechazar",
  notas?: string | null
): Promise<ResultadoAccion<unknown>> {
  const { supabase, authId, error } = await validarAuthYPermisos(true);
  if (error) return { success: false, error };

  const { data, error: rpcError } = await supabase.rpc(
    "procesar_aprobacion_casa_anfitriona",
    {
      p_auth_id: authId,
      p_casa_id: casaId,
      p_accion: accion,
      p_notas: notas ?? undefined,
    }
  );

  if (rpcError) return { success: false, error: rpcError.message };

  revalidatePath("/grupos-vida/casas-anfitrionas");
  revalidatePath(`/grupos-vida/casas-anfitrionas/${casaId}`);
  return { success: true, data };
}

/**
 * Lista casas anfitrionas con filtros opcionales.
 */
export async function listarCasasAnfitrionas(filtros?: {
  soloAprobadas?: boolean;
  soloActivas?: boolean;
  limite?: number;
  offset?: number;
}): Promise<ResultadoAccion<unknown>> {
  const { supabase, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  let query = supabase
    .from("casas_anfitrionas")
    .select(
      `
      id, nombre_lugar, descripcion, capacidad_maxima, activa, aprobada,
      fotos_urls, notas_publicas, creado_en,
      usuarios!casas_anfitrionas_usuario_id_fkey ( id, nombre, apellido, foto_perfil_url ),
      direcciones!casas_anfitrionas_direccion_id_fkey ( calle, barrio, latitud, longitud )
    `
    )
    .order("creado_en", { ascending: false });

  if (filtros?.soloAprobadas) query = query.eq("aprobada", true);
  if (filtros?.soloActivas) query = query.eq("activa", true);
  if (filtros?.limite) query = query.limit(filtros.limite);
  if (filtros?.offset) query = query.range(filtros.offset, filtros.offset + (filtros.limite ?? 20) - 1);

  const { data, error: queryError } = await query;

  if (queryError) return { success: false, error: queryError.message };
  return { success: true, data };
}

/**
 * Obtiene datos del mapa de grupos usando la vista v_mapa_grupos_vida.
 */
export async function obtenerDatosMapaGrupos(): Promise<ResultadoAccion<unknown>> {
  const { supabase, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const { data, error: queryError } = await supabase
    .from("v_mapa_grupos_vida")
    .select("*")
    .not("latitud", "is", null)
    .not("longitud", "is", null);

  if (queryError) return { success: false, error: queryError.message };
  return { success: true, data };
}
