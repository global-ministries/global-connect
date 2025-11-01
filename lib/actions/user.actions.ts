"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/database.types"

// Elimina una relación familiar usando la función RPC y revalida la página de detalle
export async function deleteFamilyRelation(relationId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
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
    lat?: number
    lng?: number
  }
  
  // InformaciÃ³n familiar
  familia?: {
    nombre: string
  }
}

export async function updateUser(userId: string, data: UpdateUserData, esPerfil: boolean = false) {
  const supabase = createSupabaseAdminClient();
  try {
    // Saneamiento de claves foráneas
    const datosSaneados = {
      ...data,
      ocupacion_id: (!data.ocupacion_id || data.ocupacion_id === "none") ? null : data.ocupacion_id,
      profesion_id: (!data.profesion_id || data.profesion_id === "none") ? null : data.profesion_id,
      // familia_id no se recibe directamente en UpdateUserData, pero sí se puede usar en payloads internos
    };

    // 1. Log de entrada
    console.log('[updateUser] Datos recibidos:', datosSaneados);

    // 2. Actualizar tabla usuarios
    const { data: usuarioActualizado, error: errorUsuario } = await supabase
      .from('usuarios')
      .update({
        nombre: datosSaneados.nombre,
        apellido: datosSaneados.apellido,
        cedula: datosSaneados.cedula || null,
        email: datosSaneados.email || null,
        telefono: datosSaneados.telefono || null,
        fecha_nacimiento: datosSaneados.fecha_nacimiento || null,
        estado_civil: datosSaneados.estado_civil,
        genero: datosSaneados.genero,
        ocupacion_id: datosSaneados.ocupacion_id,
        profesion_id: datosSaneados.profesion_id,
      })
      .eq('id', userId)
      .select()
      .single();

    console.log('[updateUser] Resultado update usuarios:', usuarioActualizado, errorUsuario);

    if (errorUsuario) {
      throw new Error(`Error al actualizar usuario: ${errorUsuario.message}`);
    }

    // 3. Manejar dirección (estrategia upsert robusta)
    if (data.direccion) {
      // a. Obtener direccion_id actual
      const { data: usuarioActual, error: errorUsuarioActual } = await supabase
        .from('usuarios')
        .select('direccion_id')
        .eq('id', userId)
        .single();

      if (errorUsuarioActual) {
        throw new Error(`Error al obtener usuario: ${errorUsuarioActual.message}`);
      }

      const direccionId = usuarioActual?.direccion_id ?? null;
      const direccionData = {
        calle: data.direccion.calle,
        barrio: data.direccion.barrio ?? null,
        codigo_postal: data.direccion.codigo_postal ?? null,
        referencia: data.direccion.referencia ?? null,
        parroquia_id: data.direccion.parroquia_id ?? null,
        latitud: data.direccion.lat ?? null,
        longitud: data.direccion.lng ?? null,
        ...(direccionId ? { id: direccionId } : {}),
      };

      // b. Upsert en direcciones
      const { data: upsertedDireccion, error: errorUpsertDireccion } = await supabase
        .from('direcciones')
        .upsert([direccionData], { onConflict: 'id' })
        .select('id')
        .single();

      if (errorUpsertDireccion) {
        throw new Error(`Error al guardar dirección: ${errorUpsertDireccion.message}`);
      }

      // c. Si el usuario no tenía dirección, vincularla
      if (!direccionId && upsertedDireccion?.id) {
        const { error: errorUpdateUsuarioDireccion } = await supabase
          .from('usuarios')
          .update({ direccion_id: upsertedDireccion.id })
          .eq('id', userId);
        if (errorUpdateUsuarioDireccion) {
          throw new Error(`Error al asignar dirección al usuario: ${errorUpdateUsuarioDireccion.message}`);
        }
      }
    }

    // 4. Manejar familia (sin cambios)
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

    // 5. Invalidar cachÃ© de las pÃ¡ginas relacionadas
    revalidatePath('/dashboard/users')
    revalidatePath(`/dashboard/users/${userId}`)
    console.log('[updateUser] CachÃ© invalidado para usuarios y detalle del usuario')

    // 6. Redirigir condicionalmente
    if (!esPerfil) {
      // Solo redirigir si NO es perfil (edición de usuario normal)
      redirect(`/dashboard/users/${userId}`)
    }
    // Si es perfil, no redirigir - se maneja en el cliente

  } catch (error) {
    console.error('Error en updateUser:', error);
    throw error;
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
  const supabase = createSupabaseAdminClient()
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


export async function createUser(data: {
  nombre: string
  apellido: string
  cedula?: string
  email?: string
  telefono?: string
  fecha_nacimiento?: string
  genero?: string
  estado_civil?: string
}) {
  const supabaseAdmin = createSupabaseAdminClient()

  const mapearErrorBD = (e: any): string => {
    const code = e?.code as string | undefined
    const msg = (e?.message as string | undefined) || ""
    const details = (e?.details as string | undefined) || ""
    const texto = `${msg} ${details}`.toLowerCase()
    if (code === '23505') {
      if (texto.includes('usuarios_email') || texto.includes('email')) return 'El email ya se encuentra registrado.'
      if (texto.includes('usuarios_cedula') || texto.includes('cedula') || texto.includes('cédula')) return 'La cédula ya se encuentra registrada.'
      return 'Registro duplicado: ya existe un usuario con datos iguales.'
    }
    if (code === '23502') {
      if (texto.includes('nombre')) return 'El nombre es obligatorio.'
      if (texto.includes('apellido')) return 'El apellido es obligatorio.'
      if (texto.includes('genero') || texto.includes('género')) return 'El género es obligatorio.'
      if (texto.includes('estado_civil')) return 'El estado civil es obligatorio.'
      return 'Faltan campos obligatorios.'
    }
    if (code === '22P02' || code === '22007') {
      if (texto.includes('fecha') || texto.includes('date')) return 'La fecha tiene un formato inválido.'
      return 'Alguno de los campos tiene un formato inválido.'
    }
    if (code === '23503') return 'Alguna referencia no es válida. Verifica la información ingresada.'
    return msg || 'No se pudo crear el usuario. Intenta nuevamente.'
  }

  try {
    const { data: newUser, error: userError } = await supabaseAdmin
      .from("usuarios")
      .insert({
        nombre: data.nombre,
        apellido: data.apellido,
        cedula: (data.cedula || '').trim() === '' ? null : data.cedula,
        email: (data.email || '').trim() === '' ? null : (data.email || undefined),
        telefono: (data.telefono || '').trim() === '' ? null : data.telefono,
        fecha_nacimiento: (data.fecha_nacimiento || '').trim() === '' ? null : data.fecha_nacimiento,
        genero: data.genero,
        estado_civil: data.estado_civil,
      })
      .select("id")
      .single()

    if (userError) {
      return { ok: false, error: mapearErrorBD(userError) }
    }
    if (!newUser) {
      return { ok: false, error: 'No se pudo crear el usuario.' }
    }

    const newUserId = String(newUser.id)

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("roles_sistema")
      .select("id")
      .eq("nombre_interno", "miembro")
      .single()
    
    if (roleError || !roleData) {
      return { ok: false, error: 'No fue posible asignar el rol de miembro (rol no encontrado).' }
    }
    
    const miembroRoleId = roleData.id
    const { error: roleAssignmentError } = await supabaseAdmin
      .from("usuario_roles")
      .insert({ usuario_id: newUserId, rol_id: miembroRoleId })
    
    if (roleAssignmentError) {
      return { ok: false, error: 'Se creó el usuario, pero no se pudo asignar el rol de miembro automáticamente. Puedes asignarlo manualmente.' }
    }
    
    return { ok: true, id: newUserId }
  } catch (e: any) {
    return { ok: false, error: mapearErrorBD(e) }
  }
}

//
