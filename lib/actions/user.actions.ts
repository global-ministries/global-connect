"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/database.types"

// Elimina una relación familiar usando la función RPC y revalida la página de detalle
export async function deleteFamilyRelation(relationId: string, userId: string) {
  const supabase = createSupabaseServerClient();
  try {
    const { data, error } = await supabase.rpc('eliminar_relacion_familiar', { p_relacion_id: relationId });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data && data.error) {
      return { success: false, error: data.error };
    }
    revalidatePath(`/dashboard/users/${userId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error inesperado' };
  }
}

type Usuario = Database["public"]["Tables"]["usuarios"]["Row"]
type Direccion = Database["public"]["Tables"]["direcciones"]["Row"]
type Familia = Database["public"]["Tables"]["familias"]["Row"]

interface UpdateUserData {
  // InformaciÃ³n bÃ¡sica
  nombre: string
  apellido: string
  cedula?: string
  email?: string
  telefono?: string
  
  // InformaciÃ³n personal
  fecha_nacimiento?: string
  estado_civil: "Soltero" | "Casado" | "Divorciado" | "Viudo"
  genero: "Masculino" | "Femenino" | "Otro"
  
  // InformaciÃ³n profesional
  ocupacion_id?: string
  profesion_id?: string
  
  // InformaciÃ³n de ubicaciÃ³n
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
  
  // InformaciÃ³n familiar
  familia?: {
    nombre: string
  }
}

export async function updateUser(userId: string, data: UpdateUserData) {
  const supabase = createSupabaseServerClient();
  try {
    console.log('ðŸ”„ Iniciando actualizaciÃ³n del usuario:', userId)
    console.log('ðŸ“� Datos a actualizar:', data)

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
      console.error('â�Œ Error al actualizar usuario:', errorUsuario)
      throw new Error(`Error al actualizar usuario: ${errorUsuario.message}`)
    }

    console.log('âœ… Usuario actualizado exitosamente')
    console.log('ðŸ“Š Campos actualizados:', {
      ocupacion_id: data.ocupacion_id || null,
      profesion_id: data.profesion_id || null
    })

    // 2. Manejar direcciÃ³n
    if (data.direccion) {
      // Obtener direcciÃ³n actual del usuario
      const { data: usuarioActual } = await supabase
        .from('usuarios')
        .select('direccion_id')
        .eq('id', userId)
        .single()

      if (usuarioActual?.direccion_id) {
        // Actualizar direcciÃ³n existente
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
          console.error('â�Œ Error al actualizar direcciÃ³n:', errorDireccion)
          throw new Error(`Error al actualizar direcciÃ³n: ${errorDireccion.message}`)
        }

        console.log('âœ… DirecciÃ³n actualizada exitosamente')
      } else {
        // Crear nueva direcciÃ³n
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
          console.error('â�Œ Error al crear direcciÃ³n:', errorDireccion)
          throw new Error(`Error al crear direcciÃ³n: ${errorDireccion.message}`)
        }

        // Actualizar usuario con la nueva direcciÃ³n
        const { error: errorUpdateDireccion } = await supabase
          .from('usuarios')
          .update({ direccion_id: nuevaDireccion.id })
          .eq('id', userId)

        if (errorUpdateDireccion) {
          console.error('â�Œ Error al actualizar usuario con direcciÃ³n:', errorUpdateDireccion)
          throw new Error(`Error al actualizar usuario con direcciÃ³n: ${errorUpdateDireccion.message}`)
        }

        console.log('âœ… Nueva direcciÃ³n creada y asignada al usuario')
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
              console.error('âš ï¸� Error al actualizar familia (continuando):', errorFamilia)
              // No lanzar error, continuar con la actualizaciÃ³n del usuario
            } else {
              console.log('âœ… Familia actualizada exitosamente')
            }
          } else {
            console.log('â„¹ï¸� Nombre de familia sin cambios, omitiendo actualizaciÃ³n')
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
            console.error('âš ï¸� Error al crear familia (continuando):', errorFamilia)
            // No lanzar error, continuar con la actualizaciÃ³n del usuario
          } else {
            // Actualizar usuario con la nueva familia
            const { error: errorUpdateFamilia } = await supabase
              .from('usuarios')
              .update({ familia_id: nuevaFamilia.id })
              .eq('id', userId)

            if (errorUpdateFamilia) {
              console.error('âš ï¸� Error al asignar familia al usuario (continuando):', errorUpdateFamilia)
            } else {
              console.log('âœ… Nueva familia creada y asignada al usuario')
            }
          }
        }
      } catch (error) {
        console.error('âš ï¸� Error en manejo de familia (continuando):', error)
        // No lanzar error, continuar con la actualizaciÃ³n del usuario
      }
    }

    console.log('ðŸŽ‰ Usuario actualizado completamente')

    // 4. Invalidar cachÃ© de las pÃ¡ginas relacionadas
    revalidatePath('/dashboard/users')
    revalidatePath(`/dashboard/users/${userId}`)
    console.log('ðŸ”„ CachÃ© invalidado para usuarios y detalle del usuario')

    // 5. Redirigir al usuario de vuelta a la pÃ¡gina de detalle
    redirect(`/dashboard/users/${userId}`)

  } catch (error) {
    console.error('â�Œ Error en updateUser:', error)
    
    // Re-lanzar el error para que sea manejado por el componente
    throw error
  }
}
export async function addFamilyRelation({
  usuario1_id,
  usuario2_id,
  tipo_relacion,
}: {
  usuario1_id: string
  usuario2_id: string
  tipo_relacion: string
}) {
  const supabase = createSupabaseServerClient()
  try {

    // Validar duplicados: solo una relación entre los mismos usuarios (en cualquier orden, sin importar tipo)
    const { data: existing, error: errorExisting } = await supabase
      .from('relaciones_usuarios')
      .select('id')
      .or(
        `and(usuario1_id.eq.${usuario1_id},usuario2_id.eq.${usuario2_id})` +
        `,and(usuario1_id.eq.${usuario2_id},usuario2_id.eq.${usuario1_id})`
      )
      .limit(1)

    if (errorExisting) {
      return { success: false, message: errorExisting.message }
    }

    if (existing && existing.length > 0) {
      return { success: false, message: 'Ya existe una relación entre estos usuarios' }
    }

    // Insertar una sola fila representando la relación desde la perspectiva de usuario1
    const { data: inserted, error: errorInsert } = await supabase
      .from('relaciones_usuarios')
      .insert({
        usuario1_id,
        usuario2_id,
        tipo_relacion,
        es_principal: false,
      })
      .select()
      .maybeSingle()

    if (errorInsert) {
      return { success: false, message: errorInsert.message }
    }

    revalidatePath(`/dashboard/users/${usuario1_id}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, message: err?.message || "Error inesperado" }
  }
}
