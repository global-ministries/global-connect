"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { exigirAdminOPastor } from "@/lib/platform/grupos-vida/permisos"

/**
 * /grupos-vida/directores — writes of the directors page.
 *
 * Every action is gated to admin and pastor (a director general is refused: a
 * director general changing their own scope would widen their own access) and
 * returns `{ success, error? }`. They write with the admin client after the
 * gate, so the database policies are a second line, not the only one.
 */

const RUTA = "/grupos-vida/directores"
const MAX_RESULTADOS_BUSQUEDA = 8
const MIN_LARGO_BUSQUEDA = 2
const MAX_TERMINOS_BUSQUEDA = 3

type Resultado = { success: boolean; error?: string }

const uuid = z.string().uuid()
const alcanceSchema = z.enum(["segmento", "directores"])

const ETIQUETAS_DE_ROL: Record<string, string> = {
  admin: "Administrador",
  pastor: "Pastor",
  "director-general": "Director general",
  "director-etapa": "Director de etapa",
  lider: "Líder",
  miembro: "Miembro",
}

function mensajeDe(e: unknown): string {
  if (e instanceof z.ZodError) return "Datos no válidos"
  return e instanceof Error ? e.message : "Error desconocido"
}

// ─── Agregar director general ──────────────────────────
/** Adds the `director-general` role to a person, keeping every role they already have. */
export async function agregarDirectorGeneral(usuarioId: string): Promise<Resultado> {
  try {
    await exigirAdminOPastor()
    const id = uuid.parse(usuarioId)
    const adminDb = createSupabaseAdminClient()

    const { data: rol, error: rolError } = await adminDb
      .from("roles_sistema")
      .select("id")
      .eq("nombre_interno", "director-general")
      .single()
    if (rolError || !rol) return { success: false, error: rolError?.message ?? "Rol no encontrado" }

    const { data: persona, error: personaError } = await adminDb.from("usuarios").select("id").eq("id", id).maybeSingle()
    if (personaError) return { success: false, error: personaError.message }
    if (!persona) return { success: false, error: "Persona no encontrada" }

    const { data: existente, error: existenteError } = await adminDb
      .from("usuario_roles")
      .select("usuario_id")
      .eq("usuario_id", id)
      .eq("rol_id", rol.id)
    if (existenteError) return { success: false, error: existenteError.message }
    if (existente && existente.length > 0) return { success: true }

    const { error } = await adminDb.from("usuario_roles").insert({ usuario_id: id, rol_id: rol.id })
    if (error) return { success: false, error: error.message }

    revalidatePath(RUTA)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: mensajeDe(e) }
  }
}

// ─── Cambiar alcance de un segmento ────────────────────
/** Sets the scope of one segment already held by the director general. The marks are kept. */
export async function cambiarAlcanceDG(
  usuarioId: string,
  segmentoId: string,
  alcance: "segmento" | "directores"
): Promise<Resultado> {
  try {
    await exigirAdminOPastor()
    const parsed = z
      .object({ usuarioId: uuid, segmentoId: uuid, alcance: alcanceSchema })
      .parse({ usuarioId, segmentoId, alcance })
    const adminDb = createSupabaseAdminClient()

    const { data, error } = await adminDb
      .from("director_general_segmentos")
      .update({ alcance: parsed.alcance })
      .eq("usuario_id", parsed.usuarioId)
      .eq("segmento_id", parsed.segmentoId)
      .select("id")
    if (error) return { success: false, error: error.message }
    if (!data || data.length === 0) {
      return { success: false, error: "El director general no tiene asignado este segmento" }
    }

    revalidatePath(RUTA)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: mensajeDe(e) }
  }
}

// ─── Marcar directores de etapa de un segmento ─────────
/**
 * Makes the set of stage directors marked for a director general IN THAT
 * SEGMENT equal to `segmentoLiderIds`. Ids of directors from another segment
 * are rejected, and the marks of other segments are never read or written.
 * Inserts first, then deletes, so a failure never leaves the person with fewer
 * marks than they had.
 */
export async function marcarDirectoresDG(
  usuarioId: string,
  segmentoId: string,
  segmentoLiderIds: string[]
): Promise<Resultado> {
  try {
    await exigirAdminOPastor()
    const parsed = z
      .object({ usuarioId: uuid, segmentoId: uuid, segmentoLiderIds: z.array(uuid) })
      .parse({ usuarioId, segmentoId, segmentoLiderIds })
    const objetivo = [...new Set(parsed.segmentoLiderIds)]
    const adminDb = createSupabaseAdminClient()

    const { data: delSegmento, error: segmentoError } = await adminDb
      .from("segmento_lideres")
      .select("id")
      .eq("segmento_id", parsed.segmentoId)
      .eq("tipo_lider", "director_etapa")
    if (segmentoError) return { success: false, error: segmentoError.message }

    const idsDelSegmento = new Set((delSegmento ?? []).map((d) => d.id))
    if (objetivo.some((id) => !idsDelSegmento.has(id))) {
      return { success: false, error: "Hay directores que no pertenecen al segmento" }
    }
    if (idsDelSegmento.size === 0) return { success: true }

    const { data: actuales, error: actualesError } = await adminDb
      .from("dg_directores_etapa")
      .select("segmento_lider_id")
      .eq("dg_usuario_id", parsed.usuarioId)
      .in("segmento_lider_id", [...idsDelSegmento])
    if (actualesError) return { success: false, error: actualesError.message }

    const marcados = new Set((actuales ?? []).map((a) => a.segmento_lider_id))
    const porAgregar = objetivo.filter((id) => !marcados.has(id))
    const porQuitar = [...marcados].filter((id) => !objetivo.includes(id))

    if (porAgregar.length > 0) {
      const { error } = await adminDb
        .from("dg_directores_etapa")
        .insert(porAgregar.map((id) => ({ dg_usuario_id: parsed.usuarioId, segmento_lider_id: id })))
      if (error) return { success: false, error: error.message }
    }
    if (porQuitar.length > 0) {
      const { error } = await adminDb
        .from("dg_directores_etapa")
        .delete()
        .eq("dg_usuario_id", parsed.usuarioId)
        .in("segmento_lider_id", porQuitar)
      if (error) return { success: false, error: error.message }
    }

    if (porAgregar.length > 0 || porQuitar.length > 0) revalidatePath(RUTA)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: mensajeDe(e) }
  }
}

// ─── Todos los segmentos ───────────────────────────────
/**
 * One row per existing segment with scope `segmento`: existing rows are
 * updated to `segmento`, the missing ones inserted. A segment created later is
 * not included by itself.
 */
export async function asignarTodosLosSegmentosDG(usuarioId: string): Promise<Resultado> {
  try {
    await exigirAdminOPastor()
    const id = uuid.parse(usuarioId)
    const adminDb = createSupabaseAdminClient()

    const { data: segmentos, error: segmentosError } = await adminDb.from("segmentos").select("id")
    if (segmentosError) return { success: false, error: segmentosError.message }

    const { data: filas, error: filasError } = await adminDb
      .from("director_general_segmentos")
      .select("segmento_id, alcance")
      .eq("usuario_id", id)
    if (filasError) return { success: false, error: filasError.message }

    const existentes = new Map((filas ?? []).map((f) => [f.segmento_id, f.alcance]))
    const idsSegmentos = (segmentos ?? []).map((s) => s.id)
    const porActualizar = idsSegmentos.filter((sid) => existentes.has(sid) && existentes.get(sid) !== "segmento")
    const porInsertar = idsSegmentos.filter((sid) => !existentes.has(sid))

    if (porActualizar.length > 0) {
      const { error } = await adminDb
        .from("director_general_segmentos")
        .update({ alcance: "segmento" })
        .eq("usuario_id", id)
        .in("segmento_id", porActualizar)
      if (error) return { success: false, error: error.message }
    }
    if (porInsertar.length > 0) {
      const { error } = await adminDb
        .from("director_general_segmentos")
        .insert(porInsertar.map((sid) => ({ usuario_id: id, segmento_id: sid, alcance: "segmento" })))
      if (error) return { success: false, error: error.message }
    }

    if (porActualizar.length > 0 || porInsertar.length > 0) revalidatePath(RUTA)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: mensajeDe(e) }
  }
}

// ─── Buscar personas para agregar ──────────────────────
export interface PersonaBuscada {
  id: string
  nombre: string
  roles: string[]
}

/**
 * People by name for the "Agregar director general" dialog: not the ones who
 * already hold the role, at most eight, and only id, name and role labels.
 */
export async function buscarPersonasParaDirectorGeneral(
  texto: string
): Promise<{ success: boolean; data?: PersonaBuscada[]; error?: string }> {
  try {
    await exigirAdminOPastor()
    // Characters that are syntax in a PostgREST filter would change the query.
    const terminos = texto
      .replace(/[,()%_*\\]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, MAX_TERMINOS_BUSQUEDA)
    if (terminos.join("").length < MIN_LARGO_BUSQUEDA) return { success: true, data: [] }

    const adminDb = createSupabaseAdminClient()

    const { data: roles, error: rolesError } = await adminDb.from("roles_sistema").select("id, nombre_interno")
    if (rolesError) return { success: false, error: rolesError.message }
    const rolDG = (roles ?? []).find((r) => r.nombre_interno === "director-general")

    let yaDirectores: string[] = []
    if (rolDG) {
      const { data, error } = await adminDb.from("usuario_roles").select("usuario_id").eq("rol_id", rolDG.id)
      if (error) return { success: false, error: error.message }
      yaDirectores = (data ?? []).map((r) => r.usuario_id)
    }

    let consulta = adminDb.from("usuarios").select("id, nombre, apellido")
    for (const termino of terminos) {
      consulta = consulta.or(`nombre.ilike.%${termino}%,apellido.ilike.%${termino}%`)
    }
    if (yaDirectores.length > 0) consulta = consulta.not("id", "in", `(${yaDirectores.join(",")})`)
    const { data: personas, error: personasError } = await consulta
      .order("nombre", { ascending: true })
      .limit(MAX_RESULTADOS_BUSQUEDA)
    if (personasError) return { success: false, error: personasError.message }
    if (!personas || personas.length === 0) return { success: true, data: [] }

    const { data: rolesDePersonas, error: rolesPersonasError } = await adminDb
      .from("usuario_roles")
      .select("usuario_id, rol_id")
      .in("usuario_id", personas.map((p) => p.id))
    if (rolesPersonasError) return { success: false, error: rolesPersonasError.message }

    const nombreDeRol = new Map((roles ?? []).map((r) => [r.id, r.nombre_interno]))
    const etiquetasPorPersona = new Map<string, string[]>()
    for (const fila of rolesDePersonas ?? []) {
      const interno = nombreDeRol.get(fila.rol_id)
      if (!interno) continue
      const lista = etiquetasPorPersona.get(fila.usuario_id) ?? []
      lista.push(ETIQUETAS_DE_ROL[interno] ?? interno)
      etiquetasPorPersona.set(fila.usuario_id, lista)
    }

    return {
      success: true,
      data: personas.map((p) => ({
        id: p.id,
        nombre: `${p.nombre} ${p.apellido ?? ""}`.trim(),
        roles: etiquetasPorPersona.get(p.id) ?? [],
      })),
    }
  } catch (e: unknown) {
    return { success: false, error: mensajeDe(e) }
  }
}
