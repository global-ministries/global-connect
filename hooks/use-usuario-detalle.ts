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
      // Traer relaciones donde el usuario es usuario1_id
      const { data: usuarioData, error: errorUsuario } = await supabase
        .from("usuarios")
        .select(`
          *,
          usuario_roles:usuario_roles!usuario_roles_usuario_id_fkey (
            *,
            roles_sistema:roles_sistema!usuario_roles_rol_id_fkey (
              nombre_interno,
              nombre_visible
            )
          )
        `)
        .eq("id", id)
        .maybeSingle()

      // Relaciones donde el usuario es usuario1_id
      const { data: rels1, error: errorRels1 } = await supabase
        .from("relaciones_usuarios")
        .select(`
          id,
          tipo_relacion,
          es_principal,
          usuario1_id,
          usuario2_id,
          familiar:usuarios!fk_usuario2_id (
            id,
            nombre,
            apellido,
            email,
            telefono,
            genero
          )
        `)
        .eq("usuario1_id", id)

      // Relaciones donde el usuario es usuario2_id
      const { data: rels2, error: errorRels2 } = await supabase
        .from("relaciones_usuarios")
        .select(`
          id,
          tipo_relacion,
          es_principal,
          usuario1_id,
          usuario2_id,
          familiar:usuarios!fk_usuario1_id (
            id,
            nombre,
            apellido,
            email,
            telefono,
            genero
          )
        `)
        .eq("usuario2_id", id)

      if (errorUsuario) {
        setError("Error al cargar usuario: " + errorUsuario.message)
        setUsuario(null)
      } else if (!usuarioData) {
        setError("Usuario no encontrado")
        setUsuario(null)
      } else {
        // Normalizar relaciones para el frontend
        const relaciones = []
        // usuario es usuario1_id (tipo_relacion tal cual)
        if (rels1) {
          for (const r of rels1) {
            relaciones.push({
              ...r,
              familiar: r.familiar,
              tipo_relacion: r.tipo_relacion,
              es_principal: r.es_principal,
              sentido: 'directo',
            })
          }
        }
        // usuario es usuario2_id (tipo_relacion inversa)
        if (rels2) {
          for (const r of rels2) {
            relaciones.push({
              ...r,
              familiar: r.familiar,
              tipo_relacion: r.tipo_relacion,
              es_principal: r.es_principal,
              sentido: 'inverso',
              // familiar es usuario1
            })
          }
        }
        setUsuario({ ...usuarioData, relaciones })
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
