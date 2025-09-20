"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { redirect } from "next/navigation"

// Configuración para fotos de perfil
const PROFILE_PHOTOS_BUCKET = "profile-photos"
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const IMAGE_QUALITY = 0.8
const MAX_WIDTH = 800
const MAX_HEIGHT = 800

// Función para validar archivo de imagen
function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "No se seleccionó ningún archivo" }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "El archivo es demasiado grande. Máximo 5MB." }
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: "Tipo de archivo no permitido. Solo JPG, PNG y WebP." }
  }

  return { valid: true }
}

// Función para generar nombre único de archivo
function generateUniqueFileName(userId: string, originalName: string): string {
  const timestamp = Date.now()
  const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg'
  return `${userId}_${timestamp}.${extension}`
}

// Función para redimensionar imagen en el cliente (se llamará desde el componente)
export async function processImageFile(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      // Calcular nuevas dimensiones manteniendo aspect ratio
      let { width, height } = img
      
      if (width > height) {
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width
          width = MAX_WIDTH
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = (width * MAX_HEIGHT) / height
          height = MAX_HEIGHT
        }
      }

      canvas.width = width
      canvas.height = height

      // Dibujar imagen redimensionada
      ctx?.drawImage(img, 0, 0, width, height)

      // Convertir a blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Error al procesar la imagen'))
          }
        },
        'image/jpeg',
        IMAGE_QUALITY
      )
    }

    img.onerror = () => reject(new Error('Error al cargar la imagen'))
    img.src = URL.createObjectURL(file)
  })
}

// Subir foto de perfil
export async function uploadProfilePhoto(formData: FormData) {
  try {
    const supabase = await createSupabaseServerClient()
    const admin = createSupabaseAdminClient()

    // Obtener usuario actual
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "Usuario no autenticado" }
    }

    // Obtener archivo del FormData
    const file = formData.get('photo') as File
    if (!file) {
      return { success: false, error: "No se encontró el archivo" }
    }

    // Validar archivo
    const validation = validateImageFile(file)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // Generar nombre único
    const fileName = generateUniqueFileName(user.id, file.name)
    const filePath = `${user.id}/${fileName}`

    // Obtener foto anterior para eliminarla
    const { data: userData } = await admin
      .from('usuarios')
      .select('foto_perfil_url')
      .eq('auth_id', user.id)
      .single()

    // Subir nueva foto
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Error al subir archivo:', uploadError)
      return { success: false, error: "Error al subir la imagen" }
    }

    // Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .getPublicUrl(filePath)

    // Actualizar URL en base de datos
    const { error: updateError } = await admin
      .from('usuarios')
      .update({ foto_perfil_url: publicUrl })
      .eq('auth_id', user.id)

    if (updateError) {
      console.error('Error al actualizar BD:', updateError)
      // Eliminar archivo subido si falla la actualización de BD
      await supabase.storage
        .from(PROFILE_PHOTOS_BUCKET)
        .remove([filePath])
      return { success: false, error: "Error al actualizar perfil" }
    }

    // Eliminar foto anterior si existe
    if (userData?.foto_perfil_url) {
      try {
        const oldPath = userData.foto_perfil_url.split('/').slice(-2).join('/')
        await supabase.storage
          .from(PROFILE_PHOTOS_BUCKET)
          .remove([oldPath])
      } catch (error) {
        console.warn('No se pudo eliminar foto anterior:', error)
      }
    }

    return { 
      success: true, 
      photoUrl: publicUrl,
      message: "Foto de perfil actualizada exitosamente" 
    }

  } catch (error) {
    console.error('Error en uploadProfilePhoto:', error)
    return { success: false, error: "Error interno del servidor" }
  }
}

// Eliminar foto de perfil
export async function deleteProfilePhoto() {
  try {
    const supabase = await createSupabaseServerClient()
    const admin = createSupabaseAdminClient()

    // Obtener usuario actual
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "Usuario no autenticado" }
    }

    // Obtener URL actual
    const { data: userData } = await admin
      .from('usuarios')
      .select('foto_perfil_url')
      .eq('auth_id', user.id)
      .single()

    if (!userData?.foto_perfil_url) {
      return { success: false, error: "No hay foto para eliminar" }
    }

    // Extraer path del archivo
    const filePath = userData.foto_perfil_url.split('/').slice(-2).join('/')

    // Eliminar archivo de storage
    const { error: deleteError } = await supabase.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .remove([filePath])

    if (deleteError) {
      console.error('Error al eliminar archivo:', deleteError)
    }

    // Actualizar BD (remover URL)
    const { error: updateError } = await admin
      .from('usuarios')
      .update({ foto_perfil_url: null })
      .eq('auth_id', user.id)

    if (updateError) {
      console.error('Error al actualizar BD:', updateError)
      return { success: false, error: "Error al actualizar perfil" }
    }

    return { 
      success: true, 
      message: "Foto de perfil eliminada exitosamente" 
    }

  } catch (error) {
    console.error('Error en deleteProfilePhoto:', error)
    return { success: false, error: "Error interno del servidor" }
  }
}

// Obtener URL de foto de perfil de un usuario
export async function getUserProfilePhoto(userId: string): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient()
    
    const { data, error } = await admin
      .from('usuarios')
      .select('foto_perfil_url')
      .eq('id', userId)
      .single()

    if (error || !data?.foto_perfil_url) {
      return null
    }

    return data.foto_perfil_url
  } catch (error) {
    console.error('Error al obtener foto de perfil:', error)
    return null
  }
}
