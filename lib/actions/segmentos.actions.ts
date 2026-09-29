"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { leer, leerPaginado } from "@/lib/platform/grupos-vida/lectura-supabase"
import { esGrupoActivo } from "@/lib/platform/grupos-vida/directores-vista"
import { mensajeNoSePuedeEliminar } from "@/lib/platform/grupos-vida/segmentos-vista"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ---------- Validación ----------
const segmentoSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido").max(100),
  descripcion: z.string().max(500).optional().nullable(),
})

// ---------- Helpers ----------
// Creating, editing and deleting segments is admin only, as the page offers it.
const ROLES_PERMITIDOS = ["admin"]

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

/** Postgres `foreign_key_violation`. */
const CODIGO_LLAVE_FORANEA = "23503"

/**
 * Message that refuses the deletion when something is attached to the segment,
 * or `null` when nothing is. Reads with the admin client: RLS would hide groups
 * and links from some roles and the guard must see every row, deleted or not.
 * A failed read throws, so the segment is never deleted without checking.
 */
async function motivoNoEliminable(id: string): Promise<string | null> {
  const adminDb = createSupabaseAdminClient()
  const [segmentos, grupos, lideres, generales] = await Promise.all([
    leer("segmentos", adminDb.from("segmentos").select("nombre").eq("id", id)),
    leerPaginado("grupos", (desde, hasta) =>
      adminDb
        .from("grupos")
        .select("id, activo, eliminado, estado_aprobacion")
        .eq("segmento_id", id)
        .order("id", { ascending: true })
        .range(desde, hasta),
    ),
    leerPaginado("segmento_lideres", (desde, hasta) =>
      adminDb.from("segmento_lideres").select("id").eq("segmento_id", id).order("id", { ascending: true }).range(desde, hasta),
    ),
    leer("director_general_segmentos", adminDb.from("director_general_segmentos").select("segmento_id").eq("segmento_id", id)),
  ])

  return mensajeNoSePuedeEliminar(segmentos[0]?.nombre ?? "el segmento", {
    gruposActivos: grupos.filter((g) =>
      esGrupoActivo({ id: g.id, segmentoId: id, activo: g.activo === true, eliminado: g.eliminado, estadoAprobacion: g.estado_aprobacion }),
    ).length,
    gruposTotales: grupos.length,
    lideres: lideres.length,
    directoresGenerales: generales.length,
  })
}

/**
 * Elimina un segmento por su ID.
 *
 * Un segmento con grupos (activos, pendientes, inactivos o eliminados), líderes
 * o directores generales asignados no se elimina: se responde con el motivo, sin
 * importar lo que haya hecho la interfaz.
 *
 * @param id - UUID del segmento a eliminar
 * @returns Resultado con éxito o error
 */
export async function eliminarSegmento(id: string) {
  try {
    const { supabase } = await verificarAcceso()

    const motivo = await motivoNoEliminable(id)
    if (motivo) return { success: false, error: motivo }

    const { error } = await supabase.from("segmentos").delete().eq("id", id)

    if (error) {
      // The foreign keys are the last line of defence: answer them in plain words.
      if (error.code === CODIGO_LLAVE_FORANEA) {
        return { success: false, error: "No se puede eliminar el segmento: tiene información asociada." }
      }
      return { success: false, error: error.message }
    }
    revalidatePath("/grupos-vida/segmentos")
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error inesperado"
    return { success: false, error: message }
  }
}
