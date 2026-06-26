"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildPlatformSession } from '@/lib/platform/session/build'
import type { Database } from '@/lib/supabase/database.types'
import type { PlatformSession, PlatformSessionPersona } from '@/lib/platform/session/types'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

type Usuario = Database['public']['Tables']['usuarios']['Row']

interface CurrentUserData {
  usuario: Usuario | null
  roles: string[]
  supportCapabilities: string[]
  platformSession: PlatformSession | null
  loading: boolean
  error: string | null
}

const SUPPORT_CAPABILITIES = ['support.view', 'support.reply', 'support.manage'] as const
type SupportCapability = (typeof SUPPORT_CAPABILITIES)[number]
type CurrentUserResult = Omit<CurrentUserData, 'loading' | 'error'>

const CURRENT_USER_CACHE_TTL_MS = 15_000
let currentUserCache: { expiresAt: number; value: CurrentUserResult } | null = null
let currentUserRequest: Promise<CurrentUserResult> | null = null

function clearCurrentUserCache() {
  currentUserCache = null
  currentUserRequest = null
}

async function fetchCurrentUserData(): Promise<CurrentUserResult> {
  const now = Date.now()
  if (currentUserCache && currentUserCache.expiresAt > now) {
    return currentUserCache.value
  }

  if (currentUserRequest) {
    return currentUserRequest
  }

  currentUserRequest = loadCurrentUserData().then((value) => {
    currentUserCache = { value, expiresAt: Date.now() + CURRENT_USER_CACHE_TTL_MS }
    currentUserRequest = null
    return value
  }).catch((error: unknown) => {
    currentUserRequest = null
    throw error
  })

  return currentUserRequest
}

async function loadCurrentUserData(): Promise<CurrentUserResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError) {
    throw new Error('Error de autenticación: ' + authError.message)
  }

  if (!user) {
    return { usuario: null, roles: [], supportCapabilities: [], platformSession: null }
  }

  const { data: userData, error: userError } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (userError) {
    throw new Error('Error al obtener datos del usuario: ' + userError.message)
  }

  const { data: rolesData, error: rolesError } = await supabase
    .rpc('obtener_roles_usuario', { p_auth_id: user.id })

  const roles = !rolesError && Array.isArray(rolesData)
    ? rolesData.map((role: unknown) => typeof role === "string" ? role : getRoleName(role)).filter((role): role is string => Boolean(role))
    : []

  let supportCapabilities: string[] = []
  if (userData?.id) {
    const { data: capabilitiesData, error: capabilitiesError } = await supabase
      .from('support_user_capabilities')
      .select('capability')
      .eq('usuario_id', userData.id)
      .is('revoked_at', null)

    if (!capabilitiesError && capabilitiesData) {
      supportCapabilities = capabilitiesData
        .map((row: { capability: string }) => row.capability)
        .filter((capability): capability is SupportCapability => SUPPORT_CAPABILITIES.includes(capability as SupportCapability))
    }
  }

  const platformSession = await resolveClientPlatformSession({
    subjectAuthId: user.id,
    usuario: userData,
    globalRoles: roles,
  })

  return { usuario: userData, roles, supportCapabilities, platformSession }
}

export function useCurrentUser(): CurrentUserData {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [supportCapabilities, setSupportCapabilities] = useState<string[]>([])
  const [platformSession, setPlatformSession] = useState<PlatformSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const authGenerationRef = useRef(0)

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const authGeneration = authGenerationRef.current + 1
      authGenerationRef.current = authGeneration

      try {
        setLoading(true)
        setError(null)

        const userData = await fetchCurrentUserData()

        if (authGeneration !== authGenerationRef.current) return

        setUsuario(userData.usuario)
        setRoles(userData.roles)
        setSupportCapabilities(userData.supportCapabilities)
        setPlatformSession(userData.platformSession)
      } catch (err) {
        if (authGeneration !== authGenerationRef.current) return

        console.error('Error en useCurrentUser:', err)
        setError(err instanceof Error ? err.message : 'Error desconocido')
        setUsuario(null)
        setRoles([])
        setSupportCapabilities([])
        setPlatformSession(null)
      } finally {
        if (authGeneration !== authGenerationRef.current) return

        setLoading(false)
      }
    }

    fetchCurrentUser()

    // Escuchar cambios en la autenticación
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      clearCurrentUserCache()
      if (event === 'SIGNED_OUT') {
        authGenerationRef.current += 1
        setUsuario(null)
        setRoles([])
        setSupportCapabilities([])
        setPlatformSession(null)
        setLoading(false)
      } else if (event === 'SIGNED_IN' && session) {
        authGenerationRef.current += 1
        fetchCurrentUser()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { usuario, roles, supportCapabilities, platformSession, loading, error }
}

async function resolveClientPlatformSession(input: {
  subjectAuthId: string
  usuario: Usuario | null
  globalRoles: string[]
}): Promise<PlatformSession | null> {
  const result = await buildPlatformSession({
    subjectAuthId: input.subjectAuthId,
    personaLookup: {
      findByAuthId: async (authId) => toClientPlatformPersona(input.usuario, authId),
    },
  })

  return result.ok ? { ...result.session, globalRoles: [...input.globalRoles] } : null
}

function toClientPlatformPersona(usuario: Usuario | null, authId: string): PlatformSessionPersona | null {
  if (!usuario?.id || usuario.auth_id !== authId) return null
  return { id: usuario.id, authId: usuario.auth_id }
}

function getRoleName(role: unknown) {
  if (typeof role !== 'object' || role === null || !('nombre_interno' in role)) return undefined
  const roleName = role.nombre_interno
  return typeof roleName === 'string' ? roleName : undefined
}
