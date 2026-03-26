import type { z } from "zod";

// ─── Enums re-created as literal unions ──────────────────────────────

export type TipoSolicitud =
  | "ingreso"
  | "traslado"
  | "cambio_rol"
  | "egreso"
  | "activacion_grupo";

export type AccionSolicitud = "aprobar" | "rechazar";

// ─── Interfaces ──────────────────────────────────────────────────────

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
  /** Detalles enriquecidos del grupo */
  campus_nombre: string | null;
  lider_nombre: string | null;
  lider_apellido: string | null;
  director_nombre: string | null;
  director_apellido: string | null;
}

/** Resultado de crear solicitud via RPC */
export interface CrearSolicitudRpcResultado {
  ok: boolean;
  modo: "directo" | "solicitud";
  tipo?: string;
  solicitud_id?: string;
}

/** Resultado de procesar solicitud via RPC */
export interface ProcesarSolicitudRpcResultado {
  ok: boolean;
  modo: string;
  solicitud_id: string;
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

/** Solicitud completada con datos del aprobador */
export interface SolicitudCompletada extends SolicitudPendiente {
  aprobado_por_nombre: string | null;
  aprobado_por_apellido: string | null;
  notas_director: string | null;
  actualizado_en: string;
}

/** Solicitud propia con datos de relaciones */
export interface MiSolicitud {
  id: string;
  tipo: string;
  estado: string;
  grupo_id: string;
  motivo: string | null;
  notas_director: string | null;
  creado_en: string;
  actualizado_en: string;
  grupo_nombre: string | null;
  grupo_origen_nombre: string | null;
  usuario_nombre: string | null;
  usuario_apellido: string | null;
  /** Detalles enriquecidos del grupo (para solicitudes de activacion_grupo) */
  segmento_id: string | null;
  segmento_nombre: string | null;
  temporada_nombre: string | null;
  campus_nombre: string | null;
  lider_nombre: string | null;
  lider_apellido: string | null;
  director_nombre: string | null;
  director_apellido: string | null;
}
