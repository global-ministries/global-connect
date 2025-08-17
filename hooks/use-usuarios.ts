import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Usuario = Database["public"]["Tables"]["usuarios"]["Row"]
type UsuarioRol = Database["public"]["Tables"]["usuario_roles"]["Row"]
type RolSistema = Database["public"]["Tables"]["roles_sistema"]["Row"]

export type UsuarioConRol = Usuario & {
  usuario_roles?: {
    rol_id: string
    roles_sistema?: {
      nombre_interno: string
      nombre_visible: string
    }
  }[]
}

export type RolDisponible = {
  nombre_interno: string
  nombre_visible: string
}

export function useUsuarios() {
  const [usuariosConRoles, setUsuariosConRoles] = useState<UsuarioConRol[]>([])
  const [rolesDisponibles, setRolesDisponibles] = useState<RolDisponible[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const cargarDatos = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Cargar usuarios con roles
      const { data: usuarios, error: errorUsuarios } = await supabase
        .from('usuarios')
        .select(`
          *,
          usuario_roles!fk_usuario_roles_usuario_id (
            rol_id,
            roles_sistema!fk_usuario_roles_rol_id (
              nombre_interno,
              nombre_visible
            )
          )
        `)

      if (errorUsuarios) {
        console.error('Error al obtener usuarios con roles:', errorUsuarios)
        setError('Error al cargar usuarios')
        return
      }

      // Cargar roles del sistema
      const { data: roles, error: errorRoles } = await supabase
        .from('roles_sistema')
        .select('nombre_interno, nombre_visible')

      if (errorRoles) {
        console.error('Error al obtener roles:', errorRoles)
        setError('Error al cargar roles')
        return
      }

      setUsuariosConRoles(usuarios || [])
      setRolesDisponibles(roles || [])
    } catch (err) {
      console.error('Error inesperado:', err)
      setError('Error inesperado al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  return {
    usuariosConRoles,
    rolesDisponibles,
    loading,
    error,
    recargar: cargarDatos
  }
}
