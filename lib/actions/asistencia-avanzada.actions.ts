"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  registrarAsistenciaPayloadSchema,
  resultadoAsistenciaSchema,
  saludMiembroSchema,
  dashboardRiesgoSchema,
  reporteRetencionSchema,
  reporteCrecimientoNetoSchema,
  type SaludMiembro,
  type DashboardRiesgo,
  type ReporteRetencion,
  type ReporteCrecimientoNeto,
  type ResultadoAsistencia,
  type RegistrarAsistenciaPayload,
} from "@/lib/types/asistencia-avanzada.types";

/**
 * Tipo genérico interno para resultados de Server Actions.
 * NO se exporta (Next.js "use server" solo permite exportar funciones async).
 */
type Res<T = void> = { success: boolean; error?: string; data?: T };

// ─── Registrar Asistencia v2 ─────────────────────────────────────────

/**
 * Registra asistencia con soporte para campos avanzados (v2).
 * Backward compatible: acepta tanto `presente: boolean` como `tipo_presencia: string`.
 */
export async function registrarAsistenciaV2(
  input: RegistrarAsistenciaPayload
): Promise<Res<ResultadoAsistencia>> {
  const parsed = registrarAsistenciaPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { grupo_id, fecha, asistencias, forzar_edicion, ...resto } = parsed.data;

  // RPC v2 agrega params que no están en los tipos generados (v1).
  // Usamos rpc() con params actualizados; Zod valida la respuesta.
  const rpcParams = {
    p_auth_id: user.id,
    p_grupo_id: grupo_id,
    p_fecha: fecha,
    p_hora: resto.hora ?? null,
    p_tema: resto.tema ?? null,
    p_notas: resto.notas ?? null,
    p_asistencias: asistencias,
    p_descripcion: resto.descripcion ?? null,
    p_puntos_oracion: resto.puntos_oracion ?? null,
    p_notas_privadas_lider: resto.notas_privadas_lider ?? null,
    p_conteo_visitantes: resto.conteo_visitantes ?? 0,
    p_no_hubo_reunion: resto.no_hubo_reunion ?? false,
    p_motivo_no_reunion: resto.motivo_no_reunion ?? null,
    p_forzar_edicion: forzar_edicion ?? false,
  };
  // Los params v2 extienden la firma v1; se usa CallableFunction hasta regenerar tipos
  const { data, error } = await (supabase.rpc as CallableFunction)(
    "registrar_asistencia",
    rpcParams
  );

  if (error) return { success: false, error: error.message };

  // Validar respuesta JSON de la RPC
  const resultado = resultadoAsistenciaSchema.safeParse(data);
  if (!resultado.success || resultado.data.error) {
    return {
      success: false,
      error: resultado.data?.error ?? "Error al registrar asistencia",
    };
  }

  revalidatePath(`/grupos-vida/${grupo_id}/asistencia`);
  revalidatePath(`/grupos-vida/${grupo_id}`);

  return { success: true, data: resultado.data };
}

// ─── Salud de Miembros ───────────────────────────────────────────────

/**
 * Obtiene la vista de salud de los miembros de un grupo.
 * Datos desde v_salud_miembros_grupo.
 */
export async function obtenerSaludMiembrosGrupo(
  grupoId: string
): Promise<Res<SaludMiembro[]>> {
  if (!z.string().uuid().safeParse(grupoId).success) {
    return { success: false, error: "ID de grupo inválido" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data, error } = await supabase
    .from("v_salud_miembros_grupo" as "grupo_miembros")
    .select("*")
    .eq("grupo_id", grupoId);

  if (error) return { success: false, error: error.message };

  // Validar con Zod en lugar de casting inseguro
  const parsed = z.array(saludMiembroSchema).safeParse(data ?? []);
  if (!parsed.success) {
    return { success: false, error: "Datos de salud con formato inesperado" };
  }
  return { success: true, data: parsed.data };
}

/**
 * Obtiene todos los miembros que NO están en nivel 'normal'.
 * Ordenados por semanas_ausente DESC. Para la página de listado completo.
 */
export async function obtenerMiembrosEnRiesgo(): Promise<Res<SaludMiembro[]>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  // Supabase JS no soporta != directo en views.
  // Traemos critico, riesgo, atencion con queries separadas y combinamos.
  const { data, error } = await supabase
    .from("v_salud_miembros_grupo" as "grupo_miembros")
    .select("*")
    .neq("nivel_riesgo" as "rol", "normal")
    .order("semanas_ausente" as "rol", { ascending: false })
    .limit(200);

  if (error) return { success: false, error: error.message };

  const parsed = z.array(saludMiembroSchema).safeParse(data ?? []);
  if (!parsed.success) {
    return { success: false, error: "Datos con formato inesperado" };
  }
  return { success: true, data: parsed.data };
}

// ─── Dashboard de Riesgo ─────────────────────────────────────────────

/**
 * Obtiene el dashboard global de riesgo para directores.
 * Solo accesible para directores y superadmins.
 */
export async function obtenerDashboardRiesgo(
  campusId?: string
): Promise<Res<DashboardRiesgo>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  // RPC nueva: no está en tipos generados aún. Se usa assertion mínima en nombre.
  const { data, error } = await (supabase.rpc as CallableFunction)(
    "obtener_dashboard_riesgo",
    { p_auth_id: user.id, p_campus_id: campusId ?? null }
  );

  if (error) return { success: false, error: error.message };

  const parsed = dashboardRiesgoSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Formato inesperado en dashboard de riesgo" };
  }
  return { success: true, data: parsed.data };
}

// ─── Reporte de Retención ────────────────────────────────────────────

/**
 * Obtiene el reporte de retención entre temporadas.
 */
export async function obtenerReporteRetencion(
  temporadaActualId: string,
  temporadaAnteriorId?: string,
  campusId?: string
): Promise<Res<ReporteRetencion>> {
  if (!z.string().uuid().safeParse(temporadaActualId).success) {
    return { success: false, error: "ID de temporada inválido" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  // RPC nueva: no está en tipos generados aún
  const { data, error } = await (supabase.rpc as CallableFunction)(
    "obtener_reporte_retencion",
    {
      p_auth_id: user.id,
      p_temporada_actual_id: temporadaActualId,
      p_temporada_anterior_id: temporadaAnteriorId ?? null,
      p_campus_id: campusId ?? null,
    }
  );

  if (error) return { success: false, error: error.message };

  const parsed = reporteRetencionSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Formato inesperado en reporte de retención" };
  }
  return { success: true, data: parsed.data };
}

// ─── Reporte de Crecimiento Neto ─────────────────────────────────────

/**
 * Obtiene el timeline de crecimiento neto (ingresos - egresos).
 */
export async function obtenerReporteCrecimientoNeto(
  grupoId?: string,
  campusId?: string,
  meses: number = 6
): Promise<Res<ReporteCrecimientoNeto>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  // RPC nueva: no está en tipos generados aún
  const { data, error } = await (supabase.rpc as CallableFunction)(
    "obtener_reporte_crecimiento_neto",
    {
      p_auth_id: user.id,
      p_grupo_id: grupoId ?? null,
      p_campus_id: campusId ?? null,
      p_meses: meses,
    }
  );

  if (error) return { success: false, error: error.message };

  const parsed = reporteCrecimientoNetoSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Formato inesperado en reporte de crecimiento" };
  }
  return { success: true, data: parsed.data };
}

// ─── Solicitud de Edición Tardía ─────────────────────────────────────

const solicitudEdicionSchema = z.object({
  grupo_id: z.string().uuid(),
  fecha_evento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motivo: z.string().min(10, "El motivo debe tener al menos 10 caracteres").max(500),
});

/**
 * Solicita permiso para editar asistencia fuera de la ventana permitida.
 * Crea una solicitud tipo 'edicion_asistencia' para revisión del director.
 */
export async function solicitarEdicionTardia(
  input: z.infer<typeof solicitudEdicionSchema>
): Promise<Res> {
  const parsed = solicitudEdicionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  // Obtener el ID interno del usuario
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!usuario) return { success: false, error: "Usuario no encontrado" };

  // @ts-expect-error — Columnas nuevas (tipo_solicitud, metadata_edicion) no están en tipos generados
  const { error } = await supabase.from("solicitudes_grupo").insert({
    grupo_id: parsed.data.grupo_id,
    tipo_solicitud: "edicion_asistencia",
    solicitante_id: usuario.id,
    estado: "pendiente",
    motivo: parsed.data.motivo,
    metadata_edicion: {
      fecha_evento: parsed.data.fecha_evento,
      grupo_id: parsed.data.grupo_id,
      motivo: parsed.data.motivo,
    },
  });

  if (error) {
    if (error.code === "42501") {
      return { success: false, error: "No tienes permisos para solicitar edición" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath(`/grupos-vida/${parsed.data.grupo_id}/asistencia`);
  return { success: true };
}
