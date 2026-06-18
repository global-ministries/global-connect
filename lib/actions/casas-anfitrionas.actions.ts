"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { extraerRelacion } from "@/lib/supabase/helpers";

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
  lat: z.number().optional(),
  lng: z.number().optional(),
  notas_publicas: z.string().optional(),
  disponibilidad: z.array(z.string()).optional(),
  usuario_id: z.string().uuid().optional(),
  co_anfitrion_id: z.string().uuid().optional(),
});

const actualizarCasaSchema = crearCasaSchema.partial();

// ─── Types ───────────────────────────────────────────────────────────

interface ResultadoAccion<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

/** Resultado de la RPC de aprobación de casa anfitriona */
interface AprobacionCasaResultado {
  ok: boolean;
  estado?: string;
}

/** Item de la lista de casas anfitrionas */
interface CasaAnfitrionaListItem {
  id: string;
  nombre_lugar: string;
  descripcion: string | null;
  capacidad_maxima: number | null;
  activa: boolean;
  aprobada: boolean;
  fotos_urls: string[] | null;
  notas_publicas: string | null;
  creado_en: string;
  usuarios: {
    id: string;
    nombre: string;
    apellido: string;
    foto_perfil_url: string | null;
  } | null;
  direcciones: {
    calle: string;
    barrio: string | null;
    latitud: number | null;
    longitud: number | null;
  } | null;
}

/** Datos para el mapa de grupos de vida (columnas de v_mapa_grupos_vida) */
interface DatosMapaGrupoItem {
  id: string;
  nombre: string;
  dia_reunion: string | null;
  hora_reunion: string | null;
  capacidad_maxima: number | null;
  estado_ciclo: string | null;
  segmento: string | null;
  temporada: string | null;
  lugar_reunion: string | null;
  latitud: number | null;
  longitud: number | null;
  direccion: string | null;
  total_miembros: number | null;
  lideres: Array<{ nombre: string; foto: string | null }> | null;
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

async function verificarPermisoCasa(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rpcName:
    | "puede_aprobar_casa_anfitriona"
    | "puede_cambiar_estado_casa_anfitriona"
    | "puede_editar_casa_anfitriona"
    | "puede_ver_casa_anfitriona",
  authId: string,
  casaId: string,
  error: string
): Promise<string | null> {
  const { data: puede, error: rpcError } = await supabase.rpc(rpcName, {
    p_auth_id: authId,
    p_casa_id: casaId,
  });

  if (rpcError) return rpcError.message;
  return puede ? null : error;
}

async function verificarUsuarioEnScope(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  authId: string,
  usuarioId: string,
  error: string
): Promise<string | null> {
  const { data: puede, error: rpcError } = await supabase.rpc(
    "puede_crear_casa_anfitriona_para",
    {
      p_auth_id: authId,
      p_usuario_id: usuarioId,
    }
  );

  if (rpcError) return rpcError.message;
  return puede ? null : error;
}

async function verificarUsuarioEnGrupoActivo(
  adminDb: ReturnType<typeof createSupabaseAdminClient>,
  usuarioId: string,
  error: string
): Promise<string | null> {
  const { data, error: queryError } = await adminDb
    .from("grupo_miembros")
    .select("id, grupos!inner(id)")
    .eq("usuario_id", usuarioId)
    .is("fecha_salida", null)
    .eq("grupos.activo", true)
    .eq("grupos.eliminado", false)
    .limit(1);

  if (queryError) return queryError.message;
  return data && data.length > 0 ? null : error;
}

async function verificarUsuarioSinCasaAsignada(
  adminDb: ReturnType<typeof createSupabaseAdminClient>,
  usuarioId: string,
  currentCasaId: string | undefined,
  error: string
): Promise<string | null> {
  let query = adminDb
    .from("casas_anfitrionas")
    .select("id")
    .or(`usuario_id.eq.${usuarioId},co_anfitrion_id.eq.${usuarioId}`);

  if (currentCasaId) {
    query = query.neq("id", currentCasaId);
  }

  const { data, error: queryError } = await query.limit(1);
  if (queryError) return queryError.message;
  return data && data.length > 0 ? error : null;
}

async function validarUsuarioAsignableACasa({
  adminDb,
  usuarioId,
  currentCasaId,
  etiqueta,
}: {
  adminDb: ReturnType<typeof createSupabaseAdminClient>;
  usuarioId: string;
  currentCasaId?: string;
  etiqueta: "propietario" | "co-anfitrión";
}): Promise<string | null> {
  const groupError = await verificarUsuarioEnGrupoActivo(
    adminDb,
    usuarioId,
    `El ${etiqueta} debe pertenecer actualmente a un grupo de vida`
  );
  if (groupError) return groupError;

  return verificarUsuarioSinCasaAsignada(
    adminDb,
    usuarioId,
    currentCasaId,
    etiqueta === "propietario"
      ? "Este usuario ya tiene una casa anfitriona asignada"
      : "Este co-anfitrión ya tiene una casa anfitriona asignada"
  );
}

async function validarUsuarioConsultable(usuarioId: string): Promise<string | null> {
  const { supabase, authId, error } = await validarAuthYPermisos();
  if (error) return error;

  return verificarUsuarioEnScope(
    supabase,
    authId,
    usuarioId,
    "No tienes permisos para consultar este usuario"
  );
}

function tieneEdicionSensible(datos: z.infer<typeof actualizarCasaSchema>): boolean {
  return [
    "capacidad_maxima",
    "calle",
    "barrio",
    "codigo_postal",
    "co_anfitrion_id",
    "disponibilidad",
    "lat",
    "lng",
    "parroquia_id",
    "referencia",
    "usuario_id",
  ].some((campo) => campo in datos);
}

function revalidarCasa(casaId: string): void {
  revalidatePath("/grupos-vida/casas-anfitrionas");
  revalidatePath(`/grupos-vida/casas-anfitrionas/${casaId}`);
}

// ─── Actions ─────────────────────────────────────────────────────────

/** Familiar del usuario con su relación */
interface FamiliarRelacion {
    id: string;
    nombre: string;
    apellido: string;
    foto_perfil_url: string | null;
    tipo_relacion: string;
}

/**
 * Obtiene las relaciones familiares de un usuario.
 * Consulta la tabla relaciones_usuarios y retorna nombre, foto y tipo de relación.
 * Se usa para ofrecer co-anfitriones al crear una casa anfitriona.
 */
export async function obtenerRelacionesFamiliares(
    usuarioId: string
): Promise<ResultadoAccion<FamiliarRelacion[]>> {
    try {
        const scopeError = await validarUsuarioConsultable(usuarioId);
        if (scopeError) return { success: false, error: scopeError };

        const adminDb = createSupabaseAdminClient();

        const { data, error } = await adminDb
            .from("relaciones_usuarios")
            .select(`
                tipo_relacion,
                usuario1_id,
                usuario2_id
            `)
            .or(`usuario1_id.eq.${usuarioId},usuario2_id.eq.${usuarioId}`);

        if (error) return { success: false, error: error.message };
        if (!data || data.length === 0) return { success: true, data: [] };

        // Extraer IDs de los familiares (el otro usuario en cada relación)
        const familiarIds = data.map((r) =>
            r.usuario1_id === usuarioId ? r.usuario2_id : r.usuario1_id
        );

        // Obtener datos de los familiares
        const { data: familiares, error: fetchError } = await adminDb
            .from("usuarios")
            .select("id, nombre, apellido, foto_perfil_url")
            .in("id", familiarIds);

        if (fetchError) return { success: false, error: fetchError.message };

        // Mapear con tipo de relación
        const resultado: FamiliarRelacion[] = (familiares ?? []).map((f) => {
            const relacion = data.find(
                (r) => r.usuario1_id === f.id || r.usuario2_id === f.id
            );
            return {
                id: f.id,
                nombre: f.nombre,
                apellido: f.apellido,
                foto_perfil_url: f.foto_perfil_url,
                tipo_relacion: relacion?.tipo_relacion ?? "familiar",
            };
        });

        return { success: true, data: resultado };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Error desconocido",
        };
    }
}

/** Datos de dirección de un usuario para auto-rellenar formularios */
export interface DireccionUsuario {
  calle: string;
  barrio: string | null;
  codigo_postal: string | null;
  referencia: string | null;
  lat: number | null;
  lng: number | null;
  parroquia_id: string | null;
  municipio_id: string | null;
  estado_id: string | null;
}

/**
 * Obtiene la dirección completa de un usuario.
 * Se usa para auto-rellenar el formulario de casa anfitriona
 * al seleccionar un miembro.
 */
export async function obtenerDireccionUsuario(
  usuarioId: string
): Promise<ResultadoAccion<DireccionUsuario>> {
  try {
    const scopeError = await validarUsuarioConsultable(usuarioId);
    if (scopeError) return { success: false, error: scopeError };

    // Usar admin después de validar scope con RPC para obtener joins enriquecidos.
    const admin = createSupabaseAdminClient();
    const { data: usuario } = await admin
      .from("usuarios")
      .select(`
        direccion_id,
        direcciones!usuarios_direccion_id_fkey (
          calle, barrio, codigo_postal, referencia, latitud, longitud,
          parroquia_id,
          parroquias!direcciones_parroquia_id_fkey (
            id, municipio_id,
            municipios!parroquias_municipio_id_fkey (
              id, estado_id
            )
          )
        )
      `)
      .eq("id", usuarioId)
      .single();

    if (!usuario) return { success: false, error: "Usuario no encontrado" };

    const dir = extraerRelacion<{
      calle: string; barrio: string | null; codigo_postal: string | null;
      referencia: string | null; latitud: number | null; longitud: number | null;
      parroquia_id: string | null;
      parroquias: {
        id: string; municipio_id: string;
        municipios: { id: string; estado_id: string };
      } | null;
    }>(usuario.direcciones);

    if (!dir) return { success: false, error: "El usuario no tiene dirección registrada" };

    return {
      success: true,
      data: {
        calle: dir.calle,
        barrio: dir.barrio,
        codigo_postal: dir.codigo_postal,
        referencia: dir.referencia,
        lat: dir.latitud,
        lng: dir.longitud,
        parroquia_id: dir.parroquia_id,
        municipio_id: dir.parroquias?.municipio_id ?? null,
        estado_id: dir.parroquias?.municipios?.estado_id ?? null,
      },
    };
  } catch {
    return { success: false, error: "Error al obtener la dirección del usuario" };
  }
}

/**
 * Crea una nueva casa anfitriona y su dirección asociada.
 */
export async function crearCasaAnfitriona(
  datos: z.infer<typeof crearCasaSchema>
): Promise<ResultadoAccion<{ id: string }>> {
  try {
    const parsed = crearCasaSchema.parse(datos);
    const { supabase, userId, authId, error } = await validarAuthYPermisos();
    if (error) return { success: false, error };

    const propietarioId = parsed.usuario_id ?? userId;
    const ownerScopeError = await verificarUsuarioEnScope(
      supabase,
      authId,
      propietarioId,
      "No tienes permisos para crear una casa para este usuario"
    );
    if (ownerScopeError) return { success: false, error: ownerScopeError };

    if (parsed.co_anfitrion_id) {
      const coHostScopeError = await verificarUsuarioEnScope(
        supabase,
        authId,
        parsed.co_anfitrion_id,
        "No tienes permisos para asignar este co-anfitrión"
      );
      if (coHostScopeError) return { success: false, error: coHostScopeError };
    }

    const adminDb = createSupabaseAdminClient();

    const ownerAssignmentError = await validarUsuarioAsignableACasa({
      adminDb,
      usuarioId: propietarioId,
      etiqueta: "propietario",
    });
    if (ownerAssignmentError) return { success: false, error: ownerAssignmentError };

    if (parsed.co_anfitrion_id) {
      const coHostAssignmentError = await validarUsuarioAsignableACasa({
        adminDb,
        usuarioId: parsed.co_anfitrion_id,
        etiqueta: "co-anfitrión",
      });
      if (coHostAssignmentError) return { success: false, error: coHostAssignmentError };
    }

    // 1. Crear dirección con lat/lng
    const { data: direccion, error: dirError } = await adminDb
      .from("direcciones")
      .insert({
        calle: parsed.calle,
        barrio: parsed.barrio || null,
        codigo_postal: parsed.codigo_postal || null,
        referencia: parsed.referencia || null,
        parroquia_id: parsed.parroquia_id || null,
        latitud: parsed.lat || null,
        longitud: parsed.lng || null,
      })
      .select("id")
      .single();

    if (dirError) return { success: false, error: `Error al crear dirección: ${dirError.message}` };

    // 2. Crear casa anfitriona
    const disponibilidadJson = (parsed.disponibilidad ?? []).map((dia) => ({
      dia,
      disponible: true,
    }));

    const { data: casa, error: casaError } = await adminDb
      .from("casas_anfitrionas")
      .insert({
        usuario_id: propietarioId,
        co_anfitrion_id: parsed.co_anfitrion_id || null,
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
    const { supabase, authId, error } = await validarAuthYPermisos();
    if (error) return { success: false, error };

    const permissionError = await verificarPermisoCasa(
      supabase,
      "puede_editar_casa_anfitriona",
      authId,
      casaId,
      "No tienes permisos para editar esta casa"
    );
    if (permissionError) return { success: false, error: permissionError };

    if (parsed.usuario_id) {
      const ownerScopeError = await verificarUsuarioEnScope(
        supabase,
        authId,
        parsed.usuario_id,
        "No tienes permisos para asignar este propietario"
      );
      if (ownerScopeError) return { success: false, error: ownerScopeError };
    }

    if (parsed.co_anfitrion_id) {
      const coHostScopeError = await verificarUsuarioEnScope(
        supabase,
        authId,
        parsed.co_anfitrion_id,
        "No tienes permisos para asignar este co-anfitrión"
      );
      if (coHostScopeError) return { success: false, error: coHostScopeError };
    }

    const adminDb = createSupabaseAdminClient();

    const { data: casa } = await adminDb
      .from("casas_anfitrionas")
      .select("usuario_id, direccion_id, aprobada")
      .eq("id", casaId)
      .single();

    if (!casa) return { success: false, error: "Casa no encontrada" };

    if (parsed.usuario_id) {
      const ownerAssignmentError = await validarUsuarioAsignableACasa({
        adminDb,
        usuarioId: parsed.usuario_id,
        currentCasaId: casaId,
        etiqueta: "propietario",
      });
      if (ownerAssignmentError) return { success: false, error: ownerAssignmentError };
    }

    if (parsed.co_anfitrion_id) {
      const coHostAssignmentError = await validarUsuarioAsignableACasa({
        adminDb,
        usuarioId: parsed.co_anfitrion_id,
        currentCasaId: casaId,
        etiqueta: "co-anfitrión",
      });
      if (coHostAssignmentError) return { success: false, error: coHostAssignmentError };
    }

    // Actualizar dirección si hay cambios
    if (casa.direccion_id && (parsed.calle || parsed.barrio || parsed.codigo_postal || parsed.referencia || parsed.parroquia_id || parsed.lat !== undefined || parsed.lng !== undefined)) {
      const dirUpdate: Record<string, unknown> = {};
      if (parsed.calle !== undefined) dirUpdate.calle = parsed.calle;
      if (parsed.barrio !== undefined) dirUpdate.barrio = parsed.barrio || null;
      if (parsed.codigo_postal !== undefined) dirUpdate.codigo_postal = parsed.codigo_postal || null;
      if (parsed.referencia !== undefined) dirUpdate.referencia = parsed.referencia || null;
      if (parsed.parroquia_id !== undefined) dirUpdate.parroquia_id = parsed.parroquia_id || null;
      if (parsed.lat !== undefined) dirUpdate.latitud = parsed.lat;
      if (parsed.lng !== undefined) dirUpdate.longitud = parsed.lng;

      if (Object.keys(dirUpdate).length > 0) {
        await adminDb.from("direcciones").update(dirUpdate).eq("id", casa.direccion_id);
      }
    }

    // Actualizar casa
    const casaUpdate: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
    if (parsed.nombre_lugar !== undefined) casaUpdate.nombre_lugar = parsed.nombre_lugar;
    if (parsed.descripcion !== undefined) casaUpdate.descripcion = parsed.descripcion || null;
    if (parsed.capacidad_maxima !== undefined) casaUpdate.capacidad_maxima = parsed.capacidad_maxima || null;
    if (parsed.notas_publicas !== undefined) casaUpdate.notas_publicas = parsed.notas_publicas || null;
    if (parsed.co_anfitrion_id !== undefined) casaUpdate.co_anfitrion_id = parsed.co_anfitrion_id || null;
    if (parsed.usuario_id !== undefined) casaUpdate.usuario_id = parsed.usuario_id;
    if (parsed.disponibilidad !== undefined) {
      casaUpdate.disponibilidad = parsed.disponibilidad.map((dia) => ({
        dia,
        disponible: true,
      }));
    }

    if (casa.aprobada && tieneEdicionSensible(parsed)) {
      casaUpdate.aprobada = false;
      casaUpdate.aprobada_en = null;
      casaUpdate.aprobada_por = null;
    }

    const { error: updateError } = await adminDb
      .from("casas_anfitrionas")
      .update(casaUpdate)
      .eq("id", casaId);

    if (updateError) return { success: false, error: `Error al actualizar: ${updateError.message}` };

    revalidarCasa(casaId);
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
): Promise<ResultadoAccion<AprobacionCasaResultado>> {
  const { supabase, authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const permissionError = await verificarPermisoCasa(
    supabase,
    "puede_aprobar_casa_anfitriona",
    authId,
    casaId,
    "No tienes permisos para aprobar o rechazar esta casa"
  );
  if (permissionError) return { success: false, error: permissionError };

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

  revalidarCasa(casaId);

  // Validar estructura del resultado JSON de la RPC con Zod
  const aprobacionSchema = z.object({
    ok: z.boolean(),
    estado: z.string().optional(),
  });
  const parsed = aprobacionSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Respuesta inesperada del servidor" };
  }
  return { success: true, data: parsed.data };
}

/**
 * Lista casas anfitrionas con filtros opcionales.
 */
export async function listarCasasAnfitrionas(filtros?: {
  soloAprobadas?: boolean;
  soloActivas?: boolean;
  limite?: number;
  offset?: number;
}): Promise<ResultadoAccion<CasaAnfitrionaListItem[]>> {
  const { supabase, authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const { data: visibleIds, error: visibleError } = await supabase.rpc(
    "obtener_casas_visibles_ids",
    { p_auth_id: authId }
  );

  if (visibleError) return { success: false, error: visibleError.message };
  if (!visibleIds || visibleIds.length === 0) return { success: true, data: [] };

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

  query = query.in("id", visibleIds);
  if (filtros?.soloAprobadas) query = query.eq("aprobada", true);
  if (filtros?.soloActivas) query = query.eq("activa", true);
  if (filtros?.limite) query = query.limit(filtros.limite);
  if (filtros?.offset) query = query.range(filtros.offset, filtros.offset + (filtros.limite ?? 20) - 1);

  const { data, error: queryError } = await query;

  if (queryError) return { success: false, error: queryError.message };
  return { success: true, data };
}

export async function cambiarEstadoCasaAnfitriona(
  casaId: string,
  activa: boolean
): Promise<ResultadoAccion<void>> {
  try {
    const { supabase, authId, error } = await validarAuthYPermisos();
    if (error) return { success: false, error };

    const permissionError = await verificarPermisoCasa(
      supabase,
      "puede_cambiar_estado_casa_anfitriona",
      authId,
      casaId,
      "No tienes permisos para cambiar el estado de esta casa"
    );
    if (permissionError) return { success: false, error: permissionError };

    const adminDb = createSupabaseAdminClient();
    const { error: updateError } = await adminDb
      .from("casas_anfitrionas")
      .update({ activa, actualizado_en: new Date().toISOString() })
      .eq("id", casaId);

    if (updateError) return { success: false, error: `Error al cambiar estado: ${updateError.message}` };

    revalidarCasa(casaId);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

/**
 * Obtiene datos del mapa de grupos usando la vista v_mapa_grupos_vida.
 */
export async function obtenerDatosMapaGrupos(): Promise<ResultadoAccion<DatosMapaGrupoItem[]>> {
  const { supabase, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const { data, error: queryError } = await supabase
    .from("v_mapa_grupos_vida")
    .select("*")
    .not("latitud", "is", null)
    .not("longitud", "is", null);

  if (queryError) return { success: false, error: queryError.message };
  return { success: true, data: data as DatosMapaGrupoItem[] };
}
