/**
 * /talleres/temporadas — R3l (odd/tasks/talleres-rediseno.md, S1, L11):
 * Temporadas is hidden from Talleres (production has none and every taller
 * runs on its own cadencia). The route stays for old links and sends them to
 * the catálogo. The talleres_temporadas data, its RPCs and ./actions.ts stay.
 */

import { redirect } from 'next/navigation'

import { rutaCatalogo } from '@/lib/platform/talleres/rutas'

export default function TemporadasPage(): never {
  redirect(rutaCatalogo())
}
