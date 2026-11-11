/**
 * /talleres/temporadas/[id] — R3b (odd/tasks/talleres-rediseno.md, S5): the
 * temporada detail now lives in the list's drawer (one DetalleResponsivo per
 * temporada, artboards design/talleres-interior/26 and 27). This route stays
 * for old links (rutaTemporada) and sends them to the list with that drawer
 * open. The list page runs the same gate and permission checks.
 */

import { redirect } from 'next/navigation'

import { rutaTemporadas } from '@/lib/platform/talleres/rutas'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export default async function TemporadaDetallePage(ctx: RouteContext): Promise<never> {
  const { id } = await ctx.params
  redirect(`${rutaTemporadas()}?temporada=${encodeURIComponent(id)}`)
}
