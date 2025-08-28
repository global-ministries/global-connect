"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

export function UserList() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    supabase
      .from("usuarios")
      .select("*")
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          setError("Error al cargar usuarios")
          setUsuarios([])
        } else {
          setUsuarios(data || [])
        }
        setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <span className="text-gray-500">Cargando usuarios...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center py-10">
        <span className="text-red-500">{error}</span>
      </div>
    )
  }

  if (!usuarios.length) {
    return (
      <div className="flex justify-center py-10">
        <span className="text-gray-500">No hay usuarios para mostrar.</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {usuarios.map((usuario) => (
        <div key={usuario.id} className="p-4 border rounded-xl bg-white shadow-sm">
          <div className="font-semibold">{usuario.nombre} {usuario.apellido}</div>
          <div className="text-sm text-gray-500">{usuario.email}</div>
        </div>
      ))}
    </div>
  )
}
