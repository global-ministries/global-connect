"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { requireRole } from "@/lib/auth/requireAuth"
import {
  validarCreacionTemporada,
  validarEdicionTemporada,
  type CampoTemporada,
  type TemporadaExistente,
} from "@/lib/actions/season.rules"

/** A refusal for the form: on a field when it is about one (lib/actions/season.rules.ts). */
export type ErrorTemporada = { error: string; campo?: CampoTemporada }

async function leerTemporadas(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<TemporadaExistente[] | ErrorTemporada> {
  const { data, error } = await supabase.from("temporadas").select("id, nombre, fecha_inicio, fecha_fin")
  if (error) return { error: "Error al leer las temporadas: " + error.message }
  return (data ?? []) as TemporadaExistente[]
}

/**
 * Creates a season "En planificación" and inactive (S20 of
 * odd/tasks/planner-gdv.md): it is opened by publishing it from the planner.
 * Refuses a name or start that would put it in another season's place in its
 * cohort (S19).
 */
export async function createSeason(data: {
  nombre: string
  fecha_inicio: string
  fecha_fin: string
}): Promise<ErrorTemporada | void> {
  await requireRole('admin')
  const supabase = createSupabaseAdminClient()

  const temporadas = await leerTemporadas(supabase)
  if (!Array.isArray(temporadas)) return temporadas
  const validacion = validarCreacionTemporada(temporadas, data)
  if (!validacion.ok) return { campo: validacion.campo, error: validacion.error }

  const { error } = await supabase
    .from("temporadas")
    .insert([
      {
        nombre: validacion.valores.nombre,
        fecha_inicio: validacion.valores.fecha_inicio,
        fecha_fin: validacion.valores.fecha_fin,
        activa: false,
        estado: "planificacion",
      },
    ])
    .select("id")
    .single()

  if (error) {
    return { error: "Error al crear temporada: " + error.message }
  }

  revalidatePath("/grupos-vida/temporadas")
  redirect("/grupos-vida/temporadas")
}

/**
 * Edits a season without changing its cohort or its place in it, so the
 * season publishing closes stays the same (S19).
 */
export async function updateSeason(
  seasonId: string,
  data: {
    nombre: string
    fecha_inicio: string
    fecha_fin: string
    activa: boolean
  }
): Promise<ErrorTemporada | void> {
  await requireRole('admin')
  const supabase = createSupabaseAdminClient()

  const temporadas = await leerTemporadas(supabase)
  if (!Array.isArray(temporadas)) return temporadas
  const validacion = validarEdicionTemporada(temporadas, seasonId, data)
  if (!validacion.ok) return { campo: validacion.campo, error: validacion.error }

  const { error } = await supabase
    .from("temporadas")
    .update({
      nombre: validacion.valores.nombre,
      fecha_inicio: validacion.valores.fecha_inicio,
      fecha_fin: validacion.valores.fecha_fin,
      activa: data.activa,
    })
    .eq("id", seasonId)

  if (error) {
    return { error: "Error al actualizar temporada: " + error.message }
  }

  revalidatePath("/grupos-vida/temporadas")
  redirect("/grupos-vida/temporadas")
}
