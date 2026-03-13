/** Configuración del módulo de grupos de vida */
export interface ConfiguracionGruposVida {
  id: string;
  campus_id: string | null;
  dias_expiracion_solicitud: number;
  max_miembros_por_grupo: number | null;
  permitir_lider_en_otro_grupo: boolean;
  requiere_aprobacion_grupo_planificacion: boolean;
  notificar_lider_ingreso: boolean;
  creacion_grupos_habilitada: boolean;
  // Campos de asistencia avanzada (Fase 3)
  modo_cierre_asistencia: string;
  dia_cierre_semanal: number;
  hora_cierre: string;
  visitantes_habilitados: boolean;
  puntos_oracion_compartidos: boolean;
  umbral_atencion: number;
  umbral_riesgo: number;
  umbral_critico: number;
  correo_semanal_habilitado: boolean;
  dia_envio_correo: number;
  hora_envio_correo: string;
  creado_en: string;
  actualizado_en: string;
}
