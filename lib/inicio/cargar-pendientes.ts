/**
 * The «Para responder» counts that come from what the person has in charge
 * (odd/tasks/home-por-rol.md T4): reports their groups did not load last
 * week, leaders of their etapas or segmentos without last week's report,
 * and volunteers of their Dream Team areas still without Próximo Paso (S5).
 * The last two read the same memoized loaders as «A tu cargo», so the
 * blocks and the counts always agree, including their service-client reads
 * scoped to the session person (T9, L22). Each count degrades to 0 on its own.
 */
import { cargarArea, cargarEtapa, cargarSegmento, claveCargo, intentar, semanaAnterior, TIEMPO_MAXIMO_CARGO_MS, type ResumenGrupos } from './cargar-a-cargo'
import type { ClienteInicio } from './cargar-hechos'
import type { PendientesInicio } from './hechos'

export type PedidoPendientes = {
  usuarioId: string
  /** YYYY-MM-DD in Caracas. */
  hoy: string
  /** Groups where the person is Líder. */
  gruposLider: string[]
  etapas: string[]
  segmentos: string[]
  /** equipo ids of the areas the person directs or coordinates (tieneAreaACargo). */
  areas: string[]
}

export type PendientesCargo = Pick<PendientesInicio, 'reportesSinCargar' | 'lideresSinReporte' | 'marcarProximoPaso'>

async function reportesSinCargar(supabase: ClienteInicio, { gruposLider, hoy }: PedidoPendientes): Promise<number> {
  const semana = semanaAnterior(hoy)
  const { data, error } = await supabase.from('eventos_grupo').select('grupo_id').in('grupo_id', gruposLider).gte('fecha', semana.desde).lte('fecha', semana.hasta)
  if (error) throw new Error(error.message)
  const reportaron = new Set((data ?? []).map((e) => e.grupo_id))
  return gruposLider.filter((id) => !reportaron.has(id)).length
}

async function lideresSinReporte(supabase: ClienteInicio, pedido: PedidoPendientes): Promise<number> {
  // As the blocks: an etapa or segmento that fails is left out, the others still count.
  const resumenes = await Promise.all([
    ...pedido.etapas.map((id) =>
      intentar<ResumenGrupos | null>(claveCargo({ tipo: 'etapa', directorEtapaId: id }), () => cargarEtapa(supabase, id, pedido.hoy), null, TIEMPO_MAXIMO_CARGO_MS),
    ),
    ...pedido.segmentos.map((id) =>
      intentar<ResumenGrupos | null>(claveCargo({ tipo: 'segmento', segmentoId: id }), () => cargarSegmento(supabase, id, pedido.usuarioId, pedido.hoy), null, TIEMPO_MAXIMO_CARGO_MS),
    ),
  ])
  // A group under both an etapa and a segmento of the person counts once.
  return new Set(resumenes.flatMap((r) => (r ? r.grupos.filter((g) => !g.reporto).map((g) => g.grupoId) : []))).size
}

async function marcarProximoPaso(supabase: ClienteInicio, { areas }: PedidoPendientes): Promise<number> {
  const datos = await Promise.all(areas.map((id) => cargarArea(supabase, id, areas.length === 1)))
  return new Set(datos.flatMap((a) => a.sinProximoPaso.map((v) => v.usuarioId))).size
}

export async function cargarPendientesCargo(supabase: ClienteInicio, pedido: PedidoPendientes): Promise<PendientesCargo> {
  const [reportes, lideres, marcar] = await Promise.all([
    pedido.gruposLider.length > 0 ? intentar('reportes sin cargar', () => reportesSinCargar(supabase, pedido), 0) : 0,
    pedido.etapas.length + pedido.segmentos.length > 0 ? intentar('líderes sin reporte', () => lideresSinReporte(supabase, pedido), 0, TIEMPO_MAXIMO_CARGO_MS) : 0,
    pedido.areas.length > 0 ? intentar('voluntarios sin Próximo Paso', () => marcarProximoPaso(supabase, pedido), 0, TIEMPO_MAXIMO_CARGO_MS) : 0,
  ])
  return { reportesSinCargar: reportes, lideresSinReporte: lideres, marcarProximoPaso: marcar }
}
