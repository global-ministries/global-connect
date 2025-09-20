"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'

type Usuario = Database['public']['Tables']['usuarios']['Row']

interface CurrentUserData {
  usuario: Usuario | null
  loading: boolean
  error: string | null
}

export function useCurrentUser(): CurrentUserData {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
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

        setUsuario(userData)
      } catch (err) {
        console.error('Error en useCurrentUser:', err)
        setError(err instanceof Error ? err.message : 'Error desconocido')
        setUsuario(null)
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
        setLoading(false)
      } else if (event === 'SIGNED_IN' && session) {
        fetchCurrentUser()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { usuario, loading, error }
}
