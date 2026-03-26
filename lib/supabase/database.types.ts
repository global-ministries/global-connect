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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
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
      agregar_relacion_familiar: {
        Args: {
          p_tipo_relacion: string
          p_usuario1_id: string
          p_usuario2_id: string
        }
        Returns: undefined
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
      eliminar_miembro_de_grupo: {
        Args: { p_auth_id: string; p_grupo_id: string; p_usuario_id: string }
        Returns: Json
      }
      eliminar_relacion_familiar: {
        Args: { p_relacion_id: string }
        Returns: undefined
      }
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
      get_my_internal_id: { Args: never; Returns: string }
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
      obtener_estadisticas_usuarios_con_permisos:
        | {
            Args: {
              p_auth_id: string
              p_busqueda?: string
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
        | {
            Args: { p_auth_id: string; p_campus_id?: string }
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
          p_campus_id?: string
          p_eliminado?: boolean
          p_estado_temporal?: string
          p_limit?: number
          p_localidad_id?: string
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
      obtener_kpis_grupos_para_usuario: {
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
      obtener_miembros_en_riesgo: { Args: { p_auth_id: string }; Returns: Json }
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
      procesar_aprobacion_casa_anfitriona: {
        Args: {
          p_accion: string
          p_auth_id: string
          p_casa_id: string
          p_notas?: string
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
      puede_crear_grupo: {
        Args: { p_auth_id: string; p_segmento_id: string }
        Returns: boolean
      }
      puede_crear_usuario: { Args: { p_auth_id: string }; Returns: boolean }
      puede_editar_grupo: {
        Args: { p_auth_id: string; p_grupo_id: string }
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
      puede_ver_debug_toolbar: { Args: { p_auth_id: string }; Returns: boolean }
      puede_ver_grupo: {
        Args: { p_grupo_id: string; p_user_id: string }
        Returns: boolean
      }
      puede_ver_usuario: {
        Args: { p_target_user_id: string; p_viewer_id: string }
        Returns: boolean
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
      tiene_rol_de_liderazgo: { Args: { p_auth_id: string }; Returns: boolean }
    }
    Enums: {
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
    },
  },
} as const
