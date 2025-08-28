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
      // Corrige el embed de relaciones familiares para que siempre traiga los datos del familiar
      const { data, error: errorUsuario } = await supabase
        .from("usuarios")
        .select(
          `
            *,
            usuario_roles:usuario_roles!usuario_roles_usuario_id_fkey (
              *,
              roles_sistema:roles_sistema!usuario_roles_rol_id_fkey (
                nombre_interno,
                nombre_visible
              )
            ),
            relaciones_familiares:relaciones_usuarios!relaciones_usuarios_usuario1_id_fkey (
              id,
              tipo_relacion,
              es_principal,
              familiar:usuarios!fk_usuario2_id (
                id,
                nombre,
                apellido,
                email,
                telefono,
                genero
              )
            )
          `
        )
        .eq("id", id)
        .maybeSingle()

      if (errorUsuario) {
        setError("Error al cargar usuario: " + errorUsuario.message)
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
