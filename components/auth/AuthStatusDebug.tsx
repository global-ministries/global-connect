"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase/client"

export function AuthStatusDebug() {
  const [user, setUser] = useState<any>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchRoles(authId: string | undefined | null) {
    if (!authId) return setRoles([])
    try {
      const { data, error } = await supabase.rpc("obtener_roles_usuario", { p_auth_id: authId })
      if (error) {
        console.log("[AuthStatusDebug] Error roles:", error)
        setRoles([])
        return
      }
      const parsed: string[] = Array.isArray(data)
        ? data.map((r: any) => (typeof r === "string" ? r : r?.nombre_interno)).filter(Boolean)
        : []
      setRoles(parsed)
    } catch (e) {
      console.log("[AuthStatusDebug] Excepción roles:", e)
      setRoles([])
    }
  }

  useEffect(() => {
    let mounted = true

    // Obtener el usuario actual al montar
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      setUser(data?.user ?? null)
      setLoading(false)
      fetchRoles(data?.user?.id)
    })

    // Suscribirse a cambios de sesión
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      setLoading(false)
      fetchRoles(session?.user?.id)
    })

    return () => {
      mounted = false
      listener?.subscription.unsubscribe()
    }
  }, [])

  const rolActual = roles?.[0] || null

  return (
    <div className="border rounded-lg p-3 text-sm mt-2 max-w-xs">
      {loading ? (
        <span>Verificando sesión...</span>
      ) : user ? (
        <div>
          <span className="text-green-600 font-bold">ESTADO: Autenticado</span>
          {rolActual && (
            <div className="mt-1"><span className="block">Rol: <span className="font-mono">{rolActual}</span></span></div>
          )}
          <div className="mt-1">
            <span className="block">Email: <span className="font-mono">{user.email}</span></span>
            <span className="block">ID: <span className="font-mono">{user.id}</span></span>
          </div>
        </div>
      ) : (
        <span className="text-red-600 font-bold">ESTADO: No Autenticado</span>
      )}
    </div>
  )
}
