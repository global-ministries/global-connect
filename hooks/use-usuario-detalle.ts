import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { invertirRelacion, esRelacionReciproca } from '@/lib/config/relaciones-familiares'

type Usuario = Database["public"]["Tables"]["usuarios"]["Row"]
type UsuarioRol = Database["public"]["Tables"]["usuario_roles"]["Row"]
type RolSistema = Database["public"]["Tables"]["roles_sistema"]["Row"]
type Direccion = Database["public"]["Tables"]["direcciones"]["Row"]
type Familia = Database["public"]["Tables"]["familias"]["Row"]
type Ocupacion = Database["public"]["Tables"]["ocupaciones"]["Row"]
type Profesion = Database["public"]["Tables"]["profesiones"]["Row"]
type RelacionUsuario = Database["public"]["Tables"]["relaciones_usuarios"]["Row"]

export type UsuarioDetallado = Usuario & {
  usuario_roles?: {
    rol_id: string
    usuario_id: string
    roles_sistema?: RolSistema
  }[]
  direccion?: Direccion
  familia?: Familia
  ocupacion?: Ocupacion
  profesion?: Profesion
  relaciones_familiares?: {
    id: string
    tipo_relacion: Database["public"]["Enums"]["enum_tipo_relacion"]
    es_principal: boolean | null
    familiar: Usuario
  }[]
}

export function useUsuarioDetalle(id: string) {
  const [usuario, setUsuario] = useState<UsuarioDetallado | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const cargarUsuario = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Obtener el usuario básico
      const { data: usuarioBasico, error: errorUsuario } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', id)
        .single()

      if (errorUsuario) {
        console.error('Error al obtener usuario básico:', errorUsuario)
        setError(`Error al cargar usuario: ${errorUsuario.message}`)
        return
      }

      // Obtener los roles del usuario
      const { data: usuarioRoles, error: errorRoles } = await supabase
        .from('usuario_roles')
        .select('rol_id, usuario_id')
        .eq('usuario_id', id)

      // Obtener información de los roles del sistema
      let rolesCompletos: { rol_id: string; usuario_id: string; roles_sistema?: RolSistema }[] = []
      if (usuarioRoles && usuarioRoles.length > 0) {
        const rolIds = usuarioRoles.map(ur => ur.rol_id)
        const { data: rolesSistema, error: errorRolesSistema } = await supabase
          .from('roles_sistema')
          .select('id, nombre_interno, nombre_visible')
          .in('id', rolIds)

        if (!errorRolesSistema && rolesSistema) {
          rolesCompletos = usuarioRoles.map(ur => ({
            rol_id: ur.rol_id,
            usuario_id: ur.usuario_id,
            roles_sistema: rolesSistema.find(rs => rs.id === ur.rol_id)
          }))
        }
      }

      // Obtener dirección si existe
      let direccion: Direccion | undefined = undefined
      if (usuarioBasico.direccion_id) {
        const { data: dirData, error: errorDir } = await supabase
          .from('direcciones')
          .select(`
            *,
            parroquia: parroquias!direcciones_parroquia_id_fkey (
              id,
              nombre,
              municipio: municipios!parroquias_municipio_id_fkey (
                id,
                nombre,
                estado: estados!municipios_estado_id_fkey (
                  id,
                  nombre,
                  pais: paises!estados_pais_id_fkey (
                    id,
                    nombre
                  )
                )
              )
            )
          `)
          .eq('id', usuarioBasico.direccion_id)
          .single()
        
        if (!errorDir) {
          direccion = dirData
        }
      }

      // Obtener familia si existe
      let familia: Familia | undefined = undefined
      if (usuarioBasico.familia_id) {
        const { data: famData, error: errorFam } = await supabase
          .from('familias')
          .select('*')
          .eq('id', usuarioBasico.familia_id)
          .single()
        
        if (!errorFam) {
          familia = famData
        }
      }

      // Obtener ocupación si existe
      let ocupacion: Ocupacion | undefined = undefined
      if (usuarioBasico.ocupacion_id) {
        const { data: ocData, error: errorOc } = await supabase
          .from('ocupaciones')
          .select('*')
          .eq('id', usuarioBasico.ocupacion_id)
          .single()
        
        if (!errorOc) {
          ocupacion = ocData
        }
      }

      // Obtener profesión si existe
      let profesion: Profesion | undefined = undefined
      if (usuarioBasico.profesion_id) {
        const { data: profData, error: errorProf } = await supabase
          .from('profesiones')
          .select('*')
          .eq('id', usuarioBasico.profesion_id)
          .single()
        
        if (!errorProf) {
          profesion = profData
        }
      }

      // Obtener relaciones familiares si existen
      let relacionesFamiliares: {
        id: string
        tipo_relacion: Database["public"]["Enums"]["enum_tipo_relacion"]
        es_principal: boolean | null
        familiar: Usuario
      }[] | undefined = undefined

      // Buscar relaciones donde este usuario es usuario1 o usuario2
      const { data: relaciones, error: errorRelaciones } = await supabase
        .from('relaciones_usuarios')
        .select('id, tipo_relacion, es_principal, usuario1_id, usuario2_id')
        .or(`usuario1_id.eq.${id},usuario2_id.eq.${id}`)

      if (!errorRelaciones && relaciones && relaciones.length > 0) {
        // Obtener los IDs de los usuarios relacionados
        const idsRelacionados = relaciones.map(r => {
          const esUsuario1 = r.usuario1_id === id
          return esUsuario1 ? r.usuario2_id : r.usuario1_id
        })

        // Obtener información de los usuarios relacionados
        const { data: usuariosFamiliares, error: errorUsuariosFamiliares } = await supabase
          .from('usuarios')
          .select('*')
          .in('id', idsRelacionados)

        if (!errorUsuariosFamiliares && usuariosFamiliares) {
          relacionesFamiliares = relaciones.map(r => {
            const esUsuario1 = r.usuario1_id === id
            const familiarId = esUsuario1 ? r.usuario2_id : r.usuario1_id
            const familiar = usuariosFamiliares.find(uf => uf.id === familiarId)
            
            // Invertir la relación si el usuario actual es usuario1_id
            let tipoRelacionMostrado: any = r.tipo_relacion
            if (esUsuario1) {
              // Solo invertir si la relación no es recíproca
              if (!esRelacionReciproca(r.tipo_relacion)) {
                const relacionInvertida = invertirRelacion(r.tipo_relacion)
                if (relacionInvertida) {
                  tipoRelacionMostrado = relacionInvertida
                }
              }
            }
            
            return {
              id: r.id,
              tipo_relacion: tipoRelacionMostrado,
              es_principal: r.es_principal,
              familiar: familiar!,
            }
          }).filter(r => r.familiar)
        }
      }

      // Construir el objeto completo del usuario
      const usuarioCompleto: UsuarioDetallado = {
        ...usuarioBasico,
        usuario_roles: rolesCompletos,
        direccion,
        familia,
        ocupacion,
        profesion,
        relaciones_familiares: relacionesFamiliares
      }

      setUsuario(usuarioCompleto)

    } catch (err) {
      console.error('Error inesperado:', err)
      setError('Error inesperado al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) {
      cargarUsuario()
    }
  }, [id])

  return {
    usuario,
    loading,
    error,
    recargar: cargarUsuario
  }
}
