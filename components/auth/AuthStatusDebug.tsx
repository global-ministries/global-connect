"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase/client"

export function AuthStatusDebug() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // Obtener el usuario actual al montar
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUser(data?.user ?? null)
        setLoading(false)
      }
    })

    // Suscribirse a cambios de sesiï¿½n
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      listener?.subscription.unsubscribe()
    }
  }, [])

  return (
    <div className="border rounded-lg p-3 text-sm mt-2 max-w-xs">
      {loading ? (
        <span>Verificando sesiï¿½n...</span>
      ) : user ? (
        <div>
          <span className="text-green-600 font-bold">ESTADO: Autenticado</span>
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
