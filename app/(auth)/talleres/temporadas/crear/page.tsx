/**
 * /talleres/temporadas/crear — R3l (odd/tasks/talleres-rediseno.md, L11):
 * Temporadas is hidden from Talleres, so an old «Crear temporada» link goes
 * to the catálogo.
 */

import { redirect } from 'next/navigation'

import { rutaCatalogo } from '@/lib/platform/talleres/rutas'

export default function CrearTemporadaPage(): never {
  redirect(rutaCatalogo())
}
