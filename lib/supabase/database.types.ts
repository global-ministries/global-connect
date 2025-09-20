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
          evento_grupo_id: string
          fecha_registro: string
          id: string
          motivo_inasistencia: string | null
          presente: boolean
          registrado_por_usuario_id: string | null
          usuario_id: string
        }
        Insert: {
          evento_grupo_id: string
          fecha_registro?: string
          id?: string
          motivo_inasistencia?: string | null
          presente: boolean
          registrado_por_usuario_id?: string | null
          usuario_id: string
        }
        Update: {
          evento_grupo_id?: string
          fecha_registro?: string
          id?: string
          motivo_inasistencia?: string | null
          presente?: boolean
          registrado_por_usuario_id?: string | null
          usuario_id?: string
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
            foreignKeyName: "asistencia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_evento_grupo_id"
            columns: ["evento_grupo_id"]
            isOneToOne: false
            referencedRelation: "eventos_grupo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_usuario_asistencia_id"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
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
            foreignKeyName: "dias_excepcion_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
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
          {
            foreignKeyName: "fk_parroquia_id"
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
            foreignKeyName: "director_etapa_grupos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
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
          fecha: string
          grupo_id: string
          hora: string | null
          id: string
          notas: string | null
          tema: string | null
        }
        Insert: {
          fecha: string
          grupo_id: string
          hora?: string | null
          id?: string
          notas?: string | null
          tema?: string | null
        }
        Update: {
          fecha?: string
          grupo_id?: string
          hora?: string | null
          id?: string
          notas?: string | null
          tema?: string | null
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
            foreignKeyName: "fk_grupo_evento_id"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
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
          fecha_asignacion: string
          fecha_salida: string | null
          grupo_id: string
          id: string
          rol: Database["public"]["Enums"]["enum_rol_grupo"]
          usuario_id: string
        }
        Insert: {
          fecha_asignacion?: string
          fecha_salida?: string | null
          grupo_id: string
          id?: string
          rol: Database["public"]["Enums"]["enum_rol_grupo"]
          usuario_id: string
        }
        Update: {
          fecha_asignacion?: string
          fecha_salida?: string | null
          grupo_id?: string
          id?: string
          rol?: Database["public"]["Enums"]["enum_rol_grupo"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_grupo_id"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_usuario_id"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_miembros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos: {
        Row: {
          activo: boolean
          creado_por_usuario_id: string | null
          dia_reunion: Database["public"]["Enums"]["enum_dia_semana"] | null
          direccion_anfitrion_id: string | null
          fecha_creacion: string
          hora_reunion: string | null
          id: string
          nombre: string
          notas_privadas: string | null
          segmento_id: string
          temporada_id: string
        }
        Insert: {
          activo?: boolean
          creado_por_usuario_id?: string | null
          dia_reunion?: Database["public"]["Enums"]["enum_dia_semana"] | null
          direccion_anfitrion_id?: string | null
          fecha_creacion?: string
          hora_reunion?: string | null
          id?: string
          nombre: string
          notas_privadas?: string | null
          segmento_id: string
          temporada_id: string
        }
        Update: {
          activo?: boolean
          creado_por_usuario_id?: string | null
          dia_reunion?: Database["public"]["Enums"]["enum_dia_semana"] | null
          direccion_anfitrion_id?: string | null
          fecha_creacion?: string
          hora_reunion?: string | null
          id?: string
          nombre?: string
          notas_privadas?: string | null
          segmento_id?: string
          temporada_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_direccion_anfitrion_id"
            columns: ["direccion_anfitrion_id"]
            isOneToOne: false
            referencedRelation: "direcciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_segmento_id"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmentos"
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
            foreignKeyName: "grupos_direccion_anfitrion_id_fkey"
            columns: ["direccion_anfitrion_id"]
            isOneToOne: false
            referencedRelation: "direcciones"
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
            foreignKeyName: "grupos_temporada_id_fkey"
            columns: ["temporada_id"]
            isOneToOne: false
            referencedRelation: "temporadas"
            referencedColumns: ["id"]
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
            foreignKeyName: "fk_usuario2_id"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario1_id_fkey"
            columns: ["usuario1_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relaciones_usuarios_usuario2_id_fkey"
            columns: ["usuario2_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
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
          id: string
          segmento_id: string
          tipo_lider: Database["public"]["Enums"]["enum_tipo_lider"]
          usuario_id: string
        }
        Insert: {
          id?: string
          segmento_id: string
          tipo_lider: Database["public"]["Enums"]["enum_tipo_lider"]
          usuario_id: string
        }
        Update: {
          id?: string
          segmento_id?: string
          tipo_lider?: Database["public"]["Enums"]["enum_tipo_lider"]
          usuario_id?: string
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
        ]
      }
      segmentos: {
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
      temporadas: {
        Row: {
          activa: boolean
          fecha_fin: string
          fecha_inicio: string
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          fecha_fin: string
          fecha_inicio: string
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          nombre?: string
        }
        Relationships: []
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
            foreignKeyName: "uno_a_uno_reuniones_lider_usuario_id_fkey"
            columns: ["lider_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
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
      [_ in never]: never
    }
    Functions: {
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
      crear_grupo: {
        Args: {
          p_auth_id: string
          p_nombre: string
          p_segmento_id: string
          p_temporada_id: string
        }
        Returns: string
      }
      debug_cambiar_rol: {
        Args: { p_auth_id: string; p_nuevo_rol: string }
        Returns: boolean
      }
      debug_cambiar_rol_usuario: {
        Args: { p_auth_id: string; p_nuevo_rol: string }
        Returns: boolean
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
      es_lider_de_grupo: {
        Args: { p_grupo_id: string; p_user_id: string }
        Returns: boolean
      }
      get_my_internal_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
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
      obtener_asistencia_evento: {
        Args: { p_auth_id: string; p_evento_id: string }
        Returns: {
          apellido: string
          fecha_registro: string
          motivo_inasistencia: string
          nombre: string
          presente: boolean
          registrado_por_usuario_id: string
          rol: string
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
      obtener_detalle_grupo: {
        Args: { p_auth_id: string; p_grupo_id: string }
        Returns: Json
      }
      obtener_detalle_usuario: {
        Args: { p_user_id: string }
        Returns: Json
      }
      obtener_evento_grupo: {
        Args: { p_auth_id: string; p_evento_id: string }
        Returns: {
          fecha: string
          grupo_id: string
          hora: string
          id: string
          notas: string
          tema: string
        }[]
      }
      obtener_grupos_para_usuario: {
        Args: {
          p_activo?: boolean
          p_auth_id: string
          p_limit?: number
          p_municipio_id?: string
          p_offset?: number
          p_parroquia_id?: string
          p_segmento_id?: string
          p_temporada_id?: string
        }
        Returns: {
          activo: boolean
          fecha_creacion: string
          id: string
          lideres: Json
          miembros_count: number
          municipio_id: string
          municipio_nombre: string
          nombre: string
          parroquia_id: string
          parroquia_nombre: string
          segmento_nombre: string
          temporada_nombre: string
          total_count: number
        }[]
      }
      obtener_roles_usuario: {
        Args: { p_auth_id: string }
        Returns: string[]
      }
      obtener_segmentos_para_director: {
        Args: { p_auth_id: string }
        Returns: {
          id: string
          nombre: string
        }[]
      }
      puede_crear_grupo: {
        Args: { p_auth_id: string; p_segmento_id: string }
        Returns: boolean
      }
      puede_editar_grupo: {
        Args: { p_auth_id: string; p_grupo_id: string }
        Returns: boolean
      }
      puede_gestionar_miembros: {
        Args: { p_auth_id: string; p_grupo_id: string }
        Returns: boolean
      }
      puede_ver_debug_toolbar: {
        Args: { p_auth_id: string }
        Returns: boolean
      }
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
          p_fecha: string
          p_grupo_id: string
          p_hora?: string
          p_notas?: string
          p_tema?: string
        }
        Returns: string
      }
      resumen_dashboard_admin: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      tiene_rol_de_liderazgo: {
        Args: { p_auth_id: string }
        Returns: boolean
      }
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
