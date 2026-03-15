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
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "No autenticado" };

    // Usar admin para bypasear RLS (el rol ya fue validado al cargar la página)
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

    // Determinar el propietario: si se pasa usuario_id y el creador tiene rol de gestión, usar ese
    let propietarioId = userId;
    let puedeGestionar = false;
    if (parsed.usuario_id && parsed.usuario_id !== userId) {
      const { data: puede } = await supabase.rpc("puede_gestionar_casas", {
        p_auth_id: authId,
      });
      if (puede) {
        propietarioId = parsed.usuario_id;
        puedeGestionar = true;
      }
    }

    // Usar admin client si se asigna a otro usuario (RLS solo permite insertar para sí mismo)
    const dbInsert = puedeGestionar ? createSupabaseAdminClient() : supabase;

    // 1. Crear dirección con lat/lng
    const { data: direccion, error: dirError } = await dbInsert
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

    const { data: casa, error: casaError } = await dbInsert
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
        await supabase.from("direcciones").update(dirUpdate).eq("id", casa.direccion_id);
      }
    }

    // Actualizar casa
    const casaUpdate: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
    if (parsed.nombre_lugar !== undefined) casaUpdate.nombre_lugar = parsed.nombre_lugar;
    if (parsed.descripcion !== undefined) casaUpdate.descripcion = parsed.descripcion || null;
    if (parsed.capacidad_maxima !== undefined) casaUpdate.capacidad_maxima = parsed.capacidad_maxima || null;
    if (parsed.notas_publicas !== undefined) casaUpdate.notas_publicas = parsed.notas_publicas || null;
    if (parsed.co_anfitrion_id !== undefined) casaUpdate.co_anfitrion_id = parsed.co_anfitrion_id || null;
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
): Promise<ResultadoAccion<AprobacionCasaResultado>> {
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
