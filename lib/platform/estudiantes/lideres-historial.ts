/**
 * Estudiantes — the leader history of a group (C6a of
 * odd/tasks/estudiantes-fase-b.md, L29): "Líderes anteriores" in the group
 * drawer of /estudiantes/grupos.
 *
 * Source: estudiantes_grupo_lideres_historial(grupo)
 * (supabase/migrations/20261101120000_estudiantes_lideres_historial.sql), one
 * row per leadership period, current ones first. Changing the leaders closes
 * a period (hasta) instead of deleting it, so a person who led twice has two
 * periods.
 */
import type { Database } from '@/lib/supabase/database.types'

export type FilaHistorialLideres = Database['public']['Functions']['estudiantes_grupo_lideres_historial']['Returns'][number]

export interface PeriodoLider {
  readonly servicioId: string
  readonly personaId: string
  /** "Nombre Apellido". */
  readonly nombre: string
  readonly rol: string
  /** ISO instants; `hasta` is null while the period is current. */
  readonly desde: string
  readonly hasta: string | null
  /** Who closed the period, when recorded. */
  readonly cerradoPor: string | null
}

/** How many past leaders show before "Ver todos". */
export const LIDERES_ANTERIORES_VISIBLES = 3

const ZONA = 'America/Caracas'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

const texto = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null)

/** The RPC rows as periods; a row without ids or start is dropped. */
export function leerHistorialLideres(filas: readonly FilaHistorialLideres[] | null | undefined): PeriodoLider[] {
  return (filas ?? []).flatMap((fila) => {
    const servicioId = texto(fila.servicio_id)
    const personaId = texto(fila.persona_id)
    const desde = texto(fila.desde)
    if (!servicioId || !personaId || !desde) return []
    return [
      {
        servicioId,
        personaId,
        nombre: [texto(fila.nombre), texto(fila.apellido)].filter(Boolean).join(' '),
        rol: texto(fila.rol) ?? '',
        desde,
        hasta: texto(fila.hasta),
        cerradoPor: texto(fila.cerrado_por_nombre),
      },
    ]
  })
}

const instante = (valor: string): number => new Date(valor).getTime()

/** The closed periods: the most recently closed first, then the later start, then by name. */
export function lideresAnteriores(periodos: readonly PeriodoLider[]): PeriodoLider[] {
  return periodos
    .filter((p): p is PeriodoLider & { readonly hasta: string } => p.hasta !== null)
    .sort(
      (a, b) =>
        instante(b.hasta) - instante(a.hasta) ||
        instante(b.desde) - instante(a.desde) ||
        a.nombre.localeCompare(b.nombre, 'es'),
    )
}

/** "ene 2025" of an instant, in Caracas time. */
export function mesAnio(valor: string): string {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, year: 'numeric', month: 'numeric' }).formatToParts(new Date(valor))
  const parte = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value)
  return `${MESES[parte('month') - 1]} ${parte('year')}`
}

/** "sep 2024 – jun 2025"; "jun 2025" when both fall in one month; "desde jun 2025" while current. */
export function rangoPeriodo(desde: string, hasta: string | null): string {
  const inicio = mesAnio(desde)
  if (hasta === null) return `desde ${inicio}`
  const fin = mesAnio(hasta)
  return inicio === fin ? inicio : `${inicio} – ${fin}`
}

/** The line under the name: "Líder · ene 2025 – jun 2025". */
export function subtituloLiderAnterior(periodo: PeriodoLider): string {
  return [periodo.rol, rangoPeriodo(periodo.desde, periodo.hasta)].filter(Boolean).join(' · ')
}

/** The rows to show: the first ones while collapsed, and how many stay hidden. */
export function visiblesLideresAnteriores(
  lista: readonly PeriodoLider[],
  expandido: boolean,
): { readonly visibles: readonly PeriodoLider[]; readonly ocultos: number } {
  if (expandido || lista.length <= LIDERES_ANTERIORES_VISIBLES) return { visibles: lista, ocultos: 0 }
  return { visibles: lista.slice(0, LIDERES_ANTERIORES_VISIBLES), ocultos: lista.length - LIDERES_ANTERIORES_VISIBLES }
}
