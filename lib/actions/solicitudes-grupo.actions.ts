"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type {
  TipoSolicitud,
  AccionSolicitud,
  SolicitudPendiente,
  CrearSolicitudRpcResultado,
  ProcesarSolicitudRpcResultado,
  MovimientoHistorial,
  MiSolicitud,
} from "@/lib/types/solicitudes-grupo.types";

// ─── Types ───────────────────────────────────────────────────────────

type Res<T = void> = { success: boolean; error?: string; data?: T };

/** Tipo de solicitud para Zod validation */
const tipoSolicitudEnum = z.enum([
  "ingreso",
  "traslado",
  "cambio_rol",
  "egreso",
  "activacion_grupo",
]);

const accionSolicitudEnum = z.enum(["aprobar", "rechazar"]);

/** Schema Zod para validar el resultado del RPC crear_solicitud_grupo */
const CrearSolicitudRpcSchema = z.object({
  ok: z.boolean(),
  modo: z.enum(["directo", "solicitud"]),
  tipo: z.string().optional(),
  solicitud_id: z.string().uuid().optional(),
});

/** Schema Zod para validar el resultado del RPC procesar_solicitud_grupo */
const ProcesarSolicitudRpcSchema = z.object({
  ok: z.boolean(),
  modo: z.string(),
  solicitud_id: z.string().uuid(),
});

// ─── Schemas ─────────────────────────────────────────────────────────

const crearSolicitudSchema = z.object({
  tipo: tipoSolicitudEnum,
  usuario_id: z.string().uuid("ID de usuario inválido"),
  grupo_id: z.string().uuid("ID de grupo inválido"),
  grupo_origen_id: z.string().uuid().optional(),
  rol_solicitado: z.string().optional(),
  motivo: z.string().max(500).optional(),
});

const procesarSolicitudSchema = z.object({
  solicitud_id: z.string().uuid("ID de solicitud inválido"),
  accion: accionSolicitudEnum,
  notas: z.string().max(500).optional(),
});

// ─── Actions ─────────────────────────────────────────────────────────

/**
 * Crea una solicitud de grupo o ejecuta la acción directamente si el usuario
 * tiene permisos de DG+. Delega al RPC `crear_solicitud_grupo`.
 */
export async function crearSolicitudGrupo(
  input: z.infer<typeof crearSolicitudSchema>
): Promise<Res<CrearSolicitudRpcResultado>> {
  const parsed = crearSolicitudSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { tipo, usuario_id, grupo_id, grupo_origen_id, rol_solicitado, motivo } = parsed.data;

  const { data: rpcData, error } = await supabase.rpc("crear_solicitud_grupo", {
    p_auth_id: user.id,
    p_tipo: tipo,
    p_usuario_id: usuario_id,
    p_grupo_id: grupo_id,
    p_grupo_origen_id: grupo_origen_id,
    p_rol_solicitado: rol_solicitado,
    p_motivo: motivo,
  });

  if (error) {
    const mensajes: Record<string, string> = {
      usuario_no_encontrado: "Usuario no encontrado en el sistema",
      sin_permisos: "No tienes permisos para esta acción",
      miembro_ya_en_grupo: "El miembro ya pertenece a un grupo activo",
    };
    return { success: false, error: mensajes[error.message] ?? error.message };
  }

  revalidatePath("/grupos-vida/solicitudes");
  revalidatePath("/grupos-vida");

  const resultado = CrearSolicitudRpcSchema.parse(rpcData);
  return { success: true, data: resultado };
}

/**
 * Procesa (aprobar/rechazar) una solicitud pendiente.
 * Solo DG+ scoped puede hacerlo. Delega al RPC `procesar_solicitud_grupo`.
 */
export async function procesarSolicitudGrupo(
  input: z.infer<typeof procesarSolicitudSchema>
): Promise<Res<ProcesarSolicitudRpcResultado>> {
  const parsed = procesarSolicitudSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { solicitud_id, accion, notas } = parsed.data;

  const { data: rpcData, error } = await supabase.rpc("procesar_solicitud_grupo", {
    p_auth_id: user.id,
    p_solicitud_id: solicitud_id,
    p_accion: accion,
    p_notas: notas,
  });

  if (error) {
    const mensajes: Record<string, string> = {
      usuario_no_encontrado: "Usuario no encontrado",
      solicitud_no_encontrada_o_procesada: "Solicitud no encontrada o ya fue procesada",
      sin_permisos_para_este_grupo: "No tienes permisos sobre este grupo",
      accion_invalida: "Acción inválida",
    };
    return { success: false, error: mensajes[error.message] ?? error.message };
  }

  revalidatePath("/grupos-vida/solicitudes");
  revalidatePath("/grupos-vida");

  const resultado = ProcesarSolicitudRpcSchema.parse(rpcData);
  return { success: true, data: resultado };
}

/**
 * Lista solicitudes pendientes para el usuario actual (scoped por su rol).
 * Usa la vista `v_solicitudes_pendientes` que ya tiene los datos enriquecidos.
 */
export async function listarSolicitudesPendientes(): Promise<
  Res<SolicitudPendiente[]>
> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  // Primero expiramos las vencidas
  await supabase.rpc("expirar_solicitudes_vencidas");

  const { data, error } = await supabase
    .from("v_solicitudes_pendientes")
    .select("*")
    .order("creado_en", { ascending: false });

  if (error) return { success: false, error: error.message };

  const solicitudes = (data ?? []) as (SolicitudPendiente & { grupo_id?: string })[];

  // Enriquecer con líder, director y campus usando admin client
  const grupoIds = solicitudes.map(s => s.grupo_id).filter(Boolean) as string[];
  
  if (grupoIds.length > 0) {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const { extraerRelacion } = await import("@/lib/supabase/helpers");
    const adminDb = createSupabaseAdminClient();

    const { data: grupos } = await adminDb
      .from("grupos")
      .select(`
        id,
        campus:campus!grupos_campus_id_fkey(nombre),
        grupo_miembros(rol, usuario:usuarios!grupo_miembros_usuario_id_fkey(nombre, apellido)),
        director_etapa_grupos(segmento_lideres:segmento_lideres!director_etapa_grupos_director_etapa_id_fkey(usuario:usuarios!segmento_lideres_usuario_id_fkey(nombre, apellido)))
      `)
      .in("id", grupoIds);

    type GrupoEnriquecido = {
      id: string;
      campus: { nombre: string } | null;
      grupo_miembros: Array<{ rol: string; usuario: { nombre: string; apellido: string } | null }>;
      director_etapa_grupos: Array<{ segmento_lideres: { usuario: { nombre: string; apellido: string } | null } | null }>;
    };

    const grupoMap = new Map<string, GrupoEnriquecido>();
    for (const g of (grupos ?? []) as unknown as GrupoEnriquecido[]) {
      grupoMap.set(g.id, g);
    }

    for (const sol of solicitudes) {
      const detalle = sol.grupo_id ? grupoMap.get(sol.grupo_id) : null;
      
      const campusData = detalle?.campus ? extraerRelacion<{ nombre: string }>(detalle.campus) : null;
      sol.campus_nombre = campusData?.nombre ?? null;

      const liderMiembro = detalle?.grupo_miembros?.find(m => m.rol === "Líder");
      const liderUsuario = liderMiembro?.usuario ? extraerRelacion<{ nombre: string; apellido: string }>(liderMiembro.usuario) : null;
      sol.lider_nombre = liderUsuario?.nombre ?? null;
      sol.lider_apellido = liderUsuario?.apellido ?? null;

      const dirAsignacion = detalle?.director_etapa_grupos?.[0];
      const dirSegLider = dirAsignacion?.segmento_lideres ? extraerRelacion<{ usuario: { nombre: string; apellido: string } | null }>(dirAsignacion.segmento_lideres) : null;
      const dirUsuario = dirSegLider?.usuario ? extraerRelacion<{ nombre: string; apellido: string }>(dirSegLider.usuario) : null;
      sol.director_nombre = dirUsuario?.nombre ?? null;
      sol.director_apellido = dirUsuario?.apellido ?? null;
    }
  } else {
    // Sin grupo_ids, llenar valores nulos
    for (const sol of solicitudes) {
      sol.campus_nombre = null;
      sol.lider_nombre = null;
      sol.lider_apellido = null;
      sol.director_nombre = null;
      sol.director_apellido = null;
    }
  }

  return { success: true, data: solicitudes };
}

/**
 * Lista solicitudes completadas (aprobadas, rechazadas, expiradas)
 * para roles DG+ con los mismos datos enriquecidos.
 */
export async function listarSolicitudesCompletadas(): Promise<
  Res<SolicitudPendiente[]>
> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const { extraerRelacion } = await import("@/lib/supabase/helpers");
  const adminDb = createSupabaseAdminClient();

  const { data, error } = await adminDb
    .from("solicitudes_grupo")
    .select(`
      id, tipo, estado, motivo, creado_en, expira_en,
      grupo_id, grupo_origen_id, rol_solicitado, temporada_id,
      grupo:grupos!solicitudes_grupo_grupo_id_fkey(nombre, segmento:segmentos!grupos_segmento_id_fkey(nombre)),
      grupo_origen:grupos!solicitudes_grupo_grupo_origen_id_fkey(nombre),
      usuario:usuarios!solicitudes_grupo_usuario_id_fkey(id, nombre, apellido, foto_perfil_url),
      solicitante:usuarios!solicitudes_grupo_solicitado_por_fkey(nombre, apellido),
      temporada:temporadas!solicitudes_grupo_temporada_id_fkey(nombre, estado)
    `)
    .neq("estado", "pendiente")
    .order("actualizado_en", { ascending: false })
    .limit(50);

  if (error) return { success: false, error: error.message };

  // Enriquecer con líder, director y campus
  const grupoIds = (data ?? []).map(s => s.grupo_id).filter(Boolean);

  let grupoMap = new Map<string, {
    campus: { nombre: string } | null;
    grupo_miembros: Array<{ rol: string; usuario: { nombre: string; apellido: string } | null }>;
    director_etapa_grupos: Array<{ segmento_lideres: { usuario: { nombre: string; apellido: string } | null } | null }>;
  }>();

  if (grupoIds.length > 0) {
    const { data: grupos } = await adminDb
      .from("grupos")
      .select(`
        id,
        campus:campus!grupos_campus_id_fkey(nombre),
        grupo_miembros(rol, usuario:usuarios!grupo_miembros_usuario_id_fkey(nombre, apellido)),
        director_etapa_grupos(segmento_lideres:segmento_lideres!director_etapa_grupos_director_etapa_id_fkey(usuario:usuarios!segmento_lideres_usuario_id_fkey(nombre, apellido)))
      `)
      .in("id", grupoIds);

    for (const g of (grupos ?? []) as unknown as Array<{ id: string; campus: { nombre: string } | null; grupo_miembros: Array<{ rol: string; usuario: { nombre: string; apellido: string } | null }>; director_etapa_grupos: Array<{ segmento_lideres: { usuario: { nombre: string; apellido: string } | null } | null }> }>) {
      grupoMap.set(g.id, g);
    }
  }

  const solicitudes: SolicitudPendiente[] = (data ?? []).map((sol) => {
    const grupo = extraerRelacion<{ nombre: string; segmento: { nombre: string } | null }>(sol.grupo);
    const grupoOrigen = extraerRelacion<{ nombre: string }>(sol.grupo_origen);
    const usuario = extraerRelacion<{ id: string; nombre: string; apellido: string; foto_perfil_url: string | null }>(sol.usuario);
    const solicitante = extraerRelacion<{ nombre: string; apellido: string }>(sol.solicitante);
    const temporada = extraerRelacion<{ nombre: string; estado: string }>(sol.temporada);

    const segmento = grupo?.segmento ? extraerRelacion<{ nombre: string }>(grupo.segmento) : null;

    const detalle = sol.grupo_id ? grupoMap.get(sol.grupo_id) : null;
    const campusData = detalle?.campus ? extraerRelacion<{ nombre: string }>(detalle.campus) : null;
    const liderMiembro = detalle?.grupo_miembros?.find(m => m.rol === "Líder");
    const liderUsuario = liderMiembro?.usuario ? extraerRelacion<{ nombre: string; apellido: string }>(liderMiembro.usuario) : null;
    const dirAsignacion = detalle?.director_etapa_grupos?.[0];
    const dirSegLider = dirAsignacion?.segmento_lideres ? extraerRelacion<{ usuario: { nombre: string; apellido: string } | null }>(dirAsignacion.segmento_lideres) : null;
    const dirUsuario = dirSegLider?.usuario ? extraerRelacion<{ nombre: string; apellido: string }>(dirSegLider.usuario) : null;

    return {
      id: sol.id,
      tipo: sol.tipo as SolicitudPendiente["tipo"],
      estado: sol.estado,
      motivo: sol.motivo,
      creado_en: sol.creado_en,
      expira_en: sol.expira_en,
      grupo_id: sol.grupo_id,
      grupo_origen_id: sol.grupo_origen_id,
      rol_solicitado: sol.rol_solicitado,
      temporada_id: sol.temporada_id,
      grupo_nombre: grupo?.nombre ?? "Sin grupo",
      segmento_nombre: segmento?.nombre ?? "",
      grupo_origen_nombre: grupoOrigen?.nombre ?? null,
      miembro_id: usuario?.id ?? null,
      miembro_nombre: usuario?.nombre ?? null,
      miembro_apellido: usuario?.apellido ?? null,
      miembro_foto: usuario?.foto_perfil_url ?? null,
      solicitante_nombre: solicitante?.nombre ?? "",
      solicitante_apellido: solicitante?.apellido ?? "",
      temporada_nombre: temporada?.nombre ?? null,
      temporada_estado: temporada?.estado ?? null,
      campus_nombre: campusData?.nombre ?? null,
      lider_nombre: liderUsuario?.nombre ?? null,
      lider_apellido: liderUsuario?.apellido ?? null,
      director_nombre: dirUsuario?.nombre ?? null,
      director_apellido: dirUsuario?.apellido ?? null,
    };
  });

  return { success: true, data: solicitudes };
}

/**
 * Obtener conteo de solicitudes pendientes para el badge del sidebar.
 * Usa la función `contar_solicitudes_pendientes` que es scoped por rol.
 */
export async function contarSolicitudesPendientes(): Promise<Res<number>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data, error } = await supabase.rpc("contar_solicitudes_pendientes", {
    p_auth_id: user.id,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? 0 };
}

export async function obtenerHistorialMiembro(
  usuarioId: string
): Promise<Res<MovimientoHistorial[]>> {
  if (!z.string().uuid().safeParse(usuarioId).success) {
    return { success: false, error: "ID de usuario inválido" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data, error } = await supabase
    .from("v_historial_miembro")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("creado_en", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as MovimientoHistorial[] };
}

// ─── COR-004: Acciones faltantes ─────────────────────────────────────

/** Schema para cancelar una solicitud */
const cancelarSolicitudSchema = z.object({
  solicitud_id: z.string().uuid("ID de solicitud inválido"),
});

/**
 * Cancela una solicitud pendiente. Solo el solicitante original puede cancelar.
 *
 * @param input - Objeto con `solicitud_id`
 * @returns Resultado con éxito o error
 */
export async function cancelarSolicitud(
  input: z.infer<typeof cancelarSolicitudSchema>
): Promise<Res> {
  const parsed = cancelarSolicitudSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  // Obtener ID interno del usuario
  const { data: usuarioInterno } = await supabase
    .from("usuarios")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!usuarioInterno) return { success: false, error: "Usuario no encontrado" };

  // Solo el solicitante puede cancelar, y solo si está pendiente
  const { error } = await supabase
    .from("solicitudes_grupo")
    .update({ estado: "cancelado" as string, actualizado_en: new Date().toISOString() })
    .eq("id", parsed.data.solicitud_id)
    .eq("solicitado_por", usuarioInterno.id)
    .eq("estado", "pendiente");

  if (error) return { success: false, error: error.message };

  revalidatePath("/grupos-vida/solicitudes");
  return { success: true };
}

/**
 * Obtiene las solicitudes creadas por el usuario actual, enriquecidas con detalles del grupo.
 */
export async function obtenerMisSolicitudes(): Promise<Res<MiSolicitud[]>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: usuarioInterno } = await supabase
    .from("usuarios")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!usuarioInterno) return { success: false, error: "Usuario no encontrado" };

  const { data, error } = await supabase
    .from("solicitudes_grupo")
    .select(`
      id, tipo, estado, motivo, notas_director, creado_en, actualizado_en, grupo_id,
      grupo:grupos!solicitudes_grupo_grupo_id_fkey(nombre),
      grupo_origen:grupos!solicitudes_grupo_grupo_origen_id_fkey(nombre),
      usuario:usuarios!solicitudes_grupo_usuario_id_fkey(nombre, apellido)
    `)
    .eq("solicitado_por", usuarioInterno.id)
    .order("creado_en", { ascending: false })
    .limit(50);

  if (error) return { success: false, error: error.message };

  // Normalizar relaciones con extraerRelacion para evitar castings inline
  const { extraerRelacion } = await import("@/lib/supabase/helpers");

  // Obtener grupo_ids para enriquecer con detalles
  const grupoIds = (data ?? []).map(s => s.grupo_id).filter(Boolean);
  
  // Enriquecer con datos del grupo usando admin para bypasear RLS
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const adminDb = createSupabaseAdminClient();
  
  type GrupoDetalle = {
    id: string;
    segmento_id: string | null;
    segmento: { nombre: string } | null;
    temporada: { nombre: string } | null;
    campus: { nombre: string } | null;
    grupo_miembros: Array<{ rol: string; usuario: { nombre: string; apellido: string } | null }>;
    director_etapa_grupos: Array<{ segmento_lideres: { usuario: { nombre: string; apellido: string } | null } | null }>;
  };

  let grupoDetalles: Map<string, GrupoDetalle> = new Map();
  
  if (grupoIds.length > 0) {
    const { data: grupos } = await adminDb
      .from("grupos")
      .select(`
        id, segmento_id,
        segmento:segmentos!grupos_segmento_id_fkey(nombre),
        temporada:temporadas!grupos_temporada_id_fkey(nombre),
        campus:campus!grupos_campus_id_fkey(nombre),
        grupo_miembros(rol, usuario:usuarios!grupo_miembros_usuario_id_fkey(nombre, apellido)),
        director_etapa_grupos(segmento_lideres:segmento_lideres!director_etapa_grupos_director_etapa_id_fkey(usuario:usuarios!segmento_lideres_usuario_id_fkey(nombre, apellido)))
      `)
      .in("id", grupoIds);

    for (const g of (grupos ?? []) as unknown as GrupoDetalle[]) {
      grupoDetalles.set(g.id, g);
    }
  }

  const solicitudes: MiSolicitud[] = (data ?? []).map((sol) => {
    const grupo = extraerRelacion<{ nombre: string }>(sol.grupo);
    const grupoOrigen = extraerRelacion<{ nombre: string }>(sol.grupo_origen);
    const usuario = extraerRelacion<{ nombre: string; apellido: string }>(sol.usuario);
    
    const detalle = grupoDetalles.get(sol.grupo_id);
    const segmento = detalle?.segmento ? extraerRelacion<{ nombre: string }>(detalle.segmento) : null;
    const temporada = detalle?.temporada ? extraerRelacion<{ nombre: string }>(detalle.temporada) : null;
    const campusData = detalle?.campus ? extraerRelacion<{ nombre: string }>(detalle.campus) : null;
    
    // Encontrar líder del grupo
    const liderMiembro = detalle?.grupo_miembros?.find(m => m.rol === "Líder");
    const liderUsuario = liderMiembro?.usuario ? extraerRelacion<{ nombre: string; apellido: string }>(liderMiembro.usuario) : null;
    
    // Encontrar director de etapa
    const directorAsignacion = detalle?.director_etapa_grupos?.[0];
    const directorSegLider = directorAsignacion?.segmento_lideres ? extraerRelacion<{ usuario: { nombre: string; apellido: string } | null }>(directorAsignacion.segmento_lideres) : null;
    const directorUsuario = directorSegLider?.usuario ? extraerRelacion<{ nombre: string; apellido: string }>(directorSegLider.usuario) : null;

    return {
      id: sol.id,
      tipo: sol.tipo,
      estado: sol.estado,
      grupo_id: sol.grupo_id,
      motivo: sol.motivo,
      notas_director: sol.notas_director,
      creado_en: sol.creado_en,
      actualizado_en: sol.actualizado_en,
      grupo_nombre: grupo?.nombre ?? null,
      grupo_origen_nombre: grupoOrigen?.nombre ?? null,
      usuario_nombre: usuario?.nombre ?? null,
      usuario_apellido: usuario?.apellido ?? null,
      segmento_id: detalle?.segmento_id ?? null,
      segmento_nombre: segmento?.nombre ?? null,
      temporada_nombre: temporada?.nombre ?? null,
      campus_nombre: campusData?.nombre ?? null,
      lider_nombre: liderUsuario?.nombre ?? null,
      lider_apellido: liderUsuario?.apellido ?? null,
      director_nombre: directorUsuario?.nombre ?? null,
      director_apellido: directorUsuario?.apellido ?? null,
    };
  });

  return { success: true, data: solicitudes };
}

/** Schema para agregar miembro directamente */
const agregarMiembroDirectoSchema = z.object({
  usuario_id: z.string().uuid("ID de usuario inválido"),
  grupo_id: z.string().uuid("ID de grupo inválido"),
  rol: z.string().optional(),
});

/**
 * Wrapper para agregar un miembro directamente a un grupo.
 * Usa la RPC `crear_solicitud_grupo` con tipo 'ingreso' — si el usuario
 * es DG+ se ejecuta directo, si no crea solicitud.
 *
 * @param input - Objeto con `usuario_id`, `grupo_id`, y `rol` opcional
 * @returns Resultado de la operación con modo directo o solicitud
 */
export async function agregarMiembroDirecto(
  input: z.infer<typeof agregarMiembroDirectoSchema>
): Promise<Res<CrearSolicitudRpcResultado>> {
  const parsed = agregarMiembroDirectoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  return crearSolicitudGrupo({
    tipo: "ingreso",
    usuario_id: parsed.data.usuario_id,
    grupo_id: parsed.data.grupo_id,
    rol_solicitado: parsed.data.rol,
  });
}

// ─── Acciones de Mis Solicitudes ─────────────────────────────────────

/**
 * Cancela una solicitud de activación de grupo.
 * Elimina la solicitud y soft-deletes el grupo pendiente asociado.
 * Solo el creador de la solicitud puede cancelarla.
 */
export async function cancelarSolicitudActivacion(solicitudId: string): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: usuarioInterno } = await supabase
    .from("usuarios")
    .select("id")
    .eq("auth_id", user.id)
    .single();
  if (!usuarioInterno) return { success: false, error: "Usuario no encontrado" };

  // Verificar que la solicitud existe, es del usuario, y está pendiente
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const adminDb = createSupabaseAdminClient();

  const { data: solicitud, error: fetchErr } = await adminDb
    .from("solicitudes_grupo")
    .select("id, tipo, estado, solicitado_por, grupo_id")
    .eq("id", solicitudId)
    .single();

  if (fetchErr || !solicitud) return { success: false, error: "Solicitud no encontrada" };
  if (solicitud.solicitado_por !== usuarioInterno.id) return { success: false, error: "No tienes permisos" };
  if (solicitud.estado !== "pendiente") return { success: false, error: "Solo se pueden cancelar solicitudes pendientes" };
  if (solicitud.tipo !== "activacion_grupo") return { success: false, error: "Solo se pueden cancelar solicitudes de activación" };

  // Eliminar la solicitud
  const { error: delErr } = await adminDb
    .from("solicitudes_grupo")
    .delete()
    .eq("id", solicitudId);
  if (delErr) return { success: false, error: `Error al eliminar solicitud: ${delErr.message}` };

  // Soft-delete del grupo pendiente
  const { error: updErr } = await adminDb
    .from("grupos")
    .update({ eliminado: true })
    .eq("id", solicitud.grupo_id)
    .eq("estado_aprobacion", "pendiente");
  if (updErr) {
    console.error("[cancelarSolicitudActivacion] Error soft-deleting grupo:", updErr.message);
  }

  revalidatePath("/grupos-vida");
  revalidatePath("/grupos-vida/solicitudes");
  return { success: true };
}

/**
 * Edita el líder y/o director de etapa de un grupo pendiente de aprobación.
 * Solo el creador de la solicitud puede editar.
 */
export async function editarGrupoPendiente(input: {
  solicitud_id: string;
  lider_usuario_id?: string | null;
  director_etapa_segmento_lider_id?: string | null;
}): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: usuarioInterno } = await supabase
    .from("usuarios")
    .select("id")
    .eq("auth_id", user.id)
    .single();
  if (!usuarioInterno) return { success: false, error: "Usuario no encontrado" };

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const adminDb = createSupabaseAdminClient();

  // Verificar solicitud
  const { data: solicitud } = await adminDb
    .from("solicitudes_grupo")
    .select("id, tipo, estado, solicitado_por, grupo_id")
    .eq("id", input.solicitud_id)
    .single();

  if (!solicitud) return { success: false, error: "Solicitud no encontrada" };
  if (solicitud.solicitado_por !== usuarioInterno.id) return { success: false, error: "No tienes permisos" };
  if (solicitud.estado !== "pendiente") return { success: false, error: "Solo se pueden editar solicitudes pendientes" };

  const grupoId = solicitud.grupo_id;

  // Actualizar líder: quitar el anterior y poner el nuevo
  if (input.lider_usuario_id !== undefined) {
    // Eliminar líder actual
    await adminDb
      .from("grupo_miembros")
      .delete()
      .eq("grupo_id", grupoId)
      .eq("rol", "Líder");

    // Insertar nuevo líder (si se proporcionó)
    if (input.lider_usuario_id) {
      await adminDb
        .from("grupo_miembros")
        .insert({ grupo_id: grupoId, usuario_id: input.lider_usuario_id, rol: "Líder" });
    }
  }

  // Actualizar director de etapa
  if (input.director_etapa_segmento_lider_id !== undefined) {
    // Eliminar asignación actual
    await adminDb
      .from("director_etapa_grupos")
      .delete()
      .eq("grupo_id", grupoId);

    // Asignar nuevo director (si se proporcionó)
    if (input.director_etapa_segmento_lider_id) {
      await adminDb
        .from("director_etapa_grupos")
        .insert({
          grupo_id: grupoId,
          director_etapa_id: input.director_etapa_segmento_lider_id,
        });
    }
  }

  revalidatePath("/grupos-vida");
  revalidatePath("/grupos-vida/solicitudes");
  return { success: true };
}
