// Types & Zod schemas for asistencia avanzada module

import { z } from "zod";

// ─── Schemas de Asistencia Avanzada ──────────────────────────────────

/** Tipo de presencia para asistencia */
export const tipoPresenciaSchema = z.enum([
  "presente",
  "ausente",
  "tarde",
  "justificado",
]);
export type TipoPresencia = z.infer<typeof tipoPresenciaSchema>;

/** Registro individual de asistencia para la RPC v2 */
export const registroAsistenciaSchema = z.object({
  usuario_id: z.string().uuid(),
  tipo_presencia: tipoPresenciaSchema.optional(),
  presente: z.boolean().optional(), // backward compat v1
  motivo_inasistencia: z.string().max(500).optional(),
  nota: z.string().max(500).optional(),
});
export type RegistroAsistencia = z.infer<typeof registroAsistenciaSchema>;

/** Payload completo para registrar asistencia v2 */
export const registrarAsistenciaPayloadSchema = z.object({
  grupo_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  hora: z.string().max(10).optional(),
  tema: z.string().max(200).optional(),
  notas: z.string().max(2000).optional(),
  descripcion: z.string().max(2000).optional(),
  puntos_oracion: z.string().max(2000).optional(),
  notas_privadas_lider: z.string().max(2000).optional(),
  conteo_visitantes: z.number().int().min(0).max(200).optional(),
  no_hubo_reunion: z.boolean().optional(),
  motivo_no_reunion: z.string().max(500).optional(),
  asistencias: z.array(registroAsistenciaSchema),
  forzar_edicion: z.boolean().optional(),
});
export type RegistrarAsistenciaPayload = z.infer<typeof registrarAsistenciaPayloadSchema>;

// ─── Tipos de Respuesta ──────────────────────────────────────────────

/** Resultado del registro de asistencia v2 (JSON de la RPC) */
export const resultadoAsistenciaSchema = z.object({
  ok: z.boolean(),
  evento_id: z.string().uuid().optional(),
  no_hubo_reunion: z.boolean().optional(),
  error: z.string().optional(),
});
export type ResultadoAsistencia = z.infer<typeof resultadoAsistenciaSchema>;

/** Salud del miembro (desde v_salud_miembros_grupo) */
export const saludMiembroSchema = z.object({
  usuario_id: z.string(),
  grupo_id: z.string(),
  rol: z.string().nullable(),
  nombre_completo: z.string(),
  ultima_vez_presente: z.string().nullable(),
  total_presencias: z.coerce.number(),
  total_ausencias: z.coerce.number(),
  total_eventos: z.coerce.number(),
  pct_asistencia: z.coerce.number(),
  semanas_ausente: z.coerce.number(),
  nivel_riesgo: z.enum(["normal", "atencion", "riesgo", "critico"]),
});
export type SaludMiembro = z.infer<typeof saludMiembroSchema>;

// ─── Tipos de Reportes ───────────────────────────────────────────────

/** KPIs del dashboard de riesgo para directores */
export const dashboardRiesgoSchema = z.object({
  total_grupos: z.coerce.number(),
  grupos_sin_reunion_esta_semana: z.coerce.number(),
  miembros_criticos: z.coerce.number(),
  miembros_en_riesgo: z.coerce.number(),
  miembros_en_atencion: z.coerce.number(),
  solicitudes_pendientes: z.coerce.number(),
  visitantes_del_mes: z.coerce.number(),
  top_5_grupos_riesgo: z.array(z.object({
    grupo_id: z.string(),
    grupo_nombre: z.string(),
    criticos: z.coerce.number(),
    riesgo_total: z.coerce.number(),
    total_miembros: z.coerce.number(),
  })),
  tendencia_asistencia_4_semanas: z.array(z.object({
    semana: z.string(),
    pct: z.coerce.number(),
  })),
});
export type DashboardRiesgo = z.infer<typeof dashboardRiesgoSchema>;

/** Reporte de retención entre temporadas */
export const reporteRetencionSchema = z.object({
  miembros_que_continuaron: z.coerce.number(),
  miembros_anteriores: z.coerce.number(),
  miembros_nuevos: z.coerce.number(),
  miembros_no_renovaron: z.coerce.number(),
  pct_retencion: z.coerce.number(),
  detalle_no_renovaron: z.array(z.object({
    usuario_id: z.string(),
    nombre: z.string(),
  })),
});
export type ReporteRetencion = z.infer<typeof reporteRetencionSchema>;

/** Timeline de crecimiento neto */
export const reporteCrecimientoNetoSchema = z.object({
  timeline: z.array(z.object({
    mes: z.string(),
    etiqueta: z.string(),
    ingresos: z.coerce.number(),
    egresos: z.coerce.number(),
    neto: z.coerce.number(),
  })),
});
export type ReporteCrecimientoNeto = z.infer<typeof reporteCrecimientoNetoSchema>;

// ─── Configuración Extendida ─────────────────────────────────────────

/** Modos de cierre de ventana de edición */
export const modoCierreSchema = z.enum([
  "semanal",
  "libre",
  "ultimas_2_semanas",
  "ultimo_mes",
]);
export type ModoCierre = z.infer<typeof modoCierreSchema>;

/** Configuración de asistencia (sub-set de configuracion_grupos_vida) */
export const configAsistenciaSchema = z.object({
  modo_cierre_asistencia: modoCierreSchema.optional(),
  dia_cierre_semanal: z.number().int().min(0).max(6).optional(),
  hora_cierre: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  visitantes_habilitados: z.boolean().optional(),
  puntos_oracion_compartidos: z.boolean().optional(),
  umbral_atencion: z.number().int().min(1).max(12).optional(),
  umbral_riesgo: z.number().int().min(1).max(24).optional(),
  umbral_critico: z.number().int().min(1).max(52).optional(),
  correo_semanal_habilitado: z.boolean().optional(),
  dia_envio_correo: z.number().int().min(0).max(6).optional(),
  hora_envio_correo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});
export type ConfigAsistencia = z.infer<typeof configAsistenciaSchema>;
