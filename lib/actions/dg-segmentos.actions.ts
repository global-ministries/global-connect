"use server"

import { z } from "zod"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { revalidatePath } from "next/cache"

// ─── Constantes ────────────────────────────────────────
const ROLES_GESTORES = ["admin", "pastor", "director-general"]

// ─── Helpers ───────────────────────────────────────────
async function verificarGestor() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) throw new Error("No autenticado")
  if (!userData.roles.some((r) => ROLES_GESTORES.includes(r)))
    throw new Error("No autorizado")
  return { supabase, userData }
}

const asignarSchema = z.object({
  usuarioId: z.string().uuid(),
  segmentoId: z.string().uuid(),
})

// ─── Tipos ─────────────────────────────────────────────
interface DirectorGeneralConSegmentos {
  usuarioId: string
  nombre: string
  email: string | null
  foto: string | null
  segmentos: { id: string; nombre: string }[]
}

// ─── Obtener DGs con segmentos asignados ───────────────
export async function obtenerDirectoresGenerales(): Promise<DirectorGeneralConSegmentos[]> {
  await verificarGestor()
  const adminDb = createSupabaseAdminClient()

  // 1. Obtener el rol_id de director-general
  const { data: rolDG } = await adminDb
    .from("roles_sistema")
    .select("id")
    .eq("nombre_interno", "director-general")
    .single()

  if (!rolDG) return []

  // 2. Obtener usuarios con ese rol
  const { data: dgs, error: dgsError } = await adminDb
    .from("usuario_roles")
    .select(`
      usuario_id,
      usuarios!fk_usuario_roles_usuario_id(id, nombre, apellido, email, foto_perfil_url)
    `)
    .eq("rol_id", rolDG.id)

  if (dgsError) {
    console.error("[obtenerDirectoresGenerales] Error al obtener DGs:", dgsError.message)
    return []
  }

  if (!dgs || dgs.length === 0) return []

  // 3. Obtener asignaciones de segmentos en batch
  const usuarioIds = dgs.map((d) => d.usuario_id)
  const { data: asignaciones } = await adminDb
    .from("director_general_segmentos")
    .select("usuario_id, segmento_id, segmentos(id, nombre)")
    .in("usuario_id", usuarioIds)

  // 4. Agrupar segmentos por DG
  const asignacionesPorDG = new Map<string, { id: string; nombre: string }[]>()
  for (const a of asignaciones ?? []) {
    const lista = asignacionesPorDG.get(a.usuario_id) ?? []
    const seg = a.segmentos as unknown as { id: string; nombre: string } | null
    if (seg) lista.push({ id: seg.id, nombre: seg.nombre })
    asignacionesPorDG.set(a.usuario_id, lista)
  }

  return dgs.map((d) => {
    const u = d.usuarios as unknown as {
      id: string
      nombre: string
      apellido: string | null
      email: string | null
      foto_perfil_url: string | null
    }
    return {
      usuarioId: d.usuario_id,
      nombre: `${u.nombre} ${u.apellido || ""}`.trim(),
      email: u.email,
      foto: u.foto_perfil_url,
      segmentos: asignacionesPorDG.get(d.usuario_id) ?? [],
    }
  })
}

// ─── Obtener todos los segmentos ───────────────────────
export async function obtenerSegmentosDisponibles(): Promise<{ id: string; nombre: string }[]> {
  await verificarGestor()
  const adminDb = createSupabaseAdminClient()
  const { data } = await adminDb
    .from("segmentos")
    .select("id, nombre")
    .order("nombre", { ascending: true })
  return data ?? []
}

// ─── Asignar segmento a DG ────────────────────────────
export async function asignarSegmentoDG(formData: {
  usuarioId: string
  segmentoId: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = asignarSchema.parse(formData)
    await verificarGestor()
    const adminDb = createSupabaseAdminClient()

    const { error } = await adminDb
      .from("director_general_segmentos")
      .insert({
        usuario_id: parsed.usuarioId,
        segmento_id: parsed.segmentoId,
      })

    if (error) {
      if (error.code === "23505") return { success: false, error: "Ya asignado" }
      return { success: false, error: error.message }
    }

    revalidatePath("/configuracion/directores-generales")
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ─── Desasignar segmento de DG ────────────────────────
export async function desasignarSegmentoDG(formData: {
  usuarioId: string
  segmentoId: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = asignarSchema.parse(formData)
    await verificarGestor()
    const adminDb = createSupabaseAdminClient()

    const { error } = await adminDb
      .from("director_general_segmentos")
      .delete()
      .eq("usuario_id", parsed.usuarioId)
      .eq("segmento_id", parsed.segmentoId)

    if (error) return { success: false, error: error.message }

    revalidatePath("/configuracion/directores-generales")
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
