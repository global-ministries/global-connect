export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      asistencia: {
        Row: {
          es_visitante: boolean | null
          evento_grupo_id: string
          fecha_registro: string
          id: string
          motivo_inasistencia: string | null
          motivo_tardanza: string | null
          motivo_tardanza_otro: string | null
          nota: string | null
          presente: boolean
          registrado_por_usuario_id: string | null
          tiempo_tardanza: number | null
          tipo_presencia: string | null
          usuario_id: string
          visitante_nombre: string | null
        }
        Insert: {
          es_visitante?: boolean | null
          evento_grupo_id: string
          fecha_registro?: string
          id?: string
          motivo_inasistencia?: string | null
          motivo_tardanza?: string | null
          motivo_tardanza_otro?: string | null
          nota?: string | null
          presente: boolean
          registrado_por_usuario_id?: string | null
          tiempo_tardanza?: number | null
          tipo_presencia?: string | null
          usuario_id: string
          visitante_nombre?: string | null
        }
        Update: {
          es_visitante?: boolean | null
          evento_grupo_id?: string
          fecha_registro?: string
          id?: string
          motivo_inasistencia?: string | null
          motivo_tardanza?: string | null
          motivo_tardanza_otro?: string | null
          nota?: string | null
          presente?: boolean
          registrado_por_usuario_id?: string | null
          tiempo_tardanza?: number | null
          tipo_presencia?: string | null
          usuario_id?: string
          visitante_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asistencia_evento_grupo_id_fkey"
            columns: ["evento_grupo_id"]
            isOneToOne: false
            referencedRelation: "eventos_grupo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_registrado_por_usuario_id_fkey"
            columns: ["registrado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_registrado_por_usuario_id_fkey"
            columns: ["registrado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "asistencia_registrado_por_usuario_id_fkey"
            columns: ["registrado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "asistencia_registrado_por_usuario_id_fkey"
            columns: ["registrado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "asistencia_registrado_por_usuario_id_fkey"
            columns: ["registrado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "asistencia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "asistencia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "asistencia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "asistencia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      audit_grupo_miembros: {
        Row: {
          action: string
          actor_auth_id: string | null
          actor_usuario_id: string | null
          grupo_id: string
          happened_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          usuario_id: string
        }
        Insert: {
          action: string
          actor_auth_id?: string | null
          actor_usuario_id?: string | null
          grupo_id: string
          happened_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          usuario_id: string
        }
        Update: {
          action?: string
          actor_auth_id?: string | null
          actor_usuario_id?: string | null
          grupo_id?: string
          happened_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          usuario_id?: string
        }
        Relationships: []
      }
      campus: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          estado_id: string | null
          id: string
          nombre: string
          pais_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          estado_id?: string | null
          id?: string
          nombre: string
          pais_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          estado_id?: string | null
          id?: string
          nombre?: string
          pais_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "estados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_pais_id_fkey"
            columns: ["pais_id"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_localidades: {
        Row: {
          activo: boolean
          campus_id: string
          created_at: string
          id: string
          municipio_id: string | null
          nombre: string
        }
        Insert: {
          activo?: boolean
          campus_id: string
          created_at?: string
          id?: string
          municipio_id?: string | null
          nombre: string
        }
        Update: {
          activo?: boolean
          campus_id?: string
          created_at?: string
          id?: string
          municipio_id?: string | null
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_localidades_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_localidades_municipio_id_fkey"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["id"]
          },
        ]
      }
      casa_anfitriona_audit_events: {
        Row: {
          actor_user_id: string | null
          casa_anfitriona_id: string | null
          created_at: string
          event_data: Json
          event_type: string
          grupo_id: string | null
          id: string
        }
        Insert: {
          actor_user_id?: string | null
          casa_anfitriona_id?: string | null
          created_at?: string
          event_data?: Json
          event_type: string
          grupo_id?: string | null
          id?: string
        }
        Update: {
          actor_user_id?: string | null
          casa_anfitriona_id?: string | null
          created_at?: string
          event_data?: Json
          event_type?: string
          grupo_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "casa_anfitriona_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casa_anfitriona_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_audit_events_casa_anfitriona_id_fkey"
            columns: ["casa_anfitriona_id"]
            isOneToOne: false
            referencedRelation: "casas_anfitrionas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casa_anfitriona_audit_events_casa_anfitriona_id_fkey"
            columns: ["casa_anfitriona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casa_anfitriona_audit_events_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casa_anfitriona_audit_events_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_audit_events_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
        ]
      }
      casa_anfitriona_location_reviews: {
        Row: {
          casa_anfitriona_id: string
          created_at: string
          decided_at: string | null
          decision_by_user_id: string | null
          decision_notes: string | null
          id: string
          proposed_direccion_id: string
          requested_by_user_id: string | null
          review_type: string
          status: string
          updated_at: string
        }
        Insert: {
          casa_anfitriona_id: string
          created_at?: string
          decided_at?: string | null
          decision_by_user_id?: string | null
          decision_notes?: string | null
          id?: string
          proposed_direccion_id: string
          requested_by_user_id?: string | null
          review_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          casa_anfitriona_id?: string
          created_at?: string
          decided_at?: string | null
          decision_by_user_id?: string | null
          decision_notes?: string | null
          id?: string
          proposed_direccion_id?: string
          requested_by_user_id?: string | null
          review_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "casa_anfitriona_location_reviews_casa_anfitriona_id_fkey"
            columns: ["casa_anfitriona_id"]
            isOneToOne: false
            referencedRelation: "casas_anfitrionas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_casa_anfitriona_id_fkey"
            columns: ["casa_anfitriona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_decision_by_user_id_fkey"
            columns: ["decision_by_user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_decision_by_user_id_fkey"
            columns: ["decision_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_decision_by_user_id_fkey"
            columns: ["decision_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_decision_by_user_id_fkey"
            columns: ["decision_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_decision_by_user_id_fkey"
            columns: ["decision_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_proposed_direccion_id_fkey"
            columns: ["proposed_direccion_id"]
            isOneToOne: false
            referencedRelation: "direcciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "casa_anfitriona_location_reviews_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      casas_anfitrionas: {
        Row: {
          activa: boolean
          actualizado_en: string
          aprobada: boolean
          aprobada_en: string | null
          aprobada_por: string | null
          capacidad_maxima: number | null
          co_anfitrion_id: string | null
          creado_en: string
          descripcion: string | null
          direccion_id: string | null
          disponibilidad: Json
          fotos_urls: string[]
          id: string
          nombre_lugar: string
          notas_privadas: string | null
          notas_publicas: string | null
          usuario_id: string
        }
        Insert: {
          activa?: boolean
          actualizado_en?: string
          aprobada?: boolean
          aprobada_en?: string | null
          aprobada_por?: string | null
          capacidad_maxima?: number | null
          co_anfitrion_id?: string | null
          creado_en?: string
          descripcion?: string | null
          direccion_id?: string | null
          disponibilidad?: Json
          fotos_urls?: string[]
          id?: string
          nombre_lugar: string
          notas_privadas?: string | null
          notas_publicas?: string | null
          usuario_id: string
        }
        Update: {
          activa?: boolean
          actualizado_en?: string
          aprobada?: boolean
          aprobada_en?: string | null
          aprobada_por?: string | null
          capacidad_maxima?: number | null
          co_anfitrion_id?: string | null
          creado_en?: string
          descripcion?: string | null
          direccion_id?: string | null
          disponibilidad?: Json
          fotos_urls?: string[]
          id?: string
          nombre_lugar?: string
          notas_privadas?: string | null
          notas_publicas?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "casas_anfitrionas_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_co_anfitrion_id_fkey"
            columns: ["co_anfitrion_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_co_anfitrion_id_fkey"
            columns: ["co_anfitrion_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_co_anfitrion_id_fkey"
            columns: ["co_anfitrion_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_co_anfitrion_id_fkey"
            columns: ["co_anfitrion_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_co_anfitrion_id_fkey"
            columns: ["co_anfitrion_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_direccion_id_fkey"
            columns: ["direccion_id"]
            isOneToOne: false
            referencedRelation: "direcciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "casas_anfitrionas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      configuracion_grupos_vida: {
        Row: {
          actualizado_en: string
          campus_id: string | null
          correo_semanal_habilitado: boolean | null
          creacion_grupos_habilitada: boolean
          creado_en: string
          dia_cierre_semanal: number | null
          dia_envio_correo: number | null
          dias_expiracion_solicitud: number
          hora_cierre: string | null
          hora_envio_correo: string | null
          id: string
          max_miembros_por_grupo: number | null
          modo_cierre_asistencia: string | null
          notificar_lider_ingreso: boolean
          permitir_lider_en_otro_grupo: boolean
          puntos_oracion_compartidos: boolean | null
          requiere_aprobacion_grupo_planificacion: boolean
          rol_minimo_eliminar_miembro: string
          umbral_atencion: number | null
          umbral_critico: number | null
          umbral_riesgo: number | null
          visitantes_habilitados: boolean | null
        }
        Insert: {
          actualizado_en?: string
          campus_id?: string | null
          correo_semanal_habilitado?: boolean | null
          creacion_grupos_habilitada?: boolean
          creado_en?: string
          dia_cierre_semanal?: number | null
          dia_envio_correo?: number | null
          dias_expiracion_solicitud?: number
          hora_cierre?: string | null
          hora_envio_correo?: string | null
          id?: string
          max_miembros_por_grupo?: number | null
          modo_cierre_asistencia?: string | null
          notificar_lider_ingreso?: boolean
          permitir_lider_en_otro_grupo?: boolean
          puntos_oracion_compartidos?: boolean | null
          requiere_aprobacion_grupo_planificacion?: boolean
          rol_minimo_eliminar_miembro?: string
          umbral_atencion?: number | null
          umbral_critico?: number | null
          umbral_riesgo?: number | null
          visitantes_habilitados?: boolean | null
        }
        Update: {
          actualizado_en?: string
          campus_id?: string | null
          correo_semanal_habilitado?: boolean | null
          creacion_grupos_habilitada?: boolean
          creado_en?: string
          dia_cierre_semanal?: number | null
          dia_envio_correo?: number | null
          dias_expiracion_solicitud?: number
          hora_cierre?: string | null
          hora_envio_correo?: string | null
          id?: string
          max_miembros_por_grupo?: number | null
          modo_cierre_asistencia?: string | null
          notificar_lider_ingreso?: boolean
          permitir_lider_en_otro_grupo?: boolean
          puntos_oracion_compartidos?: boolean | null
          requiere_aprobacion_grupo_planificacion?: boolean
          rol_minimo_eliminar_miembro?: string
          umbral_atencion?: number | null
          umbral_critico?: number | null
          umbral_riesgo?: number | null
          visitantes_habilitados?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_grupos_vida_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: true
            referencedRelation: "campus"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_plataforma: {
        Row: {
          actualizado_en: string | null
          color_primario: string | null
          color_secundario: string | null
          creado_en: string | null
          direccion: string | null
          email_contacto: string | null
          favicon_url: string | null
          id: string
          logo_dark_url: string | null
          logo_light_url: string | null
          nombre_organizacion: string | null
          telefono: string | null
        }
        Insert: {
          actualizado_en?: string | null
          color_primario?: string | null
          color_secundario?: string | null
          creado_en?: string | null
          direccion?: string | null
          email_contacto?: string | null
          favicon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          nombre_organizacion?: string | null
          telefono?: string | null
        }
        Update: {
          actualizado_en?: string | null
          color_primario?: string | null
          color_secundario?: string | null
          creado_en?: string | null
          direccion?: string | null
          email_contacto?: string | null
          favicon_url?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          nombre_organizacion?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      debug_toolbar_whitelist: {
        Row: {
          created_at: string
          id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debug_toolbar_whitelist_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debug_toolbar_whitelist_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "debug_toolbar_whitelist_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "debug_toolbar_whitelist_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "debug_toolbar_whitelist_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      dg_directores_etapa: {
        Row: {
          creado_en: string
          dg_usuario_id: string
          id: string
          segmento_lider_id: string
        }
        Insert: {
          creado_en?: string
          dg_usuario_id: string
          id?: string
          segmento_lider_id: string
        }
        Update: {
          creado_en?: string
          dg_usuario_id?: string
          id?: string
          segmento_lider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dg_directores_etapa_dg_usuario_id_fkey"
            columns: ["dg_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dg_directores_etapa_dg_usuario_id_fkey"
            columns: ["dg_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "dg_directores_etapa_dg_usuario_id_fkey"
            columns: ["dg_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "dg_directores_etapa_dg_usuario_id_fkey"
            columns: ["dg_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "dg_directores_etapa_dg_usuario_id_fkey"
            columns: ["dg_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "dg_directores_etapa_segmento_lider_id_fkey"
            columns: ["segmento_lider_id"]
            isOneToOne: false
            referencedRelation: "segmento_lideres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dg_directores_etapa_segmento_lider_id_fkey"
            columns: ["segmento_lider_id"]
            isOneToOne: false
            referencedRelation: "v_directores_etapa_segmento"
            referencedColumns: ["director_etapa_segmento_lider_id"]
          },
        ]
      }
      dias_excepcion: {
        Row: {
          creado_por_usuario_id: string | null
          fecha_creacion: string
          fecha_fin: string | null
          fecha_inicio: string
          global: boolean
          grupo_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          creado_por_usuario_id?: string | null
          fecha_creacion?: string
          fecha_fin?: string | null
          fecha_inicio: string
          global?: boolean
          grupo_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          creado_por_usuario_id?: string | null
          fecha_creacion?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          global?: boolean
          grupo_id?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "dias_excepcion_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dias_excepcion_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "dias_excepcion_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "dias_excepcion_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "dias_excepcion_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "dias_excepcion_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dias_excepcion_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "dias_excepcion_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
        ]
      }
      direcciones: {
        Row: {
          barrio: string | null
          calle: string
          codigo_postal: string | null
          id: string
          latitud: number | null
          longitud: number | null
          parroquia_id: string | null
          referencia: string | null
        }
        Insert: {
          barrio?: string | null
          calle: string
          codigo_postal?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          parroquia_id?: string | null
          referencia?: string | null
        }
        Update: {
          barrio?: string | null
          calle?: string
          codigo_postal?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          parroquia_id?: string | null
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direcciones_parroquia_id_fkey"
            columns: ["parroquia_id"]
            isOneToOne: false
            referencedRelation: "parroquias"
            referencedColumns: ["id"]
          },
        ]
      }
      director_etapa_grupos: {
        Row: {
          director_etapa_id: string
          grupo_id: string
          id: string
        }
        Insert: {
          director_etapa_id: string
          grupo_id: string
          id?: string
        }
        Update: {
          director_etapa_id?: string
          grupo_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_etapa_grupos_director_etapa_id_fkey"
            columns: ["director_etapa_id"]
            isOneToOne: false
            referencedRelation: "segmento_lideres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_etapa_grupos_director_etapa_id_fkey"
            columns: ["director_etapa_id"]
            isOneToOne: false
            referencedRelation: "v_directores_etapa_segmento"
            referencedColumns: ["director_etapa_segmento_lider_id"]
          },
          {
            foreignKeyName: "director_etapa_grupos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_etapa_grupos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "director_etapa_grupos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
        ]
      }
      director_etapa_ubicaciones: {
        Row: {
          director_etapa_id: string
          id: string
          segmento_ubicacion_id: string
        }
        Insert: {
          director_etapa_id: string
          id?: string
          segmento_ubicacion_id: string
        }
        Update: {
          director_etapa_id?: string
          id?: string
          segmento_ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_etapa_ubicaciones_director_etapa_id_fkey"
            columns: ["director_etapa_id"]
            isOneToOne: true
            referencedRelation: "segmento_lideres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_etapa_ubicaciones_director_etapa_id_fkey"
            columns: ["director_etapa_id"]
            isOneToOne: true
            referencedRelation: "v_directores_etapa_segmento"
            referencedColumns: ["director_etapa_segmento_lider_id"]
          },
          {
            foreignKeyName: "director_etapa_ubicaciones_segmento_ubicacion_id_fkey"
            columns: ["segmento_ubicacion_id"]
            isOneToOne: false
            referencedRelation: "segmento_ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      director_general_directores: {
        Row: {
          created_at: string
          director_etapa_id: string
          director_general_id: string
          id: string
        }
        Insert: {
          created_at?: string
          director_etapa_id: string
          director_general_id: string
          id?: string
        }
        Update: {
          created_at?: string
          director_etapa_id?: string
          director_general_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_general_directores_director_etapa_id_fkey"
            columns: ["director_etapa_id"]
            isOneToOne: false
            referencedRelation: "segmento_lideres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_general_directores_director_etapa_id_fkey"
            columns: ["director_etapa_id"]
            isOneToOne: false
            referencedRelation: "v_directores_etapa_segmento"
            referencedColumns: ["director_etapa_segmento_lider_id"]
          },
          {
            foreignKeyName: "director_general_directores_director_general_id_fkey"
            columns: ["director_general_id"]
            isOneToOne: false
            referencedRelation: "segmento_lideres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_general_directores_director_general_id_fkey"
            columns: ["director_general_id"]
            isOneToOne: false
            referencedRelation: "v_directores_etapa_segmento"
            referencedColumns: ["director_etapa_segmento_lider_id"]
          },
        ]
      }
      director_general_segmentos: {
        Row: {
          campus_id: string | null
          creado_en: string
          id: string
          segmento_id: string
          usuario_id: string
        }
        Insert: {
          campus_id?: string | null
          creado_en?: string
          id?: string
          segmento_id: string
          usuario_id: string
        }
        Update: {
          campus_id?: string | null
          creado_en?: string
          id?: string
          segmento_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_general_segmentos_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_general_segmentos_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_general_segmentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_general_segmentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "director_general_segmentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "director_general_segmentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "director_general_segmentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      disponibilidad_liderazgo: {
        Row: {
          actualizado_en: string
          dias_disponibles: string[]
          disponible_como_anfitrion: boolean
          disponible_como_lider: boolean
          disponible_como_voluntario: boolean
          horario_preferido: string | null
          id: string
          notas: string | null
          usuario_id: string
        }
        Insert: {
          actualizado_en?: string
          dias_disponibles?: string[]
          disponible_como_anfitrion?: boolean
          disponible_como_lider?: boolean
          disponible_como_voluntario?: boolean
          horario_preferido?: string | null
          id?: string
          notas?: string | null
          usuario_id: string
        }
        Update: {
          actualizado_en?: string
          dias_disponibles?: string[]
          disponible_como_anfitrion?: boolean
          disponible_como_lider?: boolean
          disponible_como_voluntario?: boolean
          horario_preferido?: string | null
          id?: string
          notas?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidad_liderazgo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_liderazgo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "disponibilidad_liderazgo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "disponibilidad_liderazgo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "disponibilidad_liderazgo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      dream_team_capability_grants: {
        Row: {
          capability_key: string
          experience: string
          granted_at: string
          id: string
          persona_id: string
          revoked_at: string | null
          scope_id: string | null
          scope_type: string
          source: string
        }
        Insert: {
          capability_key: string
          experience: string
          granted_at?: string
          id?: string
          persona_id: string
          revoked_at?: string | null
          scope_id?: string | null
          scope_type: string
          source?: string
        }
        Update: {
          capability_key?: string
          experience?: string
          granted_at?: string
          id?: string
          persona_id?: string
          revoked_at?: string | null
          scope_id?: string | null
          scope_type?: string
          source?: string
        }
        Relationships: []
      }
      dream_team_equipos: {
        Row: {
          activo: boolean
          created_at: string
          experiencia: string
          id: string
          label: string
          parent_equipo_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          experiencia: string
          id?: string
          label: string
          parent_equipo_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          experiencia?: string
          id?: string
          label?: string
          parent_equipo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_team_equipos_parent_equipo_id_fkey"
            columns: ["parent_equipo_id"]
            isOneToOne: false
            referencedRelation: "dream_team_equipos"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_team_estados_historial: {
        Row: {
          actor_persona_id: string
          detalle_motivo: string | null
          estado_anterior: Database["public"]["Enums"]["dream_team_estado"]
          estado_nuevo: Database["public"]["Enums"]["dream_team_estado"]
          fecha: string
          id: string
          motivo: Database["public"]["Enums"]["dream_team_transicion_motivo"]
          paused_grants_snapshot: Json | null
          servicio_id: string
        }
        Insert: {
          actor_persona_id: string
          detalle_motivo?: string | null
          estado_anterior: Database["public"]["Enums"]["dream_team_estado"]
          estado_nuevo: Database["public"]["Enums"]["dream_team_estado"]
          fecha?: string
          id?: string
          motivo: Database["public"]["Enums"]["dream_team_transicion_motivo"]
          paused_grants_snapshot?: Json | null
          servicio_id: string
        }
        Update: {
          actor_persona_id?: string
          detalle_motivo?: string | null
          estado_anterior?: Database["public"]["Enums"]["dream_team_estado"]
          estado_nuevo?: Database["public"]["Enums"]["dream_team_estado"]
          fecha?: string
          id?: string
          motivo?: Database["public"]["Enums"]["dream_team_transicion_motivo"]
          paused_grants_snapshot?: Json | null
          servicio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_team_estados_historial_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "dream_team_servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_team_participation_eventos: {
        Row: {
          fecha: string
          id: string
          payload: Json
          persona_id: string
          servicio_id: string
          tipo_evento: string
        }
        Insert: {
          fecha?: string
          id?: string
          payload?: Json
          persona_id: string
          servicio_id: string
          tipo_evento: string
        }
        Update: {
          fecha?: string
          id?: string
          payload?: Json
          persona_id?: string
          servicio_id?: string
          tipo_evento?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_team_participation_eventos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "dream_team_servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_team_requisitos: {
        Row: {
          codigo: string
          created_at: string
          equipo_id: string
          id: string
          label: string
          obligatoriedad: Database["public"]["Enums"]["dream_team_obligatoriedad"]
          rol_id: string
          tipo: Database["public"]["Enums"]["dream_team_requisito_tipo"]
        }
        Insert: {
          codigo: string
          created_at?: string
          equipo_id: string
          id?: string
          label: string
          obligatoriedad: Database["public"]["Enums"]["dream_team_obligatoriedad"]
          rol_id: string
          tipo: Database["public"]["Enums"]["dream_team_requisito_tipo"]
        }
        Update: {
          codigo?: string
          created_at?: string
          equipo_id?: string
          id?: string
          label?: string
          obligatoriedad?: Database["public"]["Enums"]["dream_team_obligatoriedad"]
          rol_id?: string
          tipo?: Database["public"]["Enums"]["dream_team_requisito_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "dream_team_requisitos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "dream_team_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_team_requisitos_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "dream_team_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_team_requisitos_verificacion: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["dream_team_requisito_estado"]
          fecha_vencimiento: string | null
          fecha_verificacion: string | null
          id: string
          requisito_id: string
          servicio_id: string
          updated_at: string
          verificado_por: string | null
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["dream_team_requisito_estado"]
          fecha_vencimiento?: string | null
          fecha_verificacion?: string | null
          id?: string
          requisito_id: string
          servicio_id: string
          updated_at?: string
          verificado_por?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["dream_team_requisito_estado"]
          fecha_vencimiento?: string | null
          fecha_verificacion?: string | null
          id?: string
          requisito_id?: string
          servicio_id?: string
          updated_at?: string
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dream_team_requisitos_verificacion_requisito_id_fkey"
            columns: ["requisito_id"]
            isOneToOne: false
            referencedRelation: "dream_team_requisitos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_team_requisitos_verificacion_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "dream_team_servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_team_roles: {
        Row: {
          activo: boolean
          created_at: string
          equipo_id: string
          id: string
          label: string
          parent_rol_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          equipo_id: string
          id?: string
          label: string
          parent_rol_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          equipo_id?: string
          id?: string
          label?: string
          parent_rol_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dream_team_roles_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "dream_team_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_team_roles_parent_rol_id_fkey"
            columns: ["parent_rol_id"]
            isOneToOne: false
            referencedRelation: "dream_team_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      dream_team_servicios: {
        Row: {
          created_at: string
          equipo_id: string
          estado: Database["public"]["Enums"]["dream_team_estado"]
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          motivo_actual: Database["public"]["Enums"]["dream_team_transicion_motivo"]
          persona_id: string
          rol_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          equipo_id: string
          estado?: Database["public"]["Enums"]["dream_team_estado"]
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          motivo_actual?: Database["public"]["Enums"]["dream_team_transicion_motivo"]
          persona_id: string
          rol_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          equipo_id?: string
          estado?: Database["public"]["Enums"]["dream_team_estado"]
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          motivo_actual?: Database["public"]["Enums"]["dream_team_transicion_motivo"]
          persona_id?: string
          rol_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "dream_team_servicios_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "dream_team_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dream_team_servicios_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "dream_team_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      estados: {
        Row: {
          id: string
          nombre: string
          pais_id: string
        }
        Insert: {
          id?: string
          nombre: string
          pais_id: string
        }
        Update: {
          id?: string
          nombre?: string
          pais_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estados_pais_id_fkey"
            columns: ["pais_id"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pais_id"
            columns: ["pais_id"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_grupo: {
        Row: {
          conteo_visitantes: number | null
          descripcion: string | null
          fecha: string
          grupo_id: string
          hora: string | null
          id: string
          motivo_no_reunion: string | null
          no_hubo_reunion: boolean | null
          notas: string | null
          notas_privadas_lider: string | null
          puntos_oracion: string | null
          registrado_en: string | null
          tema: string | null
          tipo: string | null
        }
        Insert: {
          conteo_visitantes?: number | null
          descripcion?: string | null
          fecha: string
          grupo_id: string
          hora?: string | null
          id?: string
          motivo_no_reunion?: string | null
          no_hubo_reunion?: boolean | null
          notas?: string | null
          notas_privadas_lider?: string | null
          puntos_oracion?: string | null
          registrado_en?: string | null
          tema?: string | null
          tipo?: string | null
        }
        Update: {
          conteo_visitantes?: number | null
          descripcion?: string | null
          fecha?: string
          grupo_id?: string
          hora?: string | null
          id?: string
          motivo_no_reunion?: string | null
          no_hubo_reunion?: boolean | null
          notas?: string | null
          notas_privadas_lider?: string | null
          puntos_oracion?: string | null
          registrado_en?: string | null
          tema?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "eventos_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
        ]
      }
      familias: {
        Row: {
          direccion_id: string | null
          id: string
          nombre: string | null
        }
        Insert: {
          direccion_id?: string | null
          id?: string
          nombre?: string | null
        }
        Update: {
          direccion_id?: string | null
          id?: string
          nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "familias_direccion_id_fkey"
            columns: ["direccion_id"]
            isOneToOne: false
            referencedRelation: "direcciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_direccion_familia_id"
            columns: ["direccion_id"]
            isOneToOne: false
            referencedRelation: "direcciones"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_miembros: {
        Row: {
          actualizado_en: string | null
          creado_en: string | null
          estado: string | null
          fecha_asignacion: string
          fecha_salida: string | null
          grupo_id: string
          id: string
          rol: Database["public"]["Enums"]["enum_rol_grupo"]
          usuario_id: string
        }
        Insert: {
          actualizado_en?: string | null
          creado_en?: string | null
          estado?: string | null
          fecha_asignacion?: string
          fecha_salida?: string | null
          grupo_id: string
          id?: string
          rol: Database["public"]["Enums"]["enum_rol_grupo"]
          usuario_id: string
        }
        Update: {
          actualizado_en?: string | null
          creado_en?: string | null
          estado?: string | null
          fecha_asignacion?: string
          fecha_salida?: string | null
          grupo_id?: string
          id?: string
          rol?: Database["public"]["Enums"]["enum_rol_grupo"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      grupos: {
        Row: {
          activo: boolean
          aprobado_en: string | null
          aprobado_por: string | null
          campus_id: string | null
          capacidad_maxima: number | null
          casa_anfitriona_id: string | null
          creado_por_usuario_id: string | null
          created_at: string | null
          dia_reunion: Database["public"]["Enums"]["enum_dia_semana"] | null
          direccion_anfitrion_id: string | null
          eliminado: boolean
          es_publico: boolean
          estado_aprobacion: string
          estado_ciclo: string
          fecha_creacion: string
          hora_reunion: string | null
          id: string
          localidad_id: string | null
          nombre: string
          notas_privadas: string | null
          segmento_id: string
          segmento_ubicacion_id: string | null
          temporada_id: string
          tipo_grupo_id: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          campus_id?: string | null
          capacidad_maxima?: number | null
          casa_anfitriona_id?: string | null
          creado_por_usuario_id?: string | null
          created_at?: string | null
          dia_reunion?: Database["public"]["Enums"]["enum_dia_semana"] | null
          direccion_anfitrion_id?: string | null
          eliminado?: boolean
          es_publico?: boolean
          estado_aprobacion?: string
          estado_ciclo?: string
          fecha_creacion?: string
          hora_reunion?: string | null
          id?: string
          localidad_id?: string | null
          nombre: string
          notas_privadas?: string | null
          segmento_id: string
          segmento_ubicacion_id?: string | null
          temporada_id: string
          tipo_grupo_id?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          campus_id?: string | null
          capacidad_maxima?: number | null
          casa_anfitriona_id?: string | null
          creado_por_usuario_id?: string | null
          created_at?: string | null
          dia_reunion?: Database["public"]["Enums"]["enum_dia_semana"] | null
          direccion_anfitrion_id?: string | null
          eliminado?: boolean
          es_publico?: boolean
          estado_aprobacion?: string
          estado_ciclo?: string
          fecha_creacion?: string
          hora_reunion?: string | null
          id?: string
          localidad_id?: string | null
          nombre?: string
          notas_privadas?: string | null
          segmento_id?: string
          segmento_ubicacion_id?: string | null
          temporada_id?: string
          tipo_grupo_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupos_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "grupos_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "grupos_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "grupos_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "grupos_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_casa_anfitriona_id_fkey"
            columns: ["casa_anfitriona_id"]
            isOneToOne: false
            referencedRelation: "casas_anfitrionas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_casa_anfitriona_id_fkey"
            columns: ["casa_anfitriona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "grupos_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "grupos_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "grupos_creado_por_usuario_id_fkey"
            columns: ["creado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "grupos_direccion_anfitrion_id_fkey"
            columns: ["direccion_anfitrion_id"]
            isOneToOne: false
            referencedRelation: "direcciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_localidad_id_fkey"
            columns: ["localidad_id"]
            isOneToOne: false
            referencedRelation: "campus_localidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_segmento_ubicacion_id_fkey"
            columns: ["segmento_ubicacion_id"]
            isOneToOne: false
            referencedRelation: "segmento_ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_temporada_id_fkey"
            columns: ["temporada_id"]
            isOneToOne: false
            referencedRelation: "temporadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_tipo_grupo_id_fkey"
            columns: ["tipo_grupo_id"]
            isOneToOne: false
            referencedRelation: "tipos_grupo"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_movimientos_grupo: {
        Row: {
          creado_en: string
          grupo_destino_id: string | null
          grupo_origen_id: string | null
          id: string
          motivo: string | null
          realizado_por: string | null
          rol_anterior: string | null
          rol_nuevo: string | null
          solicitud_id: string | null
          temporada_id: string | null
          tipo_movimiento: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          grupo_destino_id?: string | null
          grupo_origen_id?: string | null
          id?: string
          motivo?: string | null
          realizado_por?: string | null
          rol_anterior?: string | null
          rol_nuevo?: string | null
          solicitud_id?: string | null
          temporada_id?: string | null
          tipo_movimiento: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          grupo_destino_id?: string | null
          grupo_origen_id?: string | null
          id?: string
          motivo?: string | null
          realizado_por?: string | null
          rol_anterior?: string | null
          rol_nuevo?: string | null
          solicitud_id?: string | null
          temporada_id?: string | null
          tipo_movimiento?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historial_movimientos_grupo_grupo_destino_id_fkey"
            columns: ["grupo_destino_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_grupo_destino_id_fkey"
            columns: ["grupo_destino_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_grupo_destino_id_fkey"
            columns: ["grupo_destino_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_grupo_origen_id_fkey"
            columns: ["grupo_origen_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_grupo_origen_id_fkey"
            columns: ["grupo_origen_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_grupo_origen_id_fkey"
            columns: ["grupo_origen_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes_grupo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_temporada_id_fkey"
            columns: ["temporada_id"]
            isOneToOne: false
            referencedRelation: "temporadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      municipios: {
        Row: {
          estado_id: string
          id: string
          nombre: string
        }
        Insert: {
          estado_id: string
          id?: string
          nombre: string
        }
        Update: {
          estado_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_estado_id"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "estados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "municipios_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "estados"
            referencedColumns: ["id"]
          },
        ]
      }
      ocupaciones: {
        Row: {
          id: string
          nombre: string
        }
        Insert: {
          id?: string
          nombre: string
        }
        Update: {
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      operating_core_capacity_overrides: {
        Row: {
          capacity_base_snapshot: number
          capacity_operativa: number
          event_id: string
          reason: string
          set_at: string
          set_by_persona_id: string
        }
        Insert: {
          capacity_base_snapshot: number
          capacity_operativa: number
          event_id: string
          reason: string
          set_at?: string
          set_by_persona_id: string
        }
        Update: {
          capacity_base_snapshot?: number
          capacity_operativa?: number
          event_id?: string
          reason?: string
          set_at?: string
          set_by_persona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_core_capacity_overrides_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "operating_core_events"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_core_event_instances: {
        Row: {
          capacity_operativa: number
          created_at: string
          end_time: string
          estado: Database["public"]["Enums"]["operating_core_event_estado"]
          event_id: string
          horizon_days: number
          id: string
          instance_date: string
          lifecycle: Database["public"]["Enums"]["operating_core_instance_lifecycle"]
          metadata: Json
          recurrence_rule: Json | null
          start_time: string
          updated_at: string
        }
        Insert: {
          capacity_operativa?: number
          created_at?: string
          end_time: string
          estado?: Database["public"]["Enums"]["operating_core_event_estado"]
          event_id: string
          horizon_days?: number
          id?: string
          instance_date: string
          lifecycle?: Database["public"]["Enums"]["operating_core_instance_lifecycle"]
          metadata?: Json
          recurrence_rule?: Json | null
          start_time: string
          updated_at?: string
        }
        Update: {
          capacity_operativa?: number
          created_at?: string
          end_time?: string
          estado?: Database["public"]["Enums"]["operating_core_event_estado"]
          event_id?: string
          horizon_days?: number
          id?: string
          instance_date?: string
          lifecycle?: Database["public"]["Enums"]["operating_core_instance_lifecycle"]
          metadata?: Json
          recurrence_rule?: Json | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_core_event_instances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "operating_core_events"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_core_events: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["operating_core_event_estado"]
          id: string
          kind: Database["public"]["Enums"]["operating_core_event_kind"]
          metadata: Json
          parent_event_id: string | null
          recurrence_rule: Json | null
          responsible_dream_team_servicio_id: string | null
          service_id: string | null
          start_date: string
          title: string
          updated_at: string
          visibility_scope: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["operating_core_event_estado"]
          id?: string
          kind: Database["public"]["Enums"]["operating_core_event_kind"]
          metadata?: Json
          parent_event_id?: string | null
          recurrence_rule?: Json | null
          responsible_dream_team_servicio_id?: string | null
          service_id?: string | null
          start_date: string
          title: string
          updated_at?: string
          visibility_scope?: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["operating_core_event_estado"]
          id?: string
          kind?: Database["public"]["Enums"]["operating_core_event_kind"]
          metadata?: Json
          parent_event_id?: string | null
          recurrence_rule?: Json | null
          responsible_dream_team_servicio_id?: string | null
          service_id?: string | null
          start_date?: string
          title?: string
          updated_at?: string
          visibility_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_core_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "operating_core_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_core_events_responsible_dream_team_servicio_id_fkey"
            columns: ["responsible_dream_team_servicio_id"]
            isOneToOne: false
            referencedRelation: "dream_team_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_core_events_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "operating_core_services"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_core_form_submissions: {
        Row: {
          answers: Json
          form_id: string
          form_version_at_submission: number
          id: string
          submitted_at: string
          submitted_by_persona_id: string
        }
        Insert: {
          answers?: Json
          form_id: string
          form_version_at_submission: number
          id?: string
          submitted_at?: string
          submitted_by_persona_id: string
        }
        Update: {
          answers?: Json
          form_id?: string
          form_version_at_submission?: number
          id?: string
          submitted_at?: string
          submitted_by_persona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_core_form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "operating_core_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_core_forms: {
        Row: {
          created_at: string
          created_by_persona_id: string
          description: string | null
          fields: Json
          id: string
          lifecycle: Database["public"]["Enums"]["operating_core_form_lifecycle"]
          owner_experience_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by_persona_id: string
          description?: string | null
          fields?: Json
          id?: string
          lifecycle?: Database["public"]["Enums"]["operating_core_form_lifecycle"]
          owner_experience_id: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by_persona_id?: string
          description?: string | null
          fields?: Json
          id?: string
          lifecycle?: Database["public"]["Enums"]["operating_core_form_lifecycle"]
          owner_experience_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      operating_core_notification_outbox: {
        Row: {
          attempt_count: number
          available_at: string
          created_at: string
          dispatched_at: string | null
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["operating_core_notification_outbox_status"]
          subject_id: string | null
          target_address: string
          target_kind: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          dispatched_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["operating_core_notification_outbox_status"]
          subject_id?: string | null
          target_address: string
          target_kind: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          dispatched_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["operating_core_notification_outbox_status"]
          subject_id?: string | null
          target_address?: string
          target_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      operating_core_participation_eventos: {
        Row: {
          actor_persona_id: string
          capture_source: string
          corrects_event_id: string | null
          created_at: string
          event_id: string | null
          event_instance_id: string | null
          experience: string
          id: string
          kind: Database["public"]["Enums"]["operating_core_participation_kind"]
          metadata: Json
          occurred_at: string
          sensitivity: string
          service_id: string | null
          status: Database["public"]["Enums"]["operating_core_participation_status"]
          subject_id: string
        }
        Insert: {
          actor_persona_id: string
          capture_source: string
          corrects_event_id?: string | null
          created_at?: string
          event_id?: string | null
          event_instance_id?: string | null
          experience: string
          id?: string
          kind: Database["public"]["Enums"]["operating_core_participation_kind"]
          metadata?: Json
          occurred_at?: string
          sensitivity?: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["operating_core_participation_status"]
          subject_id: string
        }
        Update: {
          actor_persona_id?: string
          capture_source?: string
          corrects_event_id?: string | null
          created_at?: string
          event_id?: string | null
          event_instance_id?: string | null
          experience?: string
          id?: string
          kind?: Database["public"]["Enums"]["operating_core_participation_kind"]
          metadata?: Json
          occurred_at?: string
          sensitivity?: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["operating_core_participation_status"]
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_core_participation_eventos_corrects_event_id_fkey"
            columns: ["corrects_event_id"]
            isOneToOne: false
            referencedRelation: "operating_core_participation_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_core_participation_eventos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "operating_core_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_core_participation_eventos_event_instance_id_fkey"
            columns: ["event_instance_id"]
            isOneToOne: false
            referencedRelation: "operating_core_event_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_core_participation_eventos_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "operating_core_services"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_core_public_tokens: {
        Row: {
          captured_by_persona_id: string | null
          consumed_at: string | null
          consumed_by_persona_id: string | null
          created_at: string
          expires_at: string
          metadata: Json
          persona_id: string | null
          resource_id: string
          resource_type: string
          token_hash: string
        }
        Insert: {
          captured_by_persona_id?: string | null
          consumed_at?: string | null
          consumed_by_persona_id?: string | null
          created_at?: string
          expires_at: string
          metadata?: Json
          persona_id?: string | null
          resource_id: string
          resource_type: string
          token_hash: string
        }
        Update: {
          captured_by_persona_id?: string | null
          consumed_at?: string | null
          consumed_by_persona_id?: string | null
          created_at?: string
          expires_at?: string
          metadata?: Json
          persona_id?: string | null
          resource_id?: string
          resource_type?: string
          token_hash?: string
        }
        Relationships: []
      }
      operating_core_registrations: {
        Row: {
          captured_by_persona_id: string | null
          confirmation_mode: Database["public"]["Enums"]["operating_core_registration_confirmation_mode"]
          created_at: string
          estado: Database["public"]["Enums"]["operating_core_registration_estado"]
          event_id: string
          id: string
          persona_id: string
          reason: string | null
          updated_at: string
          version: number
          waitlist_position: number | null
        }
        Insert: {
          captured_by_persona_id?: string | null
          confirmation_mode?: Database["public"]["Enums"]["operating_core_registration_confirmation_mode"]
          created_at?: string
          estado?: Database["public"]["Enums"]["operating_core_registration_estado"]
          event_id: string
          id?: string
          persona_id: string
          reason?: string | null
          updated_at?: string
          version?: number
          waitlist_position?: number | null
        }
        Update: {
          captured_by_persona_id?: string | null
          confirmation_mode?: Database["public"]["Enums"]["operating_core_registration_confirmation_mode"]
          created_at?: string
          estado?: Database["public"]["Enums"]["operating_core_registration_estado"]
          event_id?: string
          id?: string
          persona_id?: string
          reason?: string | null
          updated_at?: string
          version?: number
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operating_core_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "operating_core_events"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_core_services: {
        Row: {
          capacity_base: number
          created_at: string
          estado: Database["public"]["Enums"]["operating_core_service_estado"]
          experiencia: string
          id: string
          kind: Database["public"]["Enums"]["operating_core_event_kind"]
          label: string
          metadata: Json
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          capacity_base?: number
          created_at?: string
          estado?: Database["public"]["Enums"]["operating_core_service_estado"]
          experiencia: string
          id?: string
          kind?: Database["public"]["Enums"]["operating_core_event_kind"]
          label: string
          metadata?: Json
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          capacity_base?: number
          created_at?: string
          estado?: Database["public"]["Enums"]["operating_core_service_estado"]
          experiencia?: string
          id?: string
          kind?: Database["public"]["Enums"]["operating_core_event_kind"]
          label?: string
          metadata?: Json
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
      operating_core_system_notifications: {
        Row: {
          body: string
          created_at: string
          expires_at: string
          id: string
          kind: string
          outbox_id: string | null
          persona_id: string
          read_at: string | null
          target_url: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          expires_at?: string
          id?: string
          kind: string
          outbox_id?: string | null
          persona_id: string
          read_at?: string | null
          target_url?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          outbox_id?: string | null
          persona_id?: string
          read_at?: string | null
          target_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_core_system_notifications_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "operating_core_notification_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      paises: {
        Row: {
          id: string
          nombre: string
        }
        Insert: {
          id?: string
          nombre: string
        }
        Update: {
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      parroquias: {
        Row: {
          id: string
          municipio_id: string
          nombre: string
        }
        Insert: {
          id?: string
          municipio_id: string
          nombre: string
        }
        Update: {
          id?: string
          municipio_id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_municipio_id"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parroquias_municipio_id_fkey"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["id"]
          },
        ]
      }
      pastoral_crisis_detection_log: {
        Row: {
          actor_persona_id: string
          categoria: string
          detected_at: string
          detected_at_minute: string
          id: string
          keyword: string
          one_on_one_id: string
          scan_nota_id: string | null
          scan_resumen: boolean
        }
        Insert: {
          actor_persona_id: string
          categoria: string
          detected_at?: string
          detected_at_minute: string
          id?: string
          keyword: string
          one_on_one_id: string
          scan_nota_id?: string | null
          scan_resumen?: boolean
        }
        Update: {
          actor_persona_id?: string
          categoria?: string
          detected_at?: string
          detected_at_minute?: string
          id?: string
          keyword?: string
          one_on_one_id?: string
          scan_nota_id?: string | null
          scan_resumen?: boolean
        }
        Relationships: []
      }
      pastoral_crisis_keyword_catalog: {
        Row: {
          activo: boolean
          categoria: string
          id: string
          termino: string
          version: number
        }
        Insert: {
          activo?: boolean
          categoria: string
          id?: string
          termino: string
          version?: number
        }
        Update: {
          activo?: boolean
          categoria?: string
          id?: string
          termino?: string
          version?: number
        }
        Relationships: []
      }
      pastoral_one_on_one: {
        Row: {
          autor_persona_id: string
          completed_at: string | null
          created_at: string
          estado: Database["public"]["Enums"]["pastoral_one_on_one_estado"]
          id: string
          mentor_oficial_persona_id: string
          motivo_cancelacion: string | null
          motivo_no_realizado: string | null
          resumen: string | null
          scheduled_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          autor_persona_id: string
          completed_at?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["pastoral_one_on_one_estado"]
          id?: string
          mentor_oficial_persona_id: string
          motivo_cancelacion?: string | null
          motivo_no_realizado?: string | null
          resumen?: string | null
          scheduled_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          autor_persona_id?: string
          completed_at?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["pastoral_one_on_one_estado"]
          id?: string
          mentor_oficial_persona_id?: string
          motivo_cancelacion?: string | null
          motivo_no_realizado?: string | null
          resumen?: string | null
          scheduled_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      pastoral_one_on_one_notas: {
        Row: {
          autor_persona_id: string
          contenido: string
          created_at: string
          id: string
          one_on_one_id: string
        }
        Insert: {
          autor_persona_id: string
          contenido: string
          created_at?: string
          id?: string
          one_on_one_id: string
        }
        Update: {
          autor_persona_id?: string
          contenido?: string
          created_at?: string
          id?: string
          one_on_one_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastoral_one_on_one_notas_one_on_one_id_fkey"
            columns: ["one_on_one_id"]
            isOneToOne: false
            referencedRelation: "pastoral_one_on_one"
            referencedColumns: ["id"]
          },
        ]
      }
      pastoral_one_on_one_participantes: {
        Row: {
          created_at: string
          id: string
          one_on_one_id: string
          persona_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          one_on_one_id: string
          persona_id: string
        }
        Update: {
          created_at?: string
          id?: string
          one_on_one_id?: string
          persona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastoral_one_on_one_participantes_one_on_one_id_fkey"
            columns: ["one_on_one_id"]
            isOneToOne: false
            referencedRelation: "pastoral_one_on_one"
            referencedColumns: ["id"]
          },
        ]
      }
      pastoral_role_capability_map: {
        Row: {
          capability_key: string
          rol: string
          scope_type: string
        }
        Insert: {
          capability_key: string
          rol: string
          scope_type: string
        }
        Update: {
          capability_key?: string
          rol?: string
          scope_type?: string
        }
        Relationships: []
      }
      pastoral_triada: {
        Row: {
          autor_persona_id: string
          contexto: Database["public"]["Enums"]["pastoral_triada_contexto"]
          created_at: string
          estado: Database["public"]["Enums"]["pastoral_triada_estado"]
          id: string
          mentor_oficial_persona_id: string
          motivo_disolucion:
            | Database["public"]["Enums"]["pastoral_triada_motivo_disolucion"]
            | null
          updated_at: string
          version: number
        }
        Insert: {
          autor_persona_id: string
          contexto: Database["public"]["Enums"]["pastoral_triada_contexto"]
          created_at?: string
          estado?: Database["public"]["Enums"]["pastoral_triada_estado"]
          id?: string
          mentor_oficial_persona_id: string
          motivo_disolucion?:
            | Database["public"]["Enums"]["pastoral_triada_motivo_disolucion"]
            | null
          updated_at?: string
          version?: number
        }
        Update: {
          autor_persona_id?: string
          contexto?: Database["public"]["Enums"]["pastoral_triada_contexto"]
          created_at?: string
          estado?: Database["public"]["Enums"]["pastoral_triada_estado"]
          id?: string
          mentor_oficial_persona_id?: string
          motivo_disolucion?:
            | Database["public"]["Enums"]["pastoral_triada_motivo_disolucion"]
            | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      pastoral_triada_eventos: {
        Row: {
          actor_persona_id: string
          created_at: string
          id: string
          payload: Json
          tipo_evento: Database["public"]["Enums"]["pastoral_triada_evento_tipo"]
          triada_id: string
        }
        Insert: {
          actor_persona_id: string
          created_at?: string
          id?: string
          payload?: Json
          tipo_evento: Database["public"]["Enums"]["pastoral_triada_evento_tipo"]
          triada_id: string
        }
        Update: {
          actor_persona_id?: string
          created_at?: string
          id?: string
          payload?: Json
          tipo_evento?: Database["public"]["Enums"]["pastoral_triada_evento_tipo"]
          triada_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastoral_triada_eventos_triada_id_fkey"
            columns: ["triada_id"]
            isOneToOne: false
            referencedRelation: "pastoral_triada"
            referencedColumns: ["id"]
          },
        ]
      }
      pastoral_triada_miembros: {
        Row: {
          created_at: string
          id: string
          persona_id: string
          rol_en_triada: string
          triada_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          persona_id: string
          rol_en_triada: string
          triada_id: string
        }
        Update: {
          created_at?: string
          id?: string
          persona_id?: string
          rol_en_triada?: string
          triada_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastoral_triada_miembros_triada_id_fkey"
            columns: ["triada_id"]
            isOneToOne: false
            referencedRelation: "pastoral_triada"
            referencedColumns: ["id"]
          },
        ]
      }
      profesiones: {
        Row: {
          id: string
          nombre: string
        }
        Insert: {
          id?: string
          nombre: string
        }
        Update: {
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      relaciones_usuarios: {
        Row: {
          es_principal: boolean | null
          id: string
          tipo_relacion: Database["public"]["Enums"]["enum_tipo_relacion"]
          usuario1_id: string
          usuario2_id: string
        }
        Insert: {
          es_principal?: boolean | null
          id?: string
          tipo_relacion: Database["public"]["Enums"]["enum_tipo_relacion"]
          usuario1_id: string
          usuario2_id: string
        }
        Update: {
          es_principal?: boolean | null
          id?: string
          tipo_relacion?: Database["public"]["Enums"]["enum_tipo_relacion"]
          usuario1_id?: string
          usuario2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_usuario1_id"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_usuario1_id"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "fk_usuario1_id"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "fk_usuario1_id"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "fk_usuario1_id"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "fk_usuario2_id"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_usuario2_id"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "fk_usuario2_id"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "fk_usuario2_id"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "fk_usuario2_id"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario1_id_fkey"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario1_id_fkey"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario1_id_fkey"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario1_id_fkey"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario1_id_fkey"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario2_id_fkey"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario2_id_fkey"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario2_id_fkey"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario2_id_fkey"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario2_id_fkey"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      roles_sistema: {
        Row: {
          id: string
          nombre_interno: string
          nombre_visible: string
        }
        Insert: {
          id?: string
          nombre_interno: string
          nombre_visible: string
        }
        Update: {
          id?: string
          nombre_interno?: string
          nombre_visible?: string
        }
        Relationships: []
      }
      segmento_lideres: {
        Row: {
          campus_id: string | null
          id: string
          segmento_id: string
          tipo_lider: Database["public"]["Enums"]["enum_tipo_lider"]
          usuario_id: string
        }
        Insert: {
          campus_id?: string | null
          id?: string
          segmento_id: string
          tipo_lider: Database["public"]["Enums"]["enum_tipo_lider"]
          usuario_id: string
        }
        Update: {
          campus_id?: string | null
          id?: string
          segmento_id?: string
          tipo_lider?: Database["public"]["Enums"]["enum_tipo_lider"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segmento_lideres_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmento_lideres_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      segmento_ubicaciones: {
        Row: {
          id: string
          nombre: string
          segmento_id: string
        }
        Insert: {
          id?: string
          nombre: string
          segmento_id: string
        }
        Update: {
          id?: string
          nombre?: string
          segmento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segmento_ubicaciones_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
        ]
      }
      segmentos: {
        Row: {
          campus_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          campus_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          campus_id?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "segmentos_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_grupo: {
        Row: {
          actualizado_en: string
          aprobado_por: string | null
          creado_en: string
          estado: string
          expira_en: string | null
          grupo_id: string
          grupo_origen_id: string | null
          id: string
          metadata_edicion: Json | null
          motivo: string | null
          notas_director: string | null
          rol_actual: string | null
          rol_solicitado: string | null
          solicitado_por: string
          temporada_id: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          actualizado_en?: string
          aprobado_por?: string | null
          creado_en?: string
          estado?: string
          expira_en?: string | null
          grupo_id: string
          grupo_origen_id?: string | null
          id?: string
          metadata_edicion?: Json | null
          motivo?: string | null
          notas_director?: string | null
          rol_actual?: string | null
          rol_solicitado?: string | null
          solicitado_por: string
          temporada_id?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          actualizado_en?: string
          aprobado_por?: string | null
          creado_en?: string
          estado?: string
          expira_en?: string | null
          grupo_id?: string
          grupo_origen_id?: string | null
          id?: string
          metadata_edicion?: Json | null
          motivo?: string | null
          notas_director?: string | null
          rol_actual?: string | null
          rol_solicitado?: string | null
          solicitado_por?: string
          temporada_id?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_grupo_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_origen_id_fkey"
            columns: ["grupo_origen_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_origen_id_fkey"
            columns: ["grupo_origen_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_origen_id_fkey"
            columns: ["grupo_origen_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_temporada_id_fkey"
            columns: ["temporada_id"]
            isOneToOne: false
            referencedRelation: "temporadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      support_event_outbox: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          event_key: string
          event_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          status: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          event_key: string
          event_type: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          status?: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          event_key?: string
          event_type?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          status?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_event_outbox_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_attachments: {
        Row: {
          bucket: string
          byte_size: number
          checksum_sha256: string | null
          content_type: string
          created_at: string
          id: string
          kind: string
          object_key: string
          original_filename: string
          rejection_reason: string | null
          retention_expires_at: string | null
          status: string
          ticket_id: string
          updated_at: string
          uploaded_by_usuario_id: string
        }
        Insert: {
          bucket?: string
          byte_size: number
          checksum_sha256?: string | null
          content_type: string
          created_at?: string
          id?: string
          kind: string
          object_key: string
          original_filename: string
          rejection_reason?: string | null
          retention_expires_at?: string | null
          status?: string
          ticket_id: string
          updated_at?: string
          uploaded_by_usuario_id: string
        }
        Update: {
          bucket?: string
          byte_size?: number
          checksum_sha256?: string | null
          content_type?: string
          created_at?: string
          id?: string
          kind?: string
          object_key?: string
          original_filename?: string
          rejection_reason?: string | null
          retention_expires_at?: string | null
          status?: string
          ticket_id?: string
          updated_at?: string
          uploaded_by_usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_uploaded_by_usuario_id_fkey"
            columns: ["uploaded_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_uploaded_by_usuario_id_fkey"
            columns: ["uploaded_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_uploaded_by_usuario_id_fkey"
            columns: ["uploaded_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_uploaded_by_usuario_id_fkey"
            columns: ["uploaded_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_uploaded_by_usuario_id_fkey"
            columns: ["uploaded_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      support_ticket_events: {
        Row: {
          action: string
          actor_usuario_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          metadata: Json
          target_id: string | null
          target_type: string
          ticket_id: string | null
        }
        Insert: {
          action: string
          actor_usuario_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          target_id?: string | null
          target_type: string
          ticket_id?: string | null
        }
        Update: {
          action?: string
          actor_usuario_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_actor_usuario_id_fkey"
            columns: ["actor_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_events_actor_usuario_id_fkey"
            columns: ["actor_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "support_ticket_events_actor_usuario_id_fkey"
            columns: ["actor_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "support_ticket_events_actor_usuario_id_fkey"
            columns: ["actor_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "support_ticket_events_actor_usuario_id_fkey"
            columns: ["actor_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_usuario_id: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_usuario_id: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_usuario_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_author_usuario_id_fkey"
            columns: ["author_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_author_usuario_id_fkey"
            columns: ["author_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "support_ticket_messages_author_usuario_id_fkey"
            columns: ["author_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "support_ticket_messages_author_usuario_id_fkey"
            columns: ["author_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "support_ticket_messages_author_usuario_id_fkey"
            columns: ["author_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          app_build_version: string | null
          assignee_usuario_id: string | null
          browser_name: string | null
          campus_id: string | null
          category: string
          closed_at: string | null
          created_at: string
          current_route: string | null
          description: string
          diagnostics_consent: boolean
          id: string
          os_name: string | null
          reporter_usuario_id: string
          search_vector: unknown
          sentry_event_id: string | null
          severity: string
          status: string
          ticket_number: number
          title: string
          updated_at: string
          viewport: string | null
        }
        Insert: {
          app_build_version?: string | null
          assignee_usuario_id?: string | null
          browser_name?: string | null
          campus_id?: string | null
          category: string
          closed_at?: string | null
          created_at?: string
          current_route?: string | null
          description: string
          diagnostics_consent?: boolean
          id?: string
          os_name?: string | null
          reporter_usuario_id: string
          search_vector?: unknown
          sentry_event_id?: string | null
          severity?: string
          status?: string
          ticket_number?: number
          title: string
          updated_at?: string
          viewport?: string | null
        }
        Update: {
          app_build_version?: string | null
          assignee_usuario_id?: string | null
          browser_name?: string | null
          campus_id?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          current_route?: string | null
          description?: string
          diagnostics_consent?: boolean
          id?: string
          os_name?: string | null
          reporter_usuario_id?: string
          search_vector?: unknown
          sentry_event_id?: string | null
          severity?: string
          status?: string
          ticket_number?: number
          title?: string
          updated_at?: string
          viewport?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assignee_usuario_id_fkey"
            columns: ["assignee_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_assignee_usuario_id_fkey"
            columns: ["assignee_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "support_tickets_assignee_usuario_id_fkey"
            columns: ["assignee_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "support_tickets_assignee_usuario_id_fkey"
            columns: ["assignee_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "support_tickets_assignee_usuario_id_fkey"
            columns: ["assignee_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "support_tickets_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_reporter_usuario_id_fkey"
            columns: ["reporter_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_reporter_usuario_id_fkey"
            columns: ["reporter_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "support_tickets_reporter_usuario_id_fkey"
            columns: ["reporter_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "support_tickets_reporter_usuario_id_fkey"
            columns: ["reporter_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "support_tickets_reporter_usuario_id_fkey"
            columns: ["reporter_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      support_user_capabilities: {
        Row: {
          capability: string
          granted_at: string
          granted_by_usuario_id: string | null
          id: string
          revoked_at: string | null
          usuario_id: string
        }
        Insert: {
          capability: string
          granted_at?: string
          granted_by_usuario_id?: string | null
          id?: string
          revoked_at?: string | null
          usuario_id: string
        }
        Update: {
          capability?: string
          granted_at?: string
          granted_by_usuario_id?: string | null
          id?: string
          revoked_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_user_capabilities_granted_by_usuario_id_fkey"
            columns: ["granted_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_user_capabilities_granted_by_usuario_id_fkey"
            columns: ["granted_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "support_user_capabilities_granted_by_usuario_id_fkey"
            columns: ["granted_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "support_user_capabilities_granted_by_usuario_id_fkey"
            columns: ["granted_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "support_user_capabilities_granted_by_usuario_id_fkey"
            columns: ["granted_by_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "support_user_capabilities_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_user_capabilities_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "support_user_capabilities_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "support_user_capabilities_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "support_user_capabilities_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      taller_asistencias: {
        Row: {
          correccion_de_asistencia_id: string | null
          created_at: string
          estado: string
          id: string
          inscripcion_id: string
          persona_id: string
          sesion_id: string
          updated_at: string
          version: number
        }
        Insert: {
          correccion_de_asistencia_id?: string | null
          created_at?: string
          estado: string
          id?: string
          inscripcion_id: string
          persona_id: string
          sesion_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          correccion_de_asistencia_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          inscripcion_id?: string
          persona_id?: string
          sesion_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_asistencias_correccion_de_asistencia_id_fkey"
            columns: ["correccion_de_asistencia_id"]
            isOneToOne: false
            referencedRelation: "taller_asistencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_asistencias_inscripcion_id_fkey"
            columns: ["inscripcion_id"]
            isOneToOne: false
            referencedRelation: "taller_inscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_asistencias_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_asistencias_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_asistencias_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_asistencias_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_asistencias_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "taller_asistencias_sesion_id_fkey"
            columns: ["sesion_id"]
            isOneToOne: false
            referencedRelation: "taller_sesiones"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_catalogo_etiquetas: {
        Row: {
          created_at: string
          etiqueta: string
          taller_id: string
        }
        Insert: {
          created_at?: string
          etiqueta: string
          taller_id: string
        }
        Update: {
          created_at?: string
          etiqueta?: string
          taller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taller_catalogo_etiquetas_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "taller_ediciones"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_certificados: {
        Row: {
          codigo_verificacion: string
          created_at: string
          fecha_completitud: string
          firmantes_snapshot: Json
          id: string
          inscripcion_id: string
          motivo_revocacion: string | null
          nombre_participante_snapshot: string
          nombre_taller_snapshot: string
          pdf_storage_path: string | null
          persona_id: string
          revocado_at: string | null
          taller_id: string
          version: number
        }
        Insert: {
          codigo_verificacion: string
          created_at?: string
          fecha_completitud?: string
          firmantes_snapshot?: Json
          id?: string
          inscripcion_id: string
          motivo_revocacion?: string | null
          nombre_participante_snapshot: string
          nombre_taller_snapshot: string
          pdf_storage_path?: string | null
          persona_id: string
          revocado_at?: string | null
          taller_id: string
          version?: number
        }
        Update: {
          codigo_verificacion?: string
          created_at?: string
          fecha_completitud?: string
          firmantes_snapshot?: Json
          id?: string
          inscripcion_id?: string
          motivo_revocacion?: string | null
          nombre_participante_snapshot?: string
          nombre_taller_snapshot?: string
          pdf_storage_path?: string | null
          persona_id?: string
          revocado_at?: string | null
          taller_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_certificados_inscripcion_id_fkey"
            columns: ["inscripcion_id"]
            isOneToOne: true
            referencedRelation: "taller_inscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_certificados_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_certificados_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_certificados_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_certificados_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_certificados_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "taller_certificados_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "taller_ediciones"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_ediciones: {
        Row: {
          created_at: string
          duracion_estimada_minutos_snapshot: number
          estado: string
          firmantes: Json
          id: string
          link_type: string | null
          modalidad_inscripcion: string
          modalidad_inscripcion_snapshot: string
          nombre_snapshot: string
          operating_core_event_id: string
          periodo_general_id: string | null
          recurrence_rule: Json | null
          sesiones_snapshot: number
          taller_id: string | null
          temporada_id: string | null
          tipo: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          duracion_estimada_minutos_snapshot: number
          estado: string
          firmantes?: Json
          id?: string
          link_type?: string | null
          modalidad_inscripcion: string
          modalidad_inscripcion_snapshot: string
          nombre_snapshot: string
          operating_core_event_id: string
          periodo_general_id?: string | null
          recurrence_rule?: Json | null
          sesiones_snapshot: number
          taller_id?: string | null
          temporada_id?: string | null
          tipo: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          duracion_estimada_minutos_snapshot?: number
          estado?: string
          firmantes?: Json
          id?: string
          link_type?: string | null
          modalidad_inscripcion?: string
          modalidad_inscripcion_snapshot?: string
          nombre_snapshot?: string
          operating_core_event_id?: string
          periodo_general_id?: string | null
          recurrence_rule?: Json | null
          sesiones_snapshot?: number
          taller_id?: string | null
          temporada_id?: string | null
          tipo?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_ediciones_operating_core_event_id_fkey"
            columns: ["operating_core_event_id"]
            isOneToOne: true
            referencedRelation: "operating_core_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_ediciones_periodo_general_id_fkey"
            columns: ["periodo_general_id"]
            isOneToOne: false
            referencedRelation: "taller_periodos_generales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_ediciones_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "talleres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_ediciones_temporada_id_fkey"
            columns: ["temporada_id"]
            isOneToOne: false
            referencedRelation: "talleres_temporadas"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_eventos: {
        Row: {
          actor_persona_id: string
          cohorte_id: string | null
          created_at: string
          emitted_to_outbox: boolean
          grupo_id: string | null
          id: string
          occurred_at: string
          payload: Json
          persona_id: string
          schema_version: string
          taller_id: string
          version: number
        }
        Insert: {
          actor_persona_id: string
          cohorte_id?: string | null
          created_at?: string
          emitted_to_outbox?: boolean
          grupo_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          persona_id: string
          schema_version: string
          taller_id: string
          version?: number
        }
        Update: {
          actor_persona_id?: string
          cohorte_id?: string | null
          created_at?: string
          emitted_to_outbox?: boolean
          grupo_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          persona_id?: string
          schema_version?: string
          taller_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_eventos_actor_persona_id_fkey"
            columns: ["actor_persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_eventos_actor_persona_id_fkey"
            columns: ["actor_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_eventos_actor_persona_id_fkey"
            columns: ["actor_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_eventos_actor_persona_id_fkey"
            columns: ["actor_persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_eventos_actor_persona_id_fkey"
            columns: ["actor_persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "taller_eventos_cohorte_id_fkey"
            columns: ["cohorte_id"]
            isOneToOne: false
            referencedRelation: "talleres_crecimiento_cohortes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_eventos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "taller_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_eventos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_eventos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_eventos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_eventos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_eventos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "taller_eventos_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "taller_ediciones"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_grupo_asignaciones: {
        Row: {
          activo: boolean
          approved_by_director_id: string | null
          created_at: string
          ended_at: string | null
          grupo_id: string
          id: string
          motivo_retiro: string | null
          persona_id: string
          rol: string
          started_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          activo?: boolean
          approved_by_director_id?: string | null
          created_at?: string
          ended_at?: string | null
          grupo_id: string
          id?: string
          motivo_retiro?: string | null
          persona_id: string
          rol: string
          started_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          activo?: boolean
          approved_by_director_id?: string | null
          created_at?: string
          ended_at?: string | null
          grupo_id?: string
          id?: string
          motivo_retiro?: string | null
          persona_id?: string
          rol?: string
          started_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_grupo_asignaciones_approved_by_director_id_fkey"
            columns: ["approved_by_director_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_approved_by_director_id_fkey"
            columns: ["approved_by_director_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_approved_by_director_id_fkey"
            columns: ["approved_by_director_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_approved_by_director_id_fkey"
            columns: ["approved_by_director_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_approved_by_director_id_fkey"
            columns: ["approved_by_director_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "taller_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_grupo_asignaciones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      taller_grupos: {
        Row: {
          capacidad: number
          cohorte_id: string
          completed_at: string | null
          created_at: string
          estado: string
          id: string
          nombre: string
          recursos_snapshot: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          capacidad: number
          cohorte_id: string
          completed_at?: string | null
          created_at?: string
          estado: string
          id?: string
          nombre: string
          recursos_snapshot?: Json | null
          updated_at?: string
          version?: number
        }
        Update: {
          capacidad?: number
          cohorte_id?: string
          completed_at?: string | null
          created_at?: string
          estado?: string
          id?: string
          nombre?: string
          recursos_snapshot?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_grupos_cohorte_id_fkey"
            columns: ["cohorte_id"]
            isOneToOne: false
            referencedRelation: "talleres_crecimiento_cohortes"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_inscripciones: {
        Row: {
          cohorte_id: string
          companero_id: string | null
          created_at: string
          estado: string
          id: string
          link_type: string | null
          motivo_no_aprobado: string | null
          ocurrencia_objetivo: string | null
          persona_principal_id: string
          taller_id: string
          unit_estado: string | null
          unit_estado_report_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          cohorte_id: string
          companero_id?: string | null
          created_at?: string
          estado: string
          id?: string
          link_type?: string | null
          motivo_no_aprobado?: string | null
          ocurrencia_objetivo?: string | null
          persona_principal_id: string
          taller_id: string
          unit_estado?: string | null
          unit_estado_report_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          cohorte_id?: string
          companero_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          link_type?: string | null
          motivo_no_aprobado?: string | null
          ocurrencia_objetivo?: string | null
          persona_principal_id?: string
          taller_id?: string
          unit_estado?: string | null
          unit_estado_report_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_inscripciones_cohorte_id_fkey"
            columns: ["cohorte_id"]
            isOneToOne: false
            referencedRelation: "talleres_crecimiento_cohortes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_inscripciones_companero_id_fkey"
            columns: ["companero_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_inscripciones_companero_id_fkey"
            columns: ["companero_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_inscripciones_companero_id_fkey"
            columns: ["companero_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_inscripciones_companero_id_fkey"
            columns: ["companero_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_inscripciones_companero_id_fkey"
            columns: ["companero_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "taller_inscripciones_persona_principal_id_fkey"
            columns: ["persona_principal_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_inscripciones_persona_principal_id_fkey"
            columns: ["persona_principal_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_inscripciones_persona_principal_id_fkey"
            columns: ["persona_principal_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_inscripciones_persona_principal_id_fkey"
            columns: ["persona_principal_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_inscripciones_persona_principal_id_fkey"
            columns: ["persona_principal_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "taller_inscripciones_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "taller_ediciones"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_periodos_generales: {
        Row: {
          created_at: string
          edicion_label: string
          fecha_apertura_automatica: string | null
          fecha_apertura_manual: string | null
          fecha_cierre_automatico: string | null
          fecha_cierre_manual: string | null
          fecha_cierre_real: string | null
          id: string
          motivo_cierre: string | null
          taller_id: string
          version: number
        }
        Insert: {
          created_at?: string
          edicion_label: string
          fecha_apertura_automatica?: string | null
          fecha_apertura_manual?: string | null
          fecha_cierre_automatico?: string | null
          fecha_cierre_manual?: string | null
          fecha_cierre_real?: string | null
          id?: string
          motivo_cierre?: string | null
          taller_id: string
          version?: number
        }
        Update: {
          created_at?: string
          edicion_label?: string
          fecha_apertura_automatica?: string | null
          fecha_apertura_manual?: string | null
          fecha_cierre_automatico?: string | null
          fecha_cierre_manual?: string | null
          fecha_cierre_real?: string | null
          id?: string
          motivo_cierre?: string | null
          taller_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_periodos_generales_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "taller_ediciones"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_reporte_correcciones: {
        Row: {
          autor_persona_id: string
          contenido_anterior: Json
          contenido_nuevo: Json
          created_at: string
          id: string
          motivo: string
          reporte_id: string
        }
        Insert: {
          autor_persona_id: string
          contenido_anterior: Json
          contenido_nuevo: Json
          created_at?: string
          id?: string
          motivo: string
          reporte_id: string
        }
        Update: {
          autor_persona_id?: string
          contenido_anterior?: Json
          contenido_nuevo?: Json
          created_at?: string
          id?: string
          motivo?: string
          reporte_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taller_reporte_correcciones_autor_persona_id_fkey"
            columns: ["autor_persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_reporte_correcciones_autor_persona_id_fkey"
            columns: ["autor_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_reporte_correcciones_autor_persona_id_fkey"
            columns: ["autor_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_reporte_correcciones_autor_persona_id_fkey"
            columns: ["autor_persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_reporte_correcciones_autor_persona_id_fkey"
            columns: ["autor_persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "taller_reporte_correcciones_reporte_id_fkey"
            columns: ["reporte_id"]
            isOneToOne: false
            referencedRelation: "taller_reportes"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_reportes: {
        Row: {
          created_at: string
          estado: string
          firma_lider_fecha: string | null
          firma_lider_persona_id: string | null
          grupo_id: string
          id: string
          observaciones_generales: string
          reabierto_motivo: string | null
          reabierto_por_persona_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          estado: string
          firma_lider_fecha?: string | null
          firma_lider_persona_id?: string | null
          grupo_id: string
          id?: string
          observaciones_generales: string
          reabierto_motivo?: string | null
          reabierto_por_persona_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          estado?: string
          firma_lider_fecha?: string | null
          firma_lider_persona_id?: string | null
          grupo_id?: string
          id?: string
          observaciones_generales?: string
          reabierto_motivo?: string | null
          reabierto_por_persona_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_reportes_firma_lider_persona_id_fkey"
            columns: ["firma_lider_persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_reportes_firma_lider_persona_id_fkey"
            columns: ["firma_lider_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_reportes_firma_lider_persona_id_fkey"
            columns: ["firma_lider_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_reportes_firma_lider_persona_id_fkey"
            columns: ["firma_lider_persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_reportes_firma_lider_persona_id_fkey"
            columns: ["firma_lider_persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "taller_reportes_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "taller_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_reportes_reabierto_por_persona_id_fkey"
            columns: ["reabierto_por_persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_reportes_reabierto_por_persona_id_fkey"
            columns: ["reabierto_por_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_reportes_reabierto_por_persona_id_fkey"
            columns: ["reabierto_por_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_reportes_reabierto_por_persona_id_fkey"
            columns: ["reabierto_por_persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_reportes_reabierto_por_persona_id_fkey"
            columns: ["reabierto_por_persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      taller_sesiones: {
        Row: {
          created_at: string
          estado: string
          fecha_programada: string
          fecha_realizada: string | null
          grupo_id: string
          id: string
          meeting_time_applies_to: string | null
          meeting_time_override: string | null
          numero: number
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha_programada: string
          fecha_realizada?: string | null
          grupo_id: string
          id?: string
          meeting_time_applies_to?: string | null
          meeting_time_override?: string | null
          numero: number
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          estado?: string
          fecha_programada?: string
          fecha_realizada?: string | null
          grupo_id?: string
          id?: string
          meeting_time_applies_to?: string | null
          meeting_time_override?: string | null
          numero?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_sesiones_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "taller_grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_solicitudes_retiro: {
        Row: {
          created_at: string
          estado: string
          grupo_asignacion_id: string | null
          id: string
          inscripcion_id: string | null
          motivo: string
          solicitante_persona_id: string
          tipo: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          estado: string
          grupo_asignacion_id?: string | null
          id?: string
          inscripcion_id?: string | null
          motivo: string
          solicitante_persona_id: string
          tipo: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          estado?: string
          grupo_asignacion_id?: string | null
          id?: string
          inscripcion_id?: string | null
          motivo?: string
          solicitante_persona_id?: string
          tipo?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taller_solicitudes_retiro_grupo_asignacion_id_fkey"
            columns: ["grupo_asignacion_id"]
            isOneToOne: false
            referencedRelation: "taller_grupo_asignaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_solicitudes_retiro_inscripcion_id_fkey"
            columns: ["inscripcion_id"]
            isOneToOne: false
            referencedRelation: "taller_inscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_solicitudes_retiro_solicitante_persona_id_fkey"
            columns: ["solicitante_persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_solicitudes_retiro_solicitante_persona_id_fkey"
            columns: ["solicitante_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "taller_solicitudes_retiro_solicitante_persona_id_fkey"
            columns: ["solicitante_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "taller_solicitudes_retiro_solicitante_persona_id_fkey"
            columns: ["solicitante_persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "taller_solicitudes_retiro_solicitante_persona_id_fkey"
            columns: ["solicitante_persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      talleres: {
        Row: {
          created_at: string
          created_by_persona_id: string | null
          descripcion: string | null
          dream_team_equipo_id: string | null
          estado: string
          id: string
          modalidad_default: string
          nombre: string
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by_persona_id?: string | null
          descripcion?: string | null
          dream_team_equipo_id?: string | null
          estado?: string
          id?: string
          modalidad_default?: string
          nombre: string
          slug: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by_persona_id?: string | null
          descripcion?: string | null
          dream_team_equipo_id?: string | null
          estado?: string
          id?: string
          modalidad_default?: string
          nombre?: string
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "talleres_created_by_persona_id_fkey"
            columns: ["created_by_persona_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talleres_created_by_persona_id_fkey"
            columns: ["created_by_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "talleres_created_by_persona_id_fkey"
            columns: ["created_by_persona_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "talleres_created_by_persona_id_fkey"
            columns: ["created_by_persona_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "talleres_created_by_persona_id_fkey"
            columns: ["created_by_persona_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "talleres_dream_team_equipo_id_fkey"
            columns: ["dream_team_equipo_id"]
            isOneToOne: true
            referencedRelation: "dream_team_equipos"
            referencedColumns: ["id"]
          },
        ]
      }
      talleres_crecimiento_cohortes: {
        Row: {
          created_at: string
          dream_team_equipo_id: string
          edicion: string
          ended_at: string | null
          id: string
          started_at: string | null
          taller_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          dream_team_equipo_id: string
          edicion: string
          ended_at?: string | null
          id?: string
          started_at?: string | null
          taller_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          dream_team_equipo_id?: string
          edicion?: string
          ended_at?: string | null
          id?: string
          started_at?: string | null
          taller_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "talleres_crecimiento_cohortes_dream_team_equipo_id_fkey"
            columns: ["dream_team_equipo_id"]
            isOneToOne: false
            referencedRelation: "dream_team_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talleres_crecimiento_cohortes_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "taller_ediciones"
            referencedColumns: ["id"]
          },
        ]
      }
      talleres_role_capability_map: {
        Row: {
          capability_key: string
          rol: string
          scope_type: string
        }
        Insert: {
          capability_key: string
          rol: string
          scope_type: string
        }
        Update: {
          capability_key?: string
          rol?: string
          scope_type?: string
        }
        Relationships: []
      }
      talleres_temporada_talleres: {
        Row: {
          created_at: string
          id: string
          taller_id: string
          temporada_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          taller_id: string
          temporada_id: string
        }
        Update: {
          created_at?: string
          id?: string
          taller_id?: string
          temporada_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talleres_temporada_talleres_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "talleres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talleres_temporada_talleres_temporada_id_fkey"
            columns: ["temporada_id"]
            isOneToOne: false
            referencedRelation: "talleres_temporadas"
            referencedColumns: ["id"]
          },
        ]
      }
      talleres_temporadas: {
        Row: {
          created_at: string
          created_by_persona_id: string | null
          descripcion: string | null
          estado: string
          fecha_apertura: string
          fecha_cierre: string
          id: string
          nombre: string
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by_persona_id?: string | null
          descripcion?: string | null
          estado?: string
          fecha_apertura: string
          fecha_cierre: string
          id?: string
          nombre: string
          slug: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by_persona_id?: string | null
          descripcion?: string | null
          estado?: string
          fecha_apertura?: string
          fecha_cierre?: string
          id?: string
          nombre?: string
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      temporadas: {
        Row: {
          activa: boolean
          estado: string
          fecha_fin: string
          fecha_inicio: string
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          estado?: string
          fecha_fin: string
          fecha_inicio: string
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          estado?: string
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      tipos_grupo: {
        Row: {
          activo: boolean
          actualizado_en: string
          campus_id: string | null
          color_hex: string | null
          creado_en: string
          descripcion: string | null
          es_confidencial: boolean
          icono: string | null
          id: string
          nombre: string
          requiere_aprobacion_ingreso: boolean
          requiere_ruta_previa: boolean
          slug: string
          usa_casa_anfitriona: boolean
          usa_grupos_matrimonio: boolean
          usa_temporadas: boolean
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          campus_id?: string | null
          color_hex?: string | null
          creado_en?: string
          descripcion?: string | null
          es_confidencial?: boolean
          icono?: string | null
          id?: string
          nombre: string
          requiere_aprobacion_ingreso?: boolean
          requiere_ruta_previa?: boolean
          slug: string
          usa_casa_anfitriona?: boolean
          usa_grupos_matrimonio?: boolean
          usa_temporadas?: boolean
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          campus_id?: string | null
          color_hex?: string | null
          creado_en?: string
          descripcion?: string | null
          es_confidencial?: boolean
          icono?: string | null
          id?: string
          nombre?: string
          requiere_aprobacion_ingreso?: boolean
          requiere_ruta_previa?: boolean
          slug?: string
          usa_casa_anfitriona?: boolean
          usa_grupos_matrimonio?: boolean
          usa_temporadas?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tipos_grupo_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus"
            referencedColumns: ["id"]
          },
        ]
      }
      uno_a_uno_participantes: {
        Row: {
          id: string
          miembro_usuario_id: string
          reunion_id: string
        }
        Insert: {
          id?: string
          miembro_usuario_id: string
          reunion_id: string
        }
        Update: {
          id?: string
          miembro_usuario_id?: string
          reunion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uno_a_uno_participantes_miembro_usuario_id_fkey"
            columns: ["miembro_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uno_a_uno_participantes_miembro_usuario_id_fkey"
            columns: ["miembro_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "uno_a_uno_participantes_miembro_usuario_id_fkey"
            columns: ["miembro_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "uno_a_uno_participantes_miembro_usuario_id_fkey"
            columns: ["miembro_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "uno_a_uno_participantes_miembro_usuario_id_fkey"
            columns: ["miembro_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "uno_a_uno_participantes_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "uno_a_uno_reuniones"
            referencedColumns: ["id"]
          },
        ]
      }
      uno_a_uno_reuniones: {
        Row: {
          fecha: string
          fecha_registro: string
          grupo_id: string
          hora: string | null
          id: string
          lider_usuario_id: string
          notas_privadas: string | null
        }
        Insert: {
          fecha: string
          fecha_registro?: string
          grupo_id: string
          hora?: string | null
          id?: string
          lider_usuario_id: string
          notas_privadas?: string | null
        }
        Update: {
          fecha?: string
          fecha_registro?: string
          grupo_id?: string
          hora?: string | null
          id?: string
          lider_usuario_id?: string
          notas_privadas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uno_a_uno_reuniones_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uno_a_uno_reuniones_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "uno_a_uno_reuniones_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uno_a_uno_reuniones_lider_usuario_id_fkey"
            columns: ["lider_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uno_a_uno_reuniones_lider_usuario_id_fkey"
            columns: ["lider_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "uno_a_uno_reuniones_lider_usuario_id_fkey"
            columns: ["lider_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "uno_a_uno_reuniones_lider_usuario_id_fkey"
            columns: ["lider_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "uno_a_uno_reuniones_lider_usuario_id_fkey"
            columns: ["lider_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      usuario_campus: {
        Row: {
          campus_id: string
          created_at: string
          es_campus_principal: boolean
          id: string
          usuario_id: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          es_campus_principal?: boolean
          id?: string
          usuario_id: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          es_campus_principal?: boolean
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_campus_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_campus_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_campus_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "usuario_campus_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "usuario_campus_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "usuario_campus_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      usuario_roles: {
        Row: {
          id: string
          rol_id: string
          usuario_id: string
        }
        Insert: {
          id?: string
          rol_id: string
          usuario_id: string
        }
        Update: {
          id?: string
          rol_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_usuario_roles_rol_id"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles_sistema"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_usuario_roles_usuario_id"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_usuario_roles_usuario_id"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "fk_usuario_roles_usuario_id"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "fk_usuario_roles_usuario_id"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "fk_usuario_roles_usuario_id"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
          {
            foreignKeyName: "usuario_roles_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles_sistema"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_roles_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_roles_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "usuario_roles_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "usuario_roles_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "usuario_roles_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      usuarios: {
        Row: {
          apellido: string
          auth_id: string | null
          cedula: string | null
          direccion_id: string | null
          email: string | null
          estado_civil: Database["public"]["Enums"]["enum_estado_civil"]
          familia_id: string | null
          fecha_nacimiento: string | null
          fecha_registro: string
          foto_perfil_url: string | null
          genero: Database["public"]["Enums"]["enum_genero"]
          id: string
          nombre: string
          ocupacion_id: string | null
          profesion_id: string | null
          telefono: string | null
        }
        Insert: {
          apellido: string
          auth_id?: string | null
          cedula?: string | null
          direccion_id?: string | null
          email?: string | null
          estado_civil: Database["public"]["Enums"]["enum_estado_civil"]
          familia_id?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string
          foto_perfil_url?: string | null
          genero: Database["public"]["Enums"]["enum_genero"]
          id?: string
          nombre: string
          ocupacion_id?: string | null
          profesion_id?: string | null
          telefono?: string | null
        }
        Update: {
          apellido?: string
          auth_id?: string | null
          cedula?: string | null
          direccion_id?: string | null
          email?: string | null
          estado_civil?: Database["public"]["Enums"]["enum_estado_civil"]
          familia_id?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string
          foto_perfil_url?: string | null
          genero?: Database["public"]["Enums"]["enum_genero"]
          id?: string
          nombre?: string
          ocupacion_id?: string | null
          profesion_id?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_direccion_id"
            columns: ["direccion_id"]
            isOneToOne: false
            referencedRelation: "direcciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_familia_id"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ocupacion_id"
            columns: ["ocupacion_id"]
            isOneToOne: false
            referencedRelation: "ocupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_profesion_id"
            columns: ["profesion_id"]
            isOneToOne: false
            referencedRelation: "profesiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_direccion_id_fkey"
            columns: ["direccion_id"]
            isOneToOne: false
            referencedRelation: "direcciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_ocupacion_id_fkey"
            columns: ["ocupacion_id"]
            isOneToOne: false
            referencedRelation: "ocupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_profesion_id_fkey"
            columns: ["profesion_id"]
            isOneToOne: false
            referencedRelation: "profesiones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_casas_anfitrionas_disponibles: {
        Row: {
          anfitrion_foto: string | null
          anfitrion_id: string | null
          anfitrion_nombre: string | null
          barrio: string | null
          calle: string | null
          capacidad_maxima: number | null
          co_anfitrion_foto: string | null
          co_anfitrion_id: string | null
          co_anfitrion_nombre: string | null
          disponibilidad: Json | null
          fotos_urls: string[] | null
          grupos_usando: number | null
          id: string | null
          latitud: number | null
          longitud: number | null
          nombre_lugar: string | null
        }
        Relationships: []
      }
      v_directores_etapa_segmento: {
        Row: {
          apellido: string | null
          ciudades: string[] | null
          director_etapa_segmento_lider_id: string | null
          nombre: string | null
          segmento_id: string | null
          usuario_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segmento_lideres_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      v_grupos_supervisiones: {
        Row: {
          created_at: string | null
          director_etapa_id: string | null
          director_etapa_usuario_id: string | null
          estado_aprobacion: string | null
          grupo_id: string | null
          lider_usuario_id: string | null
          segmento_id: string | null
          temporada_id: string | null
          total_miembros: number | null
        }
        Relationships: [
          {
            foreignKeyName: "director_etapa_grupos_director_etapa_id_fkey"
            columns: ["director_etapa_id"]
            isOneToOne: false
            referencedRelation: "segmento_lideres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_etapa_grupos_director_etapa_id_fkey"
            columns: ["director_etapa_id"]
            isOneToOne: false
            referencedRelation: "v_directores_etapa_segmento"
            referencedColumns: ["director_etapa_segmento_lider_id"]
          },
          {
            foreignKeyName: "grupos_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_temporada_id_fkey"
            columns: ["temporada_id"]
            isOneToOne: false
            referencedRelation: "temporadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["director_etapa_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["director_etapa_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["director_etapa_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["director_etapa_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "segmento_lideres_usuario_id_fkey"
            columns: ["director_etapa_usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      v_historial_miembro: {
        Row: {
          creado_en: string | null
          grupo_destino: string | null
          grupo_origen: string | null
          id: string | null
          motivo: string | null
          realizado_por_apellido: string | null
          realizado_por_nombre: string | null
          rol_anterior: string | null
          rol_nuevo: string | null
          temporada: string | null
          tipo_movimiento: string | null
          usuario_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "historial_movimientos_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      v_lideres_con_pareja: {
        Row: {
          apellido: string | null
          estado_civil: Database["public"]["Enums"]["enum_estado_civil"] | null
          fecha_asignacion: string | null
          foto_perfil_url: string | null
          grupo_id: string | null
          nombre: string | null
          pareja_apellido: string | null
          pareja_en_grupo: boolean | null
          pareja_id: string | null
          pareja_nombre: string | null
          rol: Database["public"]["Enums"]["enum_rol_grupo"] | null
          usuario_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      v_mapa_grupos_vida: {
        Row: {
          anfitrion_nombre: string | null
          capacidad_maxima: number | null
          co_anfitrion_nombre: string | null
          dia_reunion: Database["public"]["Enums"]["enum_dia_semana"] | null
          direccion: string | null
          estado_ciclo: string | null
          hora_reunion: string | null
          id: string | null
          latitud: number | null
          lideres: Json | null
          longitud: number | null
          lugar_reunion: string | null
          nombre: string | null
          segmento: string | null
          temporada: string | null
          total_miembros: number | null
        }
        Relationships: []
      }
      v_salud_miembros_grupo: {
        Row: {
          grupo_id: string | null
          nivel_riesgo: string | null
          nombre_completo: string | null
          pct_asistencia: number | null
          rol: Database["public"]["Enums"]["enum_rol_grupo"] | null
          semanas_ausente: number | null
          total_ausencias: number | null
          total_eventos: number | null
          total_presencias: number | null
          ultima_vez_presente: string | null
          usuario_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["anfitrion_id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_casas_anfitrionas_disponibles"
            referencedColumns: ["co_anfitrion_id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_lideres_con_pareja"
            referencedColumns: ["pareja_id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_solicitudes_pendientes"
            referencedColumns: ["miembro_id"]
          },
        ]
      }
      v_solicitudes_pendientes: {
        Row: {
          creado_en: string | null
          estado: string | null
          expira_en: string | null
          grupo_id: string | null
          grupo_nombre: string | null
          grupo_origen_id: string | null
          grupo_origen_nombre: string | null
          id: string | null
          miembro_apellido: string | null
          miembro_foto: string | null
          miembro_id: string | null
          miembro_nombre: string | null
          motivo: string | null
          rol_solicitado: string | null
          segmento_nombre: string | null
          solicitante_apellido: string | null
          solicitante_nombre: string | null
          temporada_estado: string | null
          temporada_id: string | null
          temporada_nombre: string | null
          tipo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_origen_id_fkey"
            columns: ["grupo_origen_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_origen_id_fkey"
            columns: ["grupo_origen_id"]
            isOneToOne: false
            referencedRelation: "v_grupos_supervisiones"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_grupo_origen_id_fkey"
            columns: ["grupo_origen_id"]
            isOneToOne: false
            referencedRelation: "v_mapa_grupos_vida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_grupo_temporada_id_fkey"
            columns: ["temporada_id"]
            isOneToOne: false
            referencedRelation: "temporadas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _puede_ver_segmento_lider: {
        Args: {
          sl_row: Database["public"]["Tables"]["segmento_lideres"]["Row"]
        }
        Returns: boolean
      }
      actualizar_rol_miembro: {
        Args: {
          p_auth_id: string
          p_grupo_id: string
          p_rol: Database["public"]["Enums"]["enum_rol_grupo"]
          p_usuario_id: string
        }
        Returns: Json
      }
      actualizar_usuario_y_direccion: {
        Args: {
          p_apellido: string
          p_barrio: string
          p_calle: string
          p_cedula: string
          p_codigo_postal: string
          p_direccion_id: string
          p_email: string
          p_estado_civil: string
          p_fecha_nacimiento: string
          p_genero: string
          p_latitud: number
          p_longitud: number
          p_nombre: string
          p_ocupacion_id: string
          p_parroquia_id: string
          p_profesion_id: string
          p_referencia: string
          p_telefono: string
          p_user_id: string
        }
        Returns: string
      }
      agregar_miembro_a_grupo: {
        Args: {
          p_auth_id: string
          p_grupo_id: string
          p_rol?: Database["public"]["Enums"]["enum_rol_grupo"]
          p_usuario_id: string
        }
        Returns: Json
      }
      agregar_relacion_familiar_segura: {
        Args: {
          p_auth_id: string
          p_tipo_relacion: Database["public"]["Enums"]["enum_tipo_relacion"]
          p_usuario1_id: string
          p_usuario2_id: string
        }
        Returns: Json
      }
      asignar_casa_anfitriona_a_grupo: {
        Args: { p_auth_id: string; p_casa_id: string; p_grupo_id: string }
        Returns: Json
      }
      asignar_director_etapa_a_ubicacion: {
        Args: {
          p_accion: string
          p_auth_id: string
          p_director_etapa_id: string
          p_segmento_ubicacion_id: string
        }
        Returns: {
          director_etapa_id: string
          id: string
          segmento_ubicacion_id: string
        }[]
      }
      asignar_lider_matrimonio: {
        Args: {
          p_auth_id: string
          p_grupo_id: string
          p_incluir_conyugue?: boolean
          p_lider_id: string
        }
        Returns: Json
      }
      assign_pastoral_capabilities_for_role: {
        Args: { p_persona_id: string; p_rol: string }
        Returns: number
      }
      assign_support_ticket: {
        Args: { p_assignee_usuario_id: string; p_ticket_id: string }
        Returns: undefined
      }
      assign_talleres_capabilities_for_role: {
        Args: { p_persona_id: string; p_rol: string; p_taller_id: string }
        Returns: number
      }
      auth_has_dream_team_capability: {
        Args: { p_capability_key: string }
        Returns: boolean
      }
      auth_has_dream_team_capability_in_tree: {
        Args: { p_capability_key: string; p_equipo_id: string }
        Returns: boolean
      }
      auth_has_operating_core_capability: {
        Args: { p_capability: string }
        Returns: boolean
      }
      auth_has_pastoral_capability: {
        Args: { p_capability_key: string }
        Returns: boolean
      }
      auth_has_talleres_capability: {
        Args: { p_capability_key: string }
        Returns: boolean
      }
      auth_has_talleres_capability_scoped: {
        Args: { p_capability_key: string; p_equipo_id: string }
        Returns: boolean
      }
      auth_user_is_pastoral_actor: {
        Args: { actor_pastoral_id: string }
        Returns: boolean
      }
      auth_user_is_pastoral_actor_for_triada: {
        Args: { p_triada_id: string }
        Returns: boolean
      }
      buscar_usuarios_para_grupo: {
        Args: {
          p_auth_id: string
          p_grupo_id: string
          p_limit?: number
          p_query: string
        }
        Returns: {
          apellido: string
          email: string
          id: string
          nombre: string
          telefono: string
          ya_es_miembro: boolean
        }[]
      }
      buscar_usuarios_para_relacion_familiar: {
        Args: {
          p_auth_id: string
          p_busqueda?: string
          p_limite?: number
          p_usuario_base_id: string
        }
        Returns: {
          apellido: string
          foto_perfil_url: string
          id: string
          nombre: string
          total_count: number
        }[]
      }
      casas_map_actor_can_approve_review: {
        Args: { p_auth_id: string; p_casa_id: string }
        Returns: boolean
      }
      casas_map_auth_matches_actor: {
        Args: { p_auth_id: string }
        Returns: boolean
      }
      casas_map_backfill_approved_location_audit: {
        Args: {
          p_approval_reference?: string
          p_auth_id: string
          p_dry_run?: boolean
        }
        Returns: Json
      }
      casas_map_director_general_can_view_group: {
        Args: { p_grupo_id: string; p_user_id: string }
        Returns: boolean
      }
      casas_map_user_can_view_group: {
        Args: { p_auth_id: string; p_grupo_id: string }
        Returns: boolean
      }
      claim_operating_core_notification_outbox_batch: {
        Args: { p_limit?: number; p_lock_timeout?: string }
        Returns: {
          attempt_count: number
          available_at: string
          created_at: string
          dispatched_at: string | null
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["operating_core_notification_outbox_status"]
          subject_id: string | null
          target_address: string
          target_kind: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "operating_core_notification_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_support_event_outbox_batch: {
        Args: { p_limit?: number; p_lock_timeout?: string }
        Returns: {
          attempts: number
          available_at: string
          created_at: string
          event_key: string
          event_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          status: string
          ticket_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "support_event_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cohort_belongs_to_talleres_experience: {
        Args: { p_cohorte_id: string }
        Returns: boolean
      }
      contar_solicitudes_pendientes: {
        Args: { p_auth_id: string }
        Returns: number
      }
      crear_grupo: {
        Args: {
          p_auth_id: string
          p_campus_id?: string
          p_nombre: string
          p_segmento_id: string
          p_temporada_id: string
        }
        Returns: string
      }
      crear_solicitud_grupo: {
        Args: {
          p_auth_id: string
          p_grupo_id: string
          p_grupo_origen_id?: string
          p_motivo?: string
          p_rol_solicitado?: string
          p_tipo: string
          p_usuario_id: string
        }
        Returns: Json
      }
      create_staff_support_ticket_reply: {
        Args: { p_body: string; p_ticket_id: string }
        Returns: string
      }
      create_staff_support_ticket_reply_with_outbox: {
        Args: { p_body: string; p_ticket_id: string }
        Returns: Json
      }
      create_support_ticket_message_with_outbox: {
        Args: { p_body: string; p_ticket_id: string }
        Returns: Json
      }
      create_support_ticket_with_outbox: {
        Args: {
          p_app_build_version?: string
          p_browser_name?: string
          p_category: string
          p_current_route?: string
          p_description: string
          p_diagnostics_consent?: boolean
          p_os_name?: string
          p_sentry_event_id?: string
          p_subject: string
          p_viewport?: string
        }
        Returns: Json
      }
      create_taller_abstract: {
        Args: {
          p_descripcion: string
          p_equipo_id: string | null
          p_modalidad_default: string
          p_nombre: string
          p_parent_equipo_id: string | null
          p_slug: string
        }
        Returns: Json
      }
      dream_team_apply_servicio_grants: {
        Args: { p_accion: string; p_grants: Json; p_persona_id: string }
        Returns: number
      }
      dream_team_estructura_gdv: {
        Args: never
        Returns: {
          label: string
          nodo_id: string
          parent_id: string
          responsables: Json
          tipo: string
        }[]
      }
      dream_team_lideres_gdv: {
        Args: never
        Returns: {
          desde: string
          equipo_id: string
          persona_id: string
          rol: string
        }[]
      }
      dream_team_resolver_nombres: {
        Args: { p_persona_ids: string[] }
        Returns: {
          apellido: string
          id: string
          nombre: string
        }[]
      }
      eliminar_miembro_de_grupo: {
        Args: { p_auth_id: string; p_grupo_id: string; p_usuario_id: string }
        Returns: Json
      }
      eliminar_relacion_familiar: {
        Args: { p_relacion_id: string }
        Returns: undefined
      }
      eliminar_relacion_familiar_segura: {
        Args: { p_auth_id: string; p_relacion_id: string }
        Returns: Json
      }
      emit_taller_certificado: {
        Args: { p_codigo_verificacion: string; p_inscripcion_id: string }
        Returns: Json
      }
      es_admin_o_pastor: { Args: { p_auth_id: string }; Returns: boolean }
      es_director_de_grupo: {
        Args: { p_grupo_id: string; p_user_id: string }
        Returns: boolean
      }
      es_director_general_de_grupo: {
        Args: { p_auth_id: string; p_grupo_id: string }
        Returns: boolean
      }
      es_lider_de_grupo: {
        Args: { p_grupo_id: string; p_user_id: string }
        Returns: boolean
      }
      es_lider_usuario: { Args: { target_user_id: string }; Returns: boolean }
      es_superadmin: { Args: { p_auth_uid: string }; Returns: boolean }
      expirar_solicitudes_vencidas: { Args: never; Returns: number }
      generate_taller_sesiones: { Args: { p_grupo_id: string }; Returns: Json }
      get_my_internal_id: { Args: never; Returns: string }
      get_personas_under_me: {
        Args: { p_auth_id: string }
        Returns: {
          persona_id: string
        }[]
      }
      grant_support_capability: {
        Args: { p_capability: string; p_target_usuario_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      listar_eventos_grupo: {
        Args: {
          p_auth_id: string
          p_grupo_id: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          fecha: string
          hora: string
          id: string
          notas: string
          porcentaje: number
          presentes: number
          tema: string
          total: number
        }[]
      }
      listar_usuarios_con_permisos: {
        Args: {
          p_auth_id: string
          p_busqueda?: string
          p_campus_id?: string
          p_con_email?: boolean
          p_con_telefono?: boolean
          p_contexto_relacion?: boolean
          p_en_grupo?: boolean
          p_limite?: number
          p_offset?: number
          p_roles_filtro?: string[]
        }
        Returns: {
          apellido: string
          cedula: string
          email: string
          fecha_registro: string
          foto_perfil_url: string
          id: string
          nombre: string
          puede_ver: boolean
          rol_nombre_interno: string
          rol_nombre_visible: string
          telefono: string
          total_count: number
        }[]
      }
      mark_operating_core_notification_outbox_dispatched: {
        Args: { p_dispatched_at?: string; p_id: string }
        Returns: undefined
      }
      mark_operating_core_notification_outbox_failed: {
        Args: { p_id: string; p_last_error: string; p_next_attempt_at: string }
        Returns: undefined
      }
      mi_campus_principal: { Args: { p_auth_uid: string }; Returns: string }
      mis_campus_ids: { Args: { p_auth_uid: string }; Returns: string[] }
      obtener_asistencia_evento: {
        Args: { p_auth_id: string; p_evento_id: string }
        Returns: {
          apellido: string
          fecha_registro: string
          motivo_inasistencia: string
          motivo_tardanza: string
          motivo_tardanza_otro: string
          nombre: string
          nota: string
          presente: boolean
          registrado_por_usuario_id: string
          rol: string
          tiempo_tardanza: number
          tipo_presencia: string
          usuario_id: string
        }[]
      }
      obtener_auditoria_miembros: {
        Args: {
          p_action?: string
          p_actor_query?: string
          p_auth_id: string
          p_desde?: string
          p_grupo_id?: string
          p_hasta?: string
          p_limit?: number
          p_offset?: number
          p_usuario_id?: string
        }
        Returns: {
          action: string
          actor_auth_id: string
          actor_nombre: string
          actor_usuario_id: string
          grupo_id: string
          happened_at: string
          id: string
          new_data: Json
          old_data: Json
          total_count: number
          usuario_email: string
          usuario_id: string
          usuario_nombre: string
        }[]
      }
      obtener_casas_revision_pendiente: {
        Args: { p_auth_id: string }
        Returns: {
          casa_id: string
          casa_nombre: string
          created_at: string
          requested_by: string
          review_id: string
          review_type: string
        }[]
      }
      obtener_casas_visibles_ids: {
        Args: { p_auth_id: string }
        Returns: string[]
      }
      obtener_conyugue: {
        Args: { p_usuario_id: string }
        Returns: {
          apellido: string
          foto_perfil_url: string
          id: string
          nombre: string
        }[]
      }
      obtener_dashboard_riesgo: {
        Args: { p_auth_id: string; p_campus_id?: string }
        Returns: Json
      }
      obtener_datos_dashboard: { Args: { p_auth_id: string }; Returns: Json }
      obtener_detalle_grupo: {
        Args: { p_auth_id: string; p_grupo_id: string }
        Returns: Json
      }
      obtener_detalle_usuario: { Args: { p_user_id: string }; Returns: Json }
      obtener_estadisticas_usuarios_con_permisos: {
        Args: {
          p_auth_id: string
          p_busqueda?: string
          p_campus_id?: string
          p_con_email?: boolean
          p_con_telefono?: boolean
          p_en_grupo?: boolean
          p_roles_filtro?: string[]
        }
        Returns: {
          con_email: number
          con_telefono: number
          registrados_hoy: number
          total_usuarios: number
        }[]
      }
      obtener_evento_grupo: {
        Args: { p_auth_id: string; p_evento_id: string }
        Returns: {
          conteo_visitantes: number
          descripcion: string
          fecha: string
          grupo_id: string
          hora: string
          id: string
          motivo_no_reunion: string
          no_hubo_reunion: boolean
          notas: string
          notas_privadas_lider: string
          puntos_oracion: string
          tema: string
        }[]
      }
      obtener_eventos_con_notas: {
        Args: { p_auth_id: string; p_limite?: number }
        Returns: Json
      }
      obtener_grupos_para_usuario: {
        Args: {
          p_activo?: boolean
          p_auth_id: string
          p_eliminado?: boolean
          p_estado_temporal?: string
          p_limit?: number
          p_municipio_id?: string
          p_offset?: number
          p_parroquia_id?: string
          p_segmento_id?: string
          p_solo_mios?: boolean
          p_temporada_id?: string
        }
        Returns: {
          activo: boolean
          eliminado: boolean
          estado_temporal: string
          fecha_creacion: string
          hay_mis_grupos: boolean
          id: string
          lideres: Json
          miembros_count: number
          municipio_id: string
          municipio_nombre: string
          nombre: string
          parroquia_id: string
          parroquia_nombre: string
          segmento_nombre: string
          soy_lider: boolean
          soy_miembro: boolean
          supervisado_por_mi: boolean
          temporada_nombre: string
          total_count: number
        }[]
      }
      obtener_grupos_sin_casa_anfitriona: {
        Args: { p_auth_id: string; p_scope?: string }
        Returns: {
          estado_ciclo: string
          grupo_id: string
          grupo_nombre: string
          segmento: string
          temporada: string
        }[]
      }
      obtener_kpis_grupos_para_usuario:
        | {
            Args: { p_auth_id: string }
            Returns: {
              desviacion_miembros: number
              fecha_ultima_actualizacion: string
              pct_aprobados: number
              pct_con_lider: number
              pct_sin_director: number
              promedio_miembros: number
              total_aprobados: number
              total_con_lider: number
              total_grupos: number
              total_sin_director: number
            }[]
          }
        | {
            Args: { p_auth_id: string; p_campus_id?: string }
            Returns: {
              desviacion_miembros: number
              fecha_ultima_actualizacion: string
              pct_aprobados: number
              pct_con_lider: number
              pct_sin_director: number
              promedio_miembros: number
              total_aprobados: number
              total_con_lider: number
              total_grupos: number
              total_sin_director: number
            }[]
          }
      obtener_mapa_grupos_vida_host_homes: {
        Args: { p_auth_id: string; p_scope?: string }
        Returns: {
          barrio: string
          capacidad_maxima: number
          casa_id: string
          casa_nombre: string
          dia_reunion: string
          estado_ciclo: string
          grupo_id: string
          grupo_nombre: string
          hora_reunion: string
          latitud: number
          longitud: number
          notas_publicas: string
          segmento: string
          temporada: string
          total_miembros: number
        }[]
      }
      obtener_mapa_miembros: {
        Args: { p_auth_id: string; p_scope?: string }
        Returns: {
          grupo_id: string
          grupo_nombre: string
          latitud: number
          longitud: number
          nombre: string
          usuario_id: string
        }[]
      }
      obtener_miembros_en_riesgo: { Args: { p_auth_id: string }; Returns: Json }
      obtener_permisos_casa_anfitriona: {
        Args: { p_auth_id: string; p_casa_id?: string }
        Returns: Json
      }
      obtener_ranking_asistencia_grupo: {
        Args: {
          p_auth_id: string
          p_fecha_fin?: string
          p_fecha_inicio?: string
          p_grupo_id: string
          p_modo?: string
        }
        Returns: Json
      }
      obtener_reporte_asistencia_grupo: {
        Args: {
          p_auth_id: string
          p_fecha_fin?: string
          p_fecha_inicio?: string
          p_grupo_id: string
        }
        Returns: Json
      }
      obtener_reporte_asistencia_usuario: {
        Args: {
          p_auth_id: string
          p_fecha_fin?: string
          p_fecha_inicio?: string
          p_usuario_id: string
        }
        Returns: Json
      }
      obtener_reporte_crecimiento_neto: {
        Args: {
          p_auth_id: string
          p_campus_id?: string
          p_grupo_id?: string
          p_meses?: number
        }
        Returns: Json
      }
      obtener_reporte_retencion: {
        Args: {
          p_auth_id: string
          p_campus_id?: string
          p_temporada_actual_id: string
          p_temporada_anterior_id?: string
        }
        Returns: Json
      }
      obtener_reporte_semanal_asistencia: {
        Args: {
          p_auth_id: string
          p_fecha_semana?: string
          p_incluir_todos?: boolean
        }
        Returns: Json
      }
      obtener_roles_sistema_usuario: {
        Args: { p_auth_id: string }
        Returns: string[]
      }
      obtener_roles_usuario: { Args: { p_auth_id: string }; Returns: string[] }
      obtener_segmentos_para_director: {
        Args: { p_auth_id: string; p_campus_id?: string }
        Returns: {
          id: string
          nombre: string
        }[]
      }
      open_edicion:
        | {
            Args: {
              p_duracion_estimada_minutos: number
              p_fecha_fin_periodo: string
              p_fecha_inicio_periodo: string
              p_firmantes: Json
              p_link_type: string
              p_modalidad_inscripcion: string
              p_nombre_edicion: string
              p_sesiones_estimadas: number
              p_taller_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_duracion_estimada_minutos: number
              p_fecha_fin_periodo: string
              p_fecha_inicio_periodo: string
              p_firmantes: Json
              p_link_type: string
              p_modalidad_inscripcion: string
              p_nombre_edicion: string
              p_sesiones_estimadas: number
              p_taller_id: string
              p_tipo: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_duracion_estimada_minutos: number
              p_fecha_fin_periodo: string
              p_fecha_inicio_periodo: string
              p_firmantes: Json
              p_link_type: string
              p_modalidad_inscripcion: string
              p_nombre_edicion: string
              p_sesiones_estimadas: number
              p_taller_id: string
              p_temporada_id: string
              p_tipo: string
            }
            Returns: Json
          }
      operating_core_claim_public_token: {
        Args: { p_consuming_persona_id?: string; p_token_hash: string }
        Returns: {
          captured_by_persona_id: string | null
          consumed_at: string | null
          consumed_by_persona_id: string | null
          created_at: string
          expires_at: string
          metadata: Json
          persona_id: string | null
          resource_id: string
          resource_type: string
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "operating_core_public_tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      operating_core_materialize_event_instances: {
        Args: {
          p_event_id: string
          p_horizon_days?: number
          p_now_iso?: string
        }
        Returns: {
          capacity_operativa: number
          created_at: string
          end_time: string
          estado: Database["public"]["Enums"]["operating_core_event_estado"]
          event_id: string
          horizon_days: number
          id: string
          instance_date: string
          lifecycle: Database["public"]["Enums"]["operating_core_instance_lifecycle"]
          metadata: Json
          recurrence_rule: Json | null
          start_time: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "operating_core_event_instances"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      operating_core_promote_waitlist: {
        Args: { p_event_id: string; p_slot_released?: number }
        Returns: {
          captured_by_persona_id: string | null
          confirmation_mode: Database["public"]["Enums"]["operating_core_registration_confirmation_mode"]
          created_at: string
          estado: Database["public"]["Enums"]["operating_core_registration_estado"]
          event_id: string
          id: string
          persona_id: string
          reason: string | null
          updated_at: string
          version: number
          waitlist_position: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "operating_core_registrations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      procesar_aprobacion_casa_anfitriona: {
        Args: {
          p_accion: string
          p_auth_id: string
          p_casa_id: string
          p_notas?: string
        }
        Returns: Json
      }
      procesar_revision_ubicacion_casa: {
        Args: {
          p_accion: string
          p_auth_id: string
          p_notas?: string
          p_review_id: string
        }
        Returns: Json
      }
      procesar_solicitud_grupo: {
        Args: {
          p_accion: string
          p_auth_id: string
          p_notas?: string
          p_solicitud_id: string
        }
        Returns: Json
      }
      puede_aprobar_casa_anfitriona: {
        Args: { p_auth_id: string; p_casa_id: string }
        Returns: boolean
      }
      puede_asignar_casa_anfitriona_a_grupo: {
        Args: { p_auth_id: string; p_casa_id: string; p_grupo_id: string }
        Returns: boolean
      }
      puede_cambiar_estado_casa_anfitriona: {
        Args: { p_auth_id: string; p_casa_id: string }
        Returns: boolean
      }
      puede_crear_casa_anfitriona_para: {
        Args: { p_auth_id: string; p_usuario_id: string }
        Returns: boolean
      }
      puede_crear_grupo: {
        Args: { p_auth_id: string; p_segmento_id: string }
        Returns: boolean
      }
      puede_crear_usuario: { Args: { p_auth_id: string }; Returns: boolean }
      puede_editar_casa_anfitriona: {
        Args: { p_auth_id: string; p_casa_id: string }
        Returns: boolean
      }
      puede_editar_grupo: {
        Args: { p_auth_id: string; p_grupo_id: string }
        Returns: boolean
      }
      puede_editar_taller_grupo: {
        Args: { p_taller_id: string }
        Returns: boolean
      }
      puede_editar_usuario: {
        Args: { p_auth_id: string; p_target_user_id: string }
        Returns: boolean
      }
      puede_gestionar_casas: { Args: { p_auth_id: string }; Returns: boolean }
      puede_gestionar_miembros: {
        Args: { p_auth_id: string; p_grupo_id: string }
        Returns: boolean
      }
      puede_gestionar_participantes_taller_grupo: {
        Args: { p_taller_id: string }
        Returns: boolean
      }
      puede_gestionar_relacion_familiar: {
        Args: {
          p_auth_id: string
          p_usuario1_id: string
          p_usuario2_id: string
        }
        Returns: boolean
      }
      puede_ver_casa_anfitriona: {
        Args: { p_auth_id: string; p_casa_id: string }
        Returns: boolean
      }
      puede_ver_debug_toolbar: { Args: { p_auth_id: string }; Returns: boolean }
      puede_ver_grupo: {
        Args: { p_grupo_id: string; p_user_id: string }
        Returns: boolean
      }
      puede_ver_grupo_reporte_asistencia: {
        Args: { p_auth_id: string; p_grupo_id: string }
        Returns: boolean
      }
      puede_ver_relacion_familiar: {
        Args: {
          p_auth_id: string
          p_usuario1_id: string
          p_usuario2_id: string
        }
        Returns: boolean
      }
      puede_ver_taller_grupo: {
        Args: { p_taller_id: string }
        Returns: boolean
      }
      puede_ver_usuario: {
        Args: { p_target_user_id: string; p_viewer_id: string }
        Returns: boolean
      }
      record_support_external_inbound_update: {
        Args: {
          p_author_usuario_id: string
          p_idempotency_key: string
          p_is_internal: boolean
          p_message_body: string
          p_ticket_id: string
        }
        Returns: {
          duplicate: boolean
          event_id: string
          message_id: string
        }[]
      }
      registrar_asistencia: {
        Args: {
          p_asistencias?: Json
          p_auth_id: string
          p_conteo_visitantes?: number
          p_descripcion?: string
          p_fecha: string
          p_forzar_edicion?: boolean
          p_grupo_id: string
          p_hora?: string
          p_motivo_no_reunion?: string
          p_no_hubo_reunion?: boolean
          p_notas?: string
          p_notas_privadas_lider?: string
          p_puntos_oracion?: string
          p_tema?: string
        }
        Returns: Json
      }
      resumen_dashboard_admin: { Args: { p_campus_id?: string }; Returns: Json }
      revoke_support_capability: {
        Args: { p_capability: string; p_target_usuario_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sugerir_nombre_grupo: {
        Args: {
          p_segmento_id: string
          p_temporada_id: string
          p_ubicacion: string
        }
        Returns: string
      }
      taller_emit_overdue_event: {
        Args: { p_current_date?: string; p_taller_id: string }
        Returns: number
      }
      talleres_coord_inscripciones_personas: {
        Args: { p_inscripcion_ids: string[] }
        Returns: {
          comp_apellido: string
          comp_nombre: string
          companero_id: string
          inscripcion_id: string
          persona_principal_id: string
          pp_apellido: string
          pp_email: string
          pp_nombre: string
        }[]
      }
      talleres_equipo_de_cohorte: {
        Args: { p_cohorte_id: string }
        Returns: string
      }
      talleres_equipo_de_grupo: {
        Args: { p_grupo_id: string }
        Returns: string
      }
      talleres_equipo_de_inscripcion: {
        Args: { p_inscripcion_id: string }
        Returns: string
      }
      talleres_equipo_de_solicitud: {
        Args: { p_grupo_asignacion_id: string; p_inscripcion_id: string }
        Returns: string
      }
      talleres_resolver_solicitud_retiro: {
        Args: { p_accion: string; p_motivo?: string; p_solicitud_id: string }
        Returns: Json
      }
      tiene_rol_de_liderazgo: { Args: { p_auth_id: string }; Returns: boolean }
      update_support_ticket_status: {
        Args: { p_status: string; p_ticket_id: string }
        Returns: undefined
      }
      update_support_ticket_status_with_outbox: {
        Args: { p_status: string; p_ticket_id: string }
        Returns: Json
      }
    }
    Enums: {
      dream_team_estado:
        | "postulado"
        | "en_orientacion"
        | "activo"
        | "en_pausa"
        | "inactivo"
        | "retirado"
      dream_team_obligatoriedad: "requerido" | "opcional" | "no_aplica"
      dream_team_requisito_estado:
        | "pendiente"
        | "completado"
        | "vencido"
        | "no_aplica"
      dream_team_requisito_tipo:
        | "documento"
        | "capacitacion"
        | "entrevista"
        | "firma"
        | "otro"
      dream_team_transicion_motivo:
        | "admin_asignacion"
        | "admin_promocion"
        | "admin_pausa"
        | "admin_reactivacion"
        | "admin_retiro"
        | "reasignacion"
        | "requisito_vencido"
        | "gdv_liderazgo_removed"
        | "auto_pausa"
        | "otro"
      enum_dia_semana:
        | "Lunes"
        | "Martes"
        | "Miércoles"
        | "Jueves"
        | "Viernes"
        | "Sábado"
        | "Domingo"
      enum_estado_civil: "Soltero" | "Casado" | "Divorciado" | "Viudo"
      enum_genero: "Masculino" | "Femenino" | "Otro"
      enum_rol_grupo: "Líder" | "Colíder" | "Miembro"
      enum_tipo_lider: "director_general" | "director_etapa"
      enum_tipo_relacion:
        | "conyuge"
        | "padre"
        | "hijo"
        | "tutor"
        | "hermano"
        | "otro_familiar"
      operating_core_capacity_source: "base" | "override"
      operating_core_event_estado: "active" | "cancelled"
      operating_core_event_kind:
        | "service"
        | "group_meeting"
        | "workshop"
        | "activity"
        | "custom"
      operating_core_form_lifecycle: "draft" | "published" | "archived"
      operating_core_instance_lifecycle:
        | "scheduled"
        | "ongoing"
        | "completed"
        | "cancelled"
      operating_core_notification_outbox_status:
        | "pending"
        | "processing"
        | "dispatched"
        | "failed"
      operating_core_participation_kind:
        | "visitor_capture"
        | "registration"
        | "cancellation"
        | "check_in"
        | "check_out"
        | "attendance"
        | "attendance_update"
        | "service_assignment"
        | "requirement_update"
        | "transition"
        | "document_received"
        | "pastoral_one_on_one_logged"
        | "pastoral_one_on_one_completed"
        | "pastoral_one_on_one_cancelled"
        | "pastoral_one_on_one_note_logged"
        | "pastoral_one_on_one_followup_set"
        | "pastoral_one_on_one_followup_completed"
        | "pastoral_one_on_one_step_validated"
        | "pastoral_triada_formed"
        | "pastoral_triada_member_added"
        | "pastoral_triada_member_removed"
        | "pastoral_triada_disbanded"
        | "pastoral_triada_step_suggested"
        | "pastoral_triada_step_validated"
        | "pastoral_crisis_detected"
      operating_core_participation_status:
        | "recorded"
        | "corrected"
        | "superseded"
        | "rejected"
      operating_core_recurrence_freq: "daily" | "weekly" | "monthly" | "yearly"
      operating_core_registration_confirmation_mode: "automatic" | "manual"
      operating_core_registration_estado:
        | "pendiente"
        | "confirmada"
        | "asistida"
        | "no_asistio"
        | "cancelada"
        | "rechazada"
      operating_core_service_estado: "active" | "disabled" | "removed"
      pastoral_one_on_one_estado:
        | "pending_participant"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_realizado"
      pastoral_triada_contexto:
        | "nuevo_paso"
        | "simultaneidad"
        | "inicial"
        | "reformada"
      pastoral_triada_estado:
        | "pending_confirmation"
        | "active"
        | "en_pausa"
        | "disbanded"
      pastoral_triada_evento_tipo:
        | "formada"
        | "miembro_anadido"
        | "miembro_removido"
        | "pausada"
        | "reactivada"
        | "disuelta"
        | "paso_sugerido"
        | "paso_validado"
      pastoral_triada_motivo_disolucion:
        | "gdv_liderazgo_removed"
        | "servicio_retirado"
        | "cambio_de_temporada"
        | "pastoral_decision"
        | "otro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      dream_team_estado: [
        "postulado",
        "en_orientacion",
        "activo",
        "en_pausa",
        "inactivo",
        "retirado",
      ],
      dream_team_obligatoriedad: ["requerido", "opcional", "no_aplica"],
      dream_team_requisito_estado: [
        "pendiente",
        "completado",
        "vencido",
        "no_aplica",
      ],
      dream_team_requisito_tipo: [
        "documento",
        "capacitacion",
        "entrevista",
        "firma",
        "otro",
      ],
      dream_team_transicion_motivo: [
        "admin_asignacion",
        "admin_promocion",
        "admin_pausa",
        "admin_reactivacion",
        "admin_retiro",
        "reasignacion",
        "requisito_vencido",
        "gdv_liderazgo_removed",
        "auto_pausa",
        "otro",
      ],
      enum_dia_semana: [
        "Lunes",
        "Martes",
        "Miércoles",
        "Jueves",
        "Viernes",
        "Sábado",
        "Domingo",
      ],
      enum_estado_civil: ["Soltero", "Casado", "Divorciado", "Viudo"],
      enum_genero: ["Masculino", "Femenino", "Otro"],
      enum_rol_grupo: ["Líder", "Colíder", "Miembro"],
      enum_tipo_lider: ["director_general", "director_etapa"],
      enum_tipo_relacion: [
        "conyuge",
        "padre",
        "hijo",
        "tutor",
        "hermano",
        "otro_familiar",
      ],
      operating_core_capacity_source: ["base", "override"],
      operating_core_event_estado: ["active", "cancelled"],
      operating_core_event_kind: [
        "service",
        "group_meeting",
        "workshop",
        "activity",
        "custom",
      ],
      operating_core_form_lifecycle: ["draft", "published", "archived"],
      operating_core_instance_lifecycle: [
        "scheduled",
        "ongoing",
        "completed",
        "cancelled",
      ],
      operating_core_notification_outbox_status: [
        "pending",
        "processing",
        "dispatched",
        "failed",
      ],
      operating_core_participation_kind: [
        "visitor_capture",
        "registration",
        "cancellation",
        "check_in",
        "check_out",
        "attendance",
        "attendance_update",
        "service_assignment",
        "requirement_update",
        "transition",
        "document_received",
        "pastoral_one_on_one_logged",
        "pastoral_one_on_one_completed",
        "pastoral_one_on_one_cancelled",
        "pastoral_one_on_one_note_logged",
        "pastoral_one_on_one_followup_set",
        "pastoral_one_on_one_followup_completed",
        "pastoral_one_on_one_step_validated",
        "pastoral_triada_formed",
        "pastoral_triada_member_added",
        "pastoral_triada_member_removed",
        "pastoral_triada_disbanded",
        "pastoral_triada_step_suggested",
        "pastoral_triada_step_validated",
        "pastoral_crisis_detected",
      ],
      operating_core_participation_status: [
        "recorded",
        "corrected",
        "superseded",
        "rejected",
      ],
      operating_core_recurrence_freq: ["daily", "weekly", "monthly", "yearly"],
      operating_core_registration_confirmation_mode: ["automatic", "manual"],
      operating_core_registration_estado: [
        "pendiente",
        "confirmada",
        "asistida",
        "no_asistio",
        "cancelada",
        "rechazada",
      ],
      operating_core_service_estado: ["active", "disabled", "removed"],
      pastoral_one_on_one_estado: [
        "pending_participant",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "no_realizado",
      ],
      pastoral_triada_contexto: [
        "nuevo_paso",
        "simultaneidad",
        "inicial",
        "reformada",
      ],
      pastoral_triada_estado: [
        "pending_confirmation",
        "active",
        "en_pausa",
        "disbanded",
      ],
      pastoral_triada_evento_tipo: [
        "formada",
        "miembro_anadido",
        "miembro_removido",
        "pausada",
        "reactivada",
        "disuelta",
        "paso_sugerido",
        "paso_validado",
      ],
      pastoral_triada_motivo_disolucion: [
        "gdv_liderazgo_removed",
        "servicio_retirado",
        "cambio_de_temporada",
        "pastoral_decision",
        "otro",
      ],
    },
  },
} as const
