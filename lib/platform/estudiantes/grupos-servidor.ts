/**
 * Estudiantes — loads the data of /estudiantes/grupos with the session client
 * (C2a of odd/tasks/estudiantes-fase-b.md).
 *
 * Access: only a caller with at least one row in
 * estudiantes_subareas_gestionables() (level 3 on a Grupos de Chicas / Chicos
 * sub-área of a campus: directora de grupo, director del ambiente, Directores
 * de Estudiantes, admin, pastor of the campus) gets data; anyone else gets
 * `null` and the page answers with the app's not-found state.
 *
 * Groups come from estudiantes_mis_grupos(p_incluir_inactivos: true), kept to
 * the ones the caller manages; their members from one
 * estudiantes_grupo_integrantes call per group, in parallel (the search and
 * "Por confirmar" need every name and visit count). A group whose members
 * cannot be read is shown without them and the failure is logged.
 */
import type { createSupabaseServerClient } from '@/lib/supabase/server'

import { aEscala, aGrupo, aSubareas, type GradoEscala, type GrupoGestion, type SubareaGestionable } from './grupos-datos'

type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface DatosGestionGrupos {
  readonly subareas: readonly SubareaGestionable[]
  readonly grupos: readonly GrupoGestion[]
  /** The school scale of every campus the caller manages, by campus id. */
  readonly escalas: Readonly<Record<string, readonly GradoEscala[]>>
}

export async function cargarGestionGrupos(supabase: Cliente): Promise<DatosGestionGrupos | null> {
  const [subareasRes, gruposRes] = await Promise.all([
    supabase.rpc('estudiantes_subareas_gestionables'),
    supabase.rpc('estudiantes_mis_grupos', { p_incluir_inactivos: true }),
  ])
  if (subareasRes.error) {
    console.error('[estudiantes/grupos] subareas_gestionables failed', subareasRes.error)
    return null
  }
  const subareas = aSubareas(subareasRes.data ?? [])
  if (subareas.length === 0) return null
  if (gruposRes.error) throw new Error(`estudiantes_mis_grupos: ${gruposRes.error.message}`)

  const filas = (gruposRes.data ?? []).filter((fila) => fila.puede_gestionar)
  const campusIds = [...new Set(subareas.map((s) => s.campusId))]

  const [integrantes, escalas] = await Promise.all([
    Promise.all(
      filas.map(async (fila) => {
        const { data, error } = await supabase.rpc('estudiantes_grupo_integrantes', { p_grupo_id: fila.grupo_id })
        if (error) console.error('[estudiantes/grupos] grupo_integrantes failed', fila.grupo_id, error)
        return error ? null : data
      }),
    ),
    Promise.all(
      campusIds.map(async (campusId): Promise<readonly [string, readonly GradoEscala[]]> => {
        const { data, error } = await supabase.rpc('estudiantes_escala_campus', { p_campus_id: campusId })
        if (error) console.error('[estudiantes/grupos] escala_campus failed', campusId, error)
        return [campusId, aEscala(data ?? [])]
      }),
    ),
  ])

  return {
    subareas,
    grupos: filas.map((fila, i) => aGrupo(fila, integrantes[i] ?? null)),
    escalas: Object.fromEntries(escalas),
  }
}
