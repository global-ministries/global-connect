import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"

export function useUsuarioDetalle(id: string) {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)


  const recargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Usar la función RPC que ya retorna el JSON con relaciones en ambos sentidos
      const { data, error } = await supabase
        .rpc('obtener_detalle_usuario', { p_user_id: id })
        .single()

      if (error) {
        setError("Error al cargar usuario: " + error.message)
        setUsuario(null)
      } else if (!data) {
        setError("Usuario no encontrado")
        setUsuario(null)
      } else {
        setUsuario(data)
      }
    } catch (err: any) {
      setError("Error inesperado al cargar usuario")
      setUsuario(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { usuario, loading, error, recargar }
}
