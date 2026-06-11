"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'

type Usuario = Database['public']['Tables']['usuarios']['Row']

interface CurrentUserData {
  usuario: Usuario | null
  roles: string[]
  supportCapabilities: string[]
  loading: boolean
  error: string | null
}

const SUPPORT_CAPABILITIES = ['support.view', 'support.reply', 'support.manage'] as const
type SupportCapability = (typeof SUPPORT_CAPABILITIES)[number]

export function useCurrentUser(): CurrentUserData {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [supportCapabilities, setSupportCapabilities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        setLoading(true)
        setError(null)

        const supabase = createClient()
        
        // Obtener usuario autenticado
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError) {
          throw new Error('Error de autenticación: ' + authError.message)
        }

        if (!user) {
          setUsuario(null)
          setRoles([])
          setSupportCapabilities([])
          return
        }

        // Obtener datos del usuario desde la tabla usuarios
        const { data: userData, error: userError } = await supabase
          .from('usuarios')
          .select('*')
          .eq('auth_id', user.id)
          .maybeSingle()

        if (userError) {
          throw new Error('Error al obtener datos del usuario: ' + userError.message)
        }

        // Obtener roles del usuario usando la función RPC
        const { data: rolesData, error: rolesError } = await supabase
          .rpc('obtener_roles_usuario', { p_auth_id: user.id })

        let userRoles: string[] = []
        if (!rolesError && rolesData) {
          // rolesData puede ser array de strings o de objetos
          userRoles = Array.isArray(rolesData)
            ? rolesData.map((role: unknown) => typeof role === "string" ? role : getRoleName(role)).filter((role): role is string => Boolean(role))
            : []
        }

        let userSupportCapabilities: string[] = []
        if (userData?.id) {
          const { data: capabilitiesData, error: capabilitiesError } = await supabase
            .from('support_user_capabilities')
            .select('capability')
            .eq('usuario_id', userData.id)
            .is('revoked_at', null)

          if (!capabilitiesError && capabilitiesData) {
            userSupportCapabilities = capabilitiesData
              .map((row: { capability: string }) => row.capability)
              .filter((capability): capability is SupportCapability => SUPPORT_CAPABILITIES.includes(capability as SupportCapability))
          }
        }

        setUsuario(userData)
        setRoles(userRoles)
        setSupportCapabilities(userSupportCapabilities)
      } catch (err) {
        console.error('Error en useCurrentUser:', err)
        setError(err instanceof Error ? err.message : 'Error desconocido')
        setUsuario(null)
        setRoles([])
        setSupportCapabilities([])
      } finally {
        setLoading(false)
      }
    }

    fetchCurrentUser()

    // Escuchar cambios en la autenticación
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (event === 'SIGNED_OUT') {
        setUsuario(null)
        setRoles([])
        setSupportCapabilities([])
        setLoading(false)
      } else if (event === 'SIGNED_IN' && session) {
        fetchCurrentUser()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { usuario, roles, supportCapabilities, loading, error }
}

function getRoleName(role: unknown) {
  if (typeof role !== 'object' || role === null || !('nombre_interno' in role)) return undefined
  const roleName = role.nombre_interno
  return typeof roleName === 'string' ? roleName : undefined
}
