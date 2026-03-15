"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ---------- Validación ----------
const segmentoSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido").max(100),
  descripcion: z.string().max(500).optional().nullable(),
})

// ---------- Helpers ----------
const ROLES_PERMITIDOS = ["admin", "pastor", "director-general", "director-etapa"]

async function verificarAcceso() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) throw new Error("No autenticado")
  const autorizado = userData.roles.some((r) => ROLES_PERMITIDOS.includes(r))
  if (!autorizado) throw new Error("No autorizado")
  return { supabase, userData }
}

/**
 * Crea un nuevo segmento en la base de datos.
 *
 * @param formData - Datos del segmento: nombre (requerido) y descripción (opcional)
 * @returns Resultado con éxito y datos del segmento creado, o error
 */
export async function crearSegmento(formData: { nombre: string; descripcion?: string | null }) {
  try {
    const parsed = segmentoSchema.parse(formData)
    const { supabase } = await verificarAcceso()

    const { data, error } = await supabase
      .from("segmentos")
      .insert({ nombre: parsed.nombre, descripcion: parsed.descripcion ?? null })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    revalidatePath("/grupos-vida/segmentos")
    return { success: true, data }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error inesperado"
    return { success: false, error: message }
  }
}

/**
 * Actualiza un segmento existente por su ID.
 *
 * @param id - UUID del segmento a editar
 * @param formData - Datos actualizados: nombre y descripción
 * @returns Resultado con éxito y datos actualizados, o error
 */
export async function editarSegmento(
  id: string,
  formData: { nombre: string; descripcion?: string | null }
) {
  try {
    const parsed = segmentoSchema.parse(formData)
    const { supabase } = await verificarAcceso()

    const { data, error } = await supabase
      .from("segmentos")
      .update({ nombre: parsed.nombre, descripcion: parsed.descripcion ?? null })
      .eq("id", id)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    revalidatePath("/grupos-vida/segmentos")
    return { success: true, data }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error inesperado"
    return { success: false, error: message }
  }
}

/**
 * Elimina un segmento por su ID.
 *
 * @param id - UUID del segmento a eliminar
 * @returns Resultado con éxito o error
 */
export async function eliminarSegmento(id: string) {
  try {
    const { supabase } = await verificarAcceso()

    const { error } = await supabase.from("segmentos").delete().eq("id", id)

    if (error) return { success: false, error: error.message }
    revalidatePath("/grupos-vida/segmentos")
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error inesperado"
    return { success: false, error: message }
  }
}
