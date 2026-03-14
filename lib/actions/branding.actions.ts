"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getUserWithRoles } from "@/lib/getUserWithRoles"

const BUCKET = "logos"
const ROLES_ADMIN = ["admin", "pastor"]

/**
 * Tamaños de logo para el sistema:
 * - Sidebar desktop: 96px width
 * - Header móvil: 80px width  
 * - Welcome/login: 120px width
 * - Max para calidad 2x retina: 240px
 */
const LOGO_MAX_SIZE = 512 // max dimension
const FAVICON_MAX_SIZE = 64

/** Sube un logo al bucket de Supabase Storage y devuelve la URL pública */
async function subirImagen(
    file: File,
    tipo: "logo-light" | "logo-dark" | "favicon"
): Promise<string> {
    const admin = createSupabaseAdminClient()

    // Validar tipo MIME
    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
    if (tipo === "favicon") {
        allowedTypes.push("image/x-icon", "image/vnd.microsoft.icon")
    }

    if (!allowedTypes.includes(file.type)) {
        throw new Error(`Tipo de archivo no permitido: ${file.type}`)
    }

    // Validar tamaño (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        throw new Error("El archivo es demasiado grande (máximo 2MB)")
    }

    // Nombre del archivo con timestamp para cache busting
    const ext = file.name.split(".").pop() || "png"
    const filename = `${tipo}-${Date.now()}.${ext}`

    // Convertir a buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Subir a Supabase Storage (upsert para sobreescribir si existe)
    const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(filename, buffer, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: true,
        })

    if (uploadError) {
        throw new Error(`Error al subir archivo: ${uploadError.message}`)
    }

    // Obtener URL pública
    const { data: urlData } = admin.storage
        .from(BUCKET)
        .getPublicUrl(filename)

    return urlData.publicUrl
}

/** Obtiene la configuración de branding actual */
export async function obtenerConfiguracionPlataforma() {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
        .from("configuracion_plataforma")
        .select("*")
        .limit(1)
        .single()

    if (error) {
        console.error("Error obteniendo config plataforma:", error)
        return null
    }

    return data
}

/** Guarda la configuración de branding (logos + colores) */
export async function guardarConfiguracionBranding(formData: FormData) {
    const supabase = await createSupabaseServerClient()
    const userData = await getUserWithRoles(supabase)

    if (!userData || !userData.roles.some((r) => ROLES_ADMIN.includes(r))) {
        return { success: false, error: "Sin permisos" }
    }

    try {
        const updates: Record<string, string | null> = {}

        // Procesar logo claro
        const logoLight = formData.get("logo_light") as File | null
        if (logoLight && logoLight.size > 0) {
            const url = await subirImagen(logoLight, "logo-light")
            updates.logo_light_url = url
        }

        // Procesar logo oscuro
        const logoDark = formData.get("logo_dark") as File | null
        if (logoDark && logoDark.size > 0) {
            const url = await subirImagen(logoDark, "logo-dark")
            updates.logo_dark_url = url
        }

        // Procesar favicon
        const favicon = formData.get("favicon") as File | null
        if (favicon && favicon.size > 0) {
            const url = await subirImagen(favicon, "favicon")
            updates.favicon_url = url
        }

        // Colores
        const colorPrimario = formData.get("color_primario") as string | null
        if (colorPrimario) updates.color_primario = colorPrimario

        const colorSecundario = formData.get("color_secundario") as string | null
        if (colorSecundario) updates.color_secundario = colorSecundario

        // Flags para eliminar logos
        if (formData.get("eliminar_logo_light") === "true") {
            updates.logo_light_url = null
        }
        if (formData.get("eliminar_logo_dark") === "true") {
            updates.logo_dark_url = null
        }
        if (formData.get("eliminar_favicon") === "true") {
            updates.favicon_url = null
        }

        if (Object.keys(updates).length === 0) {
            return { success: true, message: "Sin cambios" }
        }

        // Actualizar la configuración (singleton)
        const admin = createSupabaseAdminClient()
        const { error: updateError } = await admin
            .from("configuracion_plataforma")
            .update(updates)
            .not("id", "is", null) // Update all rows (singleton)

        if (updateError) {
            console.error("Error actualizando branding:", updateError)
            return { success: false, error: updateError.message }
        }

        // Obtener la config actualizada para devolver
        const { data: config } = await admin
            .from("configuracion_plataforma")
            .select("*")
            .limit(1)
            .single()

        return {
            success: true,
            message: "Branding actualizado correctamente",
            data: config,
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido"
        return { success: false, error: msg }
    }
}

/** Guarda los datos de la organización (nombre, email, dirección, teléfono) */
export async function guardarDatosOrganizacion(datos: {
    nombre: string
    email: string
    direccion: string
    telefono: string
}) {
    const supabase = await createSupabaseServerClient()
    const userData = await getUserWithRoles(supabase)

    if (!userData || !userData.roles.some((r) => ROLES_ADMIN.includes(r))) {
        return { success: false, error: "Sin permisos" }
    }

    try {
        const admin = createSupabaseAdminClient()

        const { error: updateError } = await admin
            .from("configuracion_plataforma")
            .update({
                nombre_organizacion: datos.nombre.trim() || null,
                email_contacto: datos.email.trim() || null,
                direccion: datos.direccion.trim() || null,
                telefono: datos.telefono.trim() || null,
            })
            .not("id", "is", null) // Update singleton

        if (updateError) {
            console.error("Error actualizando org:", updateError)
            return { success: false, error: updateError.message }
        }

        return {
            success: true,
            message: "Datos de la organización actualizados",
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido"
        return { success: false, error: msg }
    }
}
