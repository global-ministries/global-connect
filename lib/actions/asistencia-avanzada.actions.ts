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

const ROLES_LECTORES_SALUD = ["admin", "pastor", "director-general", "director-etapa"];
const SIN_PERMISO_SALUD = "No tienes permiso para ver la salud de los miembros";

type LectorSalud =
  | { error: string }
  | {
      usuarioId: string;
      roles: string[];
      adminDb: ReturnType<typeof import("@/lib/supabase/admin").createSupabaseAdminClient>;
    };

/**
 * v_salud_miembros_grupo is closed to signed-in sessions (migration
 * 20261004100000); only director de etapa and above read it, through the
 * service client, after this check.
 */
async function resolverLectorSalud(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<LectorSalud> {
  const { getUserWithRoles } = await import("@/lib/getUserWithRoles");
  const userData = await getUserWithRoles(supabase);
  if (!userData?.user) return { error: "No autenticado" };
  const roles = userData.roles ?? [];
  if (!roles.some((r) => ROLES_LECTORES_SALUD.includes(r))) return { error: SIN_PERMISO_SALUD };

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const adminDb = createSupabaseAdminClient();
  const { data: usuario } = await adminDb
    .from("usuarios")
    .select("id")
    .eq("auth_id", userData.user.id)
    .maybeSingle();
  if (!usuario) return { error: SIN_PERMISO_SALUD };
  return { usuarioId: usuario.id, roles, adminDb };
}

/**
 * Groups whose health a reader may list: every group for admin and pastor
 * (null), the DG rule (gdv_dg_grupos_activos_visibles) for a director general,
 * the assigned groups for a director de etapa.
 */
async function grupoIdsVisiblesSalud(
  lector: Exclude<LectorSalud, { error: string }>
): Promise<{ error: string } | { grupoIds: string[] | null }> {
  if (lector.roles.some((r) => r === "admin" || r === "pastor")) return { grupoIds: null };

  const ids = new Set<string>();
  if (lector.roles.includes("director-general")) {
    const { data, error } = await lector.adminDb.rpc("gdv_dg_grupos_activos_visibles", {
      p_usuario_id: lector.usuarioId,
    });
    if (error) return { error: "No se pudieron obtener los grupos del director general" };
    for (const id of (data ?? []) as string[]) ids.add(id);
  }
  if (lector.roles.includes("director-etapa")) {
    const { data, error } = await lector.adminDb
      .from("director_etapa_grupos")
      .select("grupo_id, segmento_lideres!inner(usuario_id, tipo_lider)")
      .eq("segmento_lideres.usuario_id", lector.usuarioId)
      .eq("segmento_lideres.tipo_lider", "director_etapa");
    if (error) return { error: "No se pudieron obtener los grupos del director de etapa" };
    for (const row of data ?? []) ids.add(row.grupo_id);
  }
  return { grupoIds: [...ids] };
}

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
  const lector = await resolverLectorSalud(supabase);
  if ("error" in lector) return { success: false, error: lector.error };

  // Same group scope as the grupos policies: puede_ver_grupo, pinned to the
  // session person, through the session client.
  const { data: puedeVer, error: errorScope } = await supabase.rpc("puede_ver_grupo", {
    p_user_id: lector.usuarioId,
    p_grupo_id: grupoId,
  });
  if (errorScope) return { success: false, error: errorScope.message };
  if (!puedeVer) return { success: false, error: SIN_PERMISO_SALUD };

  const { data, error } = await lector.adminDb
    .from("v_salud_miembros_grupo")
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
  const lector = await resolverLectorSalud(supabase);
  if ("error" in lector) return { success: false, error: lector.error };

  const alcance = await grupoIdsVisiblesSalud(lector);
  if ("error" in alcance) return { success: false, error: alcance.error };
  if (alcance.grupoIds && alcance.grupoIds.length === 0) return { success: true, data: [] };

  // Supabase JS no soporta != directo en views.
  let query = lector.adminDb
    .from("v_salud_miembros_grupo")
    .select("*")
    .not("nivel_riesgo", "eq", "normal");
  if (alcance.grupoIds) query = query.in("grupo_id", alcance.grupoIds);
  const { data, error } = await query
    .order("semanas_ausente", { ascending: false })
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

  const { error } = await supabase.from("solicitudes_grupo").insert({
    grupo_id: parsed.data.grupo_id,
    tipo: "edicion_asistencia",
    solicitado_por: usuario.id,
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
