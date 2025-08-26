"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/database.types"

type Usuario = Database["public"]["Tables"]["usuarios"]["Row"]
type Direccion = Database["public"]["Tables"]["direcciones"]["Row"]
type Familia = Database["public"]["Tables"]["familias"]["Row"]

interface UpdateUserData {
  // Información básica
  nombre: string
  apellido: string
  cedula?: string
  email?: string
  telefono?: string
  
  // Información personal
  fecha_nacimiento?: string
  estado_civil: "Soltero" | "Casado" | "Divorciado" | "Viudo"
  genero: "Masculino" | "Femenino" | "Otro"
  
  // Información profesional
  ocupacion_id?: string
  profesion_id?: string
  
  // Información de ubicación
  direccion?: {
    calle: string
    barrio?: string
    codigo_postal?: string
    referencia?: string
    pais_id?: string
    estado_id?: string
    municipio_id?: string
    parroquia_id?: string
  }
  
  // Información familiar
  familia?: {
    nombre: string
  }
}

export async function updateUser(userId: string, data: UpdateUserData) {
  try {
    console.log('🔄 Iniciando actualización del usuario:', userId)
    console.log('📝 Datos a actualizar:', data)

    // 1. Actualizar tabla usuarios
    const { error: errorUsuario } = await supabase
      .from('usuarios')
      .update({
        nombre: data.nombre,
        apellido: data.apellido,
        cedula: data.cedula || null,
        email: data.email || null,
        telefono: data.telefono || null,
        fecha_nacimiento: data.fecha_nacimiento || null,
        estado_civil: data.estado_civil,
        genero: data.genero,
        ocupacion_id: data.ocupacion_id || null,
        profesion_id: data.profesion_id || null,
      })
      .eq('id', userId)

    if (errorUsuario) {
      console.error('❌ Error al actualizar usuario:', errorUsuario)
      throw new Error(`Error al actualizar usuario: ${errorUsuario.message}`)
    }

    console.log('✅ Usuario actualizado exitosamente')
    console.log('📊 Campos actualizados:', {
      ocupacion_id: data.ocupacion_id || null,
      profesion_id: data.profesion_id || null
    })

    // 2. Manejar dirección
    if (data.direccion) {
      // Obtener dirección actual del usuario
      const { data: usuarioActual } = await supabase
        .from('usuarios')
        .select('direccion_id')
        .eq('id', userId)
        .single()

      if (usuarioActual?.direccion_id) {
        // Actualizar dirección existente
        const { error: errorDireccion } = await supabase
          .from('direcciones')
          .update({
            calle: data.direccion.calle,
            barrio: data.direccion.barrio || null,
            codigo_postal: data.direccion.codigo_postal || null,
            referencia: data.direccion.referencia || null,
            parroquia_id: data.direccion.parroquia_id || null,
          })
          .eq('id', usuarioActual.direccion_id)

        if (errorDireccion) {
          console.error('❌ Error al actualizar dirección:', errorDireccion)
          throw new Error(`Error al actualizar dirección: ${errorDireccion.message}`)
        }

        console.log('✅ Dirección actualizada exitosamente')
      } else {
        // Crear nueva dirección
        const { data: nuevaDireccion, error: errorDireccion } = await supabase
          .from('direcciones')
          .insert({
            calle: data.direccion.calle,
            barrio: data.direccion.barrio || null,
            codigo_postal: data.direccion.codigo_postal || null,
            referencia: data.direccion.referencia || null,
            parroquia_id: data.direccion.parroquia_id || null,
          })
          .select()
          .single()

        if (errorDireccion) {
          console.error('❌ Error al crear dirección:', errorDireccion)
          throw new Error(`Error al crear dirección: ${errorDireccion.message}`)
        }

        // Actualizar usuario con la nueva dirección
        const { error: errorUpdateDireccion } = await supabase
          .from('usuarios')
          .update({ direccion_id: nuevaDireccion.id })
          .eq('id', userId)

        if (errorUpdateDireccion) {
          console.error('❌ Error al actualizar usuario con dirección:', errorUpdateDireccion)
          throw new Error(`Error al actualizar usuario con dirección: ${errorUpdateDireccion.message}`)
        }

        console.log('✅ Nueva dirección creada y asignada al usuario')
      }
    }

    // 3. Manejar familia (solo si es necesario)
    if (data.familia && data.familia.nombre) {
      try {
        // Obtener familia actual del usuario
        const { data: usuarioActual } = await supabase
          .from('usuarios')
          .select('familia_id')
          .eq('id', userId)
          .single()

        if (usuarioActual?.familia_id) {
          // Solo actualizar si el nombre es diferente
          const { data: familiaActual } = await supabase
            .from('familias')
            .select('nombre')
            .eq('id', usuarioActual.familia_id)
            .single()

          if (familiaActual && familiaActual.nombre !== data.familia.nombre) {
            const { error: errorFamilia } = await supabase
              .from('familias')
              .update({
                nombre: data.familia.nombre,
              })
              .eq('id', usuarioActual.familia_id)

            if (errorFamilia) {
              console.error('⚠︝ Error al actualizar familia (continuando):', errorFamilia)
              // No lanzar error, continuar con la actualización del usuario
            } else {
              console.log('✅ Familia actualizada exitosamente')
            }
          } else {
            console.log('ℹ︝ Nombre de familia sin cambios, omitiendo actualización')
          }
        } else {
          // Crear nueva familia solo si no existe
          const { data: nuevaFamilia, error: errorFamilia } = await supabase
            .from('familias')
            .insert({
              nombre: data.familia.nombre,
            })
            .select()
            .single()

          if (errorFamilia) {
            console.error('⚠︝ Error al crear familia (continuando):', errorFamilia)
            // No lanzar error, continuar con la actualización del usuario
          } else {
            // Actualizar usuario con la nueva familia
            const { error: errorUpdateFamilia } = await supabase
              .from('usuarios')
              .update({ familia_id: nuevaFamilia.id })
              .eq('id', userId)

            if (errorUpdateFamilia) {
              console.error('⚠︝ Error al asignar familia al usuario (continuando):', errorUpdateFamilia)
            } else {
              console.log('✅ Nueva familia creada y asignada al usuario')
            }
          }
        }
      } catch (error) {
        console.error('⚠︝ Error en manejo de familia (continuando):', error)
        // No lanzar error, continuar con la actualización del usuario
      }
    }

    console.log('🎉 Usuario actualizado completamente')

    // 4. Invalidar caché de las páginas relacionadas
    revalidatePath('/dashboard/users')
    revalidatePath(`/dashboard/users/${userId}`)
    console.log('🔄 Caché invalidado para usuarios y detalle del usuario')

    // 5. Redirigir al usuario de vuelta a la página de detalle
    redirect(`/dashboard/users/${userId}`)

  } catch (error) {
    console.error('❌ Error en updateUser:', error)
    
    // Re-lanzar el error para que sea manejado por el componente
    throw error
  }
}

export async function deleteFamilyRelation(relationId: string, userId?: string) {
  try {
    const { error } = await supabase
      .from("relaciones_usuarios")
      .delete()
      .eq("id", relationId)

    if (error) {
      throw new Error(error.message)
    }

    // Revalida la página de detalle de usuario (usa el userId si está disponible)
    if (userId) {
      revalidatePath(`/dashboard/users/${userId}`)
    } else {
      revalidatePath("/dashboard/users/[id]")
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
