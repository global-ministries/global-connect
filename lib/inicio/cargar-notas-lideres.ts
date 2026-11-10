/**
 * «Notas de líderes» of the home (odd/tasks/home-por-rol.md T7, S11): the
 * latest meetings with notes, from obtener_eventos_con_notas with the same
 * arguments the old NotasLideresWidget passed. The RPC decides the scope:
 * admin and pastor every group, directors the groups puede_ver_grupo lets
 * them see, anyone else nothing. A failure leaves the list empty (hidden).
 */
import { intentar } from './cargar-a-cargo'
import type { ClienteInicio } from './cargar-hechos'

/** As NotasLideresWidget: the last 10; /notas-lideres shows up to 50. */
export const LIMITE_NOTAS = 10

export type NotaLider = {
  eventoId: string
  grupoId: string
  grupo: string
  nota: string
  lider: string | null
  presentes: number | null
  total: number | null
  /** YYYY-MM-DD of the meeting. */
  fecha: string
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function aNotas(data: unknown): NotaLider[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((f: Record<string, unknown> | null) => {
    if (typeof f !== 'object' || f === null) return []
    const eventoId = texto(f.evento_id)
    const grupoId = texto(f.grupo_id)
    const nota = texto(f.notas)
    const fecha = texto(f.fecha)?.slice(0, 10)
    if (!eventoId || !grupoId || !nota || !fecha) return []
    return [{ eventoId, grupoId, grupo: texto(f.grupo_nombre) ?? 'Grupo sin nombre', nota, lider: texto(f.lider_nombre), presentes: numero(f.presentes), total: numero(f.total), fecha }]
  })
}

export function cargarNotasLideres(supabase: ClienteInicio, authId: string): Promise<NotaLider[]> {
  return intentar(
    'obtener_eventos_con_notas',
    async () => {
      const { data, error } = await supabase.rpc('obtener_eventos_con_notas', { p_auth_id: authId, p_limite: LIMITE_NOTAS })
      if (error) throw new Error(error.message ?? 'error de Supabase')
      return aNotas(data)
    },
    [],
  )
}
