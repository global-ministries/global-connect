"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export async function createSeason(data: {
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  activa: boolean
}) {
  const supabase = createSupabaseAdminClient()

  const { data: insertData, error } = await supabase
    .from("temporadas")
    .insert([
      {
        nombre: data.nombre,
        fecha_inicio: data.fecha_inicio,
        fecha_fin: data.fecha_fin,
        activa: data.activa,
      },
    ])
    .select("id")
    .single()

  if (error) {
    throw new Error("Error al crear temporada: " + error.message)
  }

  revalidatePath("/dashboard/temporadas")
  redirect("/dashboard/temporadas")
}

export async function updateSeason(
  seasonId: string,
  data: {
    nombre: string
    fecha_inicio: string
    fecha_fin: string
    activa: boolean
  }
) {
  const supabase = createSupabaseAdminClient()

  const { error } = await supabase
    .from("temporadas")
    .update({
      nombre: data.nombre,
      fecha_inicio: data.fecha_inicio,
      fecha_fin: data.fecha_fin,
      activa: data.activa,
    })
    .eq("id", seasonId)

  if (error) {
    throw new Error("Error al actualizar temporada: " + error.message)
  }

  revalidatePath("/dashboard/temporadas")
  redirect("/dashboard/temporadas")
}
