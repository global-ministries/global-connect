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

// ─── Schemas ───────────────────────────────────────────
const asignarDESchema = z.object({
  dgUsuarioId: z.string().uuid(),
  segmentoLiderId: z.string().uuid(),
})

// ─── Tipos ─────────────────────────────────────────────
export interface DirectorEtapaConAsignaciones {
  segmentoLiderId: string
  usuarioId: string
  nombre: string
  email: string | null
  foto: string | null
  gruposAsignados: number
  asignadoA: { dgUsuarioId: string; dgNombre: string }[]
}

// ─── Obtener DEs de un segmento con asignaciones ───────
export async function obtenerDEsDeSegmentoConAsignaciones(
  segmentoId: string
): Promise<DirectorEtapaConAsignaciones[]> {
  await verificarGestor()
  const adminDb = createSupabaseAdminClient()

  // 1. Líderes tipo director_etapa del segmento
  const { data: des, error } = await adminDb
    .from("segmento_lideres")
    .select(`
      id,
      usuario_id,
      usuarios!segmento_lideres_usuario_id_fkey(id, nombre, apellido, email, foto_perfil_url)
    `)
    .eq("segmento_id", segmentoId)
    .eq("tipo_lider", "director_etapa")

  if (error || !des) {
    console.error("[obtenerDEsDeSegmento] Error:", error?.message)
    return []
  }

  const segmentoLiderIds = des.map((d) => d.id)

  // 2. Grupos asignados por DE (batch)
  const { data: gruposDE } = await adminDb
    .from("director_etapa_grupos")
    .select("director_etapa_id")
    .in("director_etapa_id", segmentoLiderIds)

  const gruposPorDE = new Map<string, number>()
  for (const g of gruposDE ?? []) {
    gruposPorDE.set(g.director_etapa_id, (gruposPorDE.get(g.director_etapa_id) ?? 0) + 1)
  }

  // 3. Asignaciones DG (batch)
  const { data: asignaciones } = await adminDb
    .from("dg_directores_etapa")
    .select(`
      dg_usuario_id,
      segmento_lider_id,
      usuarios!dg_directores_etapa_dg_usuario_id_fkey(nombre, apellido)
    `)
    .in("segmento_lider_id", segmentoLiderIds)

  const asignacionesPorDE = new Map<
    string,
    { dgUsuarioId: string; dgNombre: string }[]
  >()
  for (const a of asignaciones ?? []) {
    const lista = asignacionesPorDE.get(a.segmento_lider_id) ?? []
    const u = a.usuarios as unknown as { nombre: string; apellido: string | null }
    lista.push({
      dgUsuarioId: a.dg_usuario_id,
      dgNombre: `${u?.nombre ?? ""} ${u?.apellido ?? ""}`.trim(),
    })
    asignacionesPorDE.set(a.segmento_lider_id, lista)
  }

  return des.map((d) => {
    const u = d.usuarios as unknown as {
      id: string
      nombre: string
      apellido: string | null
      email: string | null
      foto_perfil_url: string | null
    }
    return {
      segmentoLiderId: d.id,
      usuarioId: d.usuario_id,
      nombre: `${u.nombre} ${u.apellido || ""}`.trim(),
      email: u.email,
      foto: u.foto_perfil_url,
      gruposAsignados: gruposPorDE.get(d.id) ?? 0,
      asignadoA: asignacionesPorDE.get(d.id) ?? [],
    }
  })
}

// ─── Asignar DE a DG ──────────────────────────────────
export async function asignarDEaDG(formData: {
  dgUsuarioId: string
  segmentoLiderId: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = asignarDESchema.parse(formData)
    await verificarGestor()
    const adminDb = createSupabaseAdminClient()

    const { error } = await adminDb
      .from("dg_directores_etapa")
      .insert({
        dg_usuario_id: parsed.dgUsuarioId,
        segmento_lider_id: parsed.segmentoLiderId,
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

// ─── Tipo para preview ─────────────────────────────────
export interface DEAsignadoPreview {
  segmentoLiderId: string
  nombre: string
  foto: string | null
  segmentoId: string
  segmentoNombre: string
  gruposAsignados: number
}

// ─── Obtener DEs asignados de todos los DGs ────────────
export async function obtenerDEsAsignadosPorDG(): Promise<
  Record<string, DEAsignadoPreview[]>
> {
  await verificarGestor()
  const adminDb = createSupabaseAdminClient()

  // 1. Todas las asignaciones DG→DE
  const { data: asignaciones, error } = await adminDb
    .from("dg_directores_etapa")
    .select(`
      dg_usuario_id,
      segmento_lider_id,
      segmento_lideres!dg_directores_etapa_segmento_lider_id_fkey(
        id,
        segmento_id,
        usuario_id,
        segmentos!segmento_lideres_segmento_id_fkey(nombre),
        usuarios!segmento_lideres_usuario_id_fkey(nombre, apellido, foto_perfil_url)
      )
    `)

  if (error || !asignaciones) {
    console.error("[obtenerDEsAsignadosPorDG] Error:", error?.message)
    return {}
  }

  // 2. Lider IDs for batch grupo count
  const liderIds = asignaciones.map((a) => {
    const sl = a.segmento_lideres as unknown as { id: string }
    return sl.id
  })

  const { data: gruposDE } = await adminDb
    .from("director_etapa_grupos")
    .select("director_etapa_id")
    .in("director_etapa_id", liderIds)

  const gruposPorDE = new Map<string, number>()
  for (const g of gruposDE ?? []) {
    gruposPorDE.set(g.director_etapa_id, (gruposPorDE.get(g.director_etapa_id) ?? 0) + 1)
  }

  // 3. Build result
  const result: Record<string, DEAsignadoPreview[]> = {}
  for (const a of asignaciones) {
    const sl = a.segmento_lideres as unknown as {
      id: string
      segmento_id: string
      usuario_id: string
      segmentos: { nombre: string }
      usuarios: { nombre: string; apellido: string | null; foto_perfil_url: string | null }
    }

    const de: DEAsignadoPreview = {
      segmentoLiderId: sl.id,
      nombre: `${sl.usuarios.nombre} ${sl.usuarios.apellido || ""}`.trim(),
      foto: sl.usuarios.foto_perfil_url,
      segmentoId: sl.segmento_id,
      segmentoNombre: sl.segmentos.nombre,
      gruposAsignados: gruposPorDE.get(sl.id) ?? 0,
    }

    if (!result[a.dg_usuario_id]) {
      result[a.dg_usuario_id] = []
    }
    result[a.dg_usuario_id].push(de)
  }

  return result
}

// ─── Desasignar DE de DG ──────────────────────────────
export async function desasignarDEaDG(formData: {
  dgUsuarioId: string
  segmentoLiderId: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = asignarDESchema.parse(formData)
    await verificarGestor()
    const adminDb = createSupabaseAdminClient()

    const { error } = await adminDb
      .from("dg_directores_etapa")
      .delete()
      .eq("dg_usuario_id", parsed.dgUsuarioId)
      .eq("segmento_lider_id", parsed.segmentoLiderId)

    if (error) return { success: false, error: error.message }

    revalidatePath("/configuracion/directores-generales")
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Error desconocido" }
  }
}
