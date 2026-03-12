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

/** Resultado del RPC crear_solicitud_grupo */
interface CrearSolicitudRpcResultado {
  ok: boolean;
  modo: "directo" | "solicitud";
  tipo?: string;
  solicitud_id?: string;
}

/** Resultado del RPC procesar_solicitud_grupo */
interface ProcesarSolicitudRpcResultado {
  ok: boolean;
  accion: string;
  solicitud_id: string;
}

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

  const resultado = rpcData as unknown as CrearSolicitudRpcResultado;
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

  const resultado = rpcData as unknown as ProcesarSolicitudRpcResultado;
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
