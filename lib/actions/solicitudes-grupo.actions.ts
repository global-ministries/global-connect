"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ─── Types ───────────────────────────────────────────────────────────

interface ResultadoAccion<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

/** Tipo de solicitud para Zod validation */
const tipoSolicitudEnum = z.enum([
  "ingreso",
  "traslado",
  "cambio_rol",
  "egreso",
  "activacion_grupo",
]);

const accionSolicitudEnum = z.enum(["aprobar", "rechazar"]);

export type TipoSolicitud = z.infer<typeof tipoSolicitudEnum>;
export type AccionSolicitud = z.infer<typeof accionSolicitudEnum>;

/** Solicitud pendiente enriquecida (de la vista v_solicitudes_pendientes) */
export interface SolicitudPendiente {
  id: string;
  tipo: TipoSolicitud;
  estado: string;
  motivo: string | null;
  creado_en: string;
  expira_en: string | null;
  grupo_id: string;
  grupo_origen_id: string | null;
  rol_solicitado: string | null;
  temporada_id: string | null;
  grupo_nombre: string;
  segmento_nombre: string;
  grupo_origen_nombre: string | null;
  miembro_id: string | null;
  miembro_nombre: string | null;
  miembro_apellido: string | null;
  miembro_foto: string | null;
  solicitante_nombre: string;
  solicitante_apellido: string;
  temporada_nombre: string | null;
  temporada_estado: string | null;
}

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
  accion: z.string(),
  solicitud_id: z.string().uuid(),
});

export type CrearSolicitudRpcResultado = z.infer<typeof CrearSolicitudRpcSchema>;
export type ProcesarSolicitudRpcResultado = z.infer<typeof ProcesarSolicitudRpcSchema>;

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
): Promise<ResultadoAccion<CrearSolicitudRpcResultado>> {
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
): Promise<ResultadoAccion<ProcesarSolicitudRpcResultado>> {
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
  ResultadoAccion<SolicitudPendiente[]>
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

  return { success: true, data: (data ?? []) as SolicitudPendiente[] };
}

/**
 * Obtener conteo de solicitudes pendientes para el badge del sidebar.
 * Usa la función `contar_solicitudes_pendientes` que es scoped por rol.
 */
export async function contarSolicitudesPendientes(): Promise<ResultadoAccion<number>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data, error } = await supabase.rpc("contar_solicitudes_pendientes", {
    p_auth_id: user.id,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? 0 };
}

/**
 * Historial de movimientos de un miembro específico.
 * Usa la vista `v_historial_miembro`.
 */
export interface MovimientoHistorial {
  id: string;
  usuario_id: string;
  tipo_movimiento: string;
  rol_anterior: string | null;
  rol_nuevo: string | null;
  motivo: string | null;
  creado_en: string;
  grupo_origen: string | null;
  grupo_destino: string | null;
  realizado_por_nombre: string | null;
  realizado_por_apellido: string | null;
  temporada: string | null;
}

export async function obtenerHistorialMiembro(
  usuarioId: string
): Promise<ResultadoAccion<MovimientoHistorial[]>> {
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
): Promise<ResultadoAccion> {
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

/** Solicitud propia con datos de relaciones */
export interface MiSolicitud {
  id: string;
  tipo: string;
  estado: string;
  motivo: string | null;
  notas_director: string | null;
  creado_en: string;
  actualizado_en: string;
  grupo_nombre: string | null;
  grupo_origen_nombre: string | null;
  usuario_nombre: string | null;
  usuario_apellido: string | null;
}

/**
 * Obtiene las solicitudes creadas por el usuario actual.
 * Mueve el query fuera de la página y normaliza las relaciones.
 *
 * @returns Lista de solicitudes propias con datos normalizados
 */
export async function obtenerMisSolicitudes(): Promise<ResultadoAccion<MiSolicitud[]>> {
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
      id, tipo, estado, motivo, notas_director, creado_en, actualizado_en,
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

  const solicitudes: MiSolicitud[] = (data ?? []).map((sol) => {
    const grupo = extraerRelacion<{ nombre: string }>(sol.grupo);
    const grupoOrigen = extraerRelacion<{ nombre: string }>(sol.grupo_origen);
    const usuario = extraerRelacion<{ nombre: string; apellido: string }>(sol.usuario);

    return {
      id: sol.id,
      tipo: sol.tipo,
      estado: sol.estado,
      motivo: sol.motivo,
      notas_director: sol.notas_director,
      creado_en: sol.creado_en,
      actualizado_en: sol.actualizado_en,
      grupo_nombre: grupo?.nombre ?? null,
      grupo_origen_nombre: grupoOrigen?.nombre ?? null,
      usuario_nombre: usuario?.nombre ?? null,
      usuario_apellido: usuario?.apellido ?? null,
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
): Promise<ResultadoAccion<CrearSolicitudRpcResultado>> {
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
