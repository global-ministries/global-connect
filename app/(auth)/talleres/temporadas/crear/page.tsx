/**
 * /talleres/temporadas/crear — R3b (odd/tasks/talleres-rediseno.md, S5): the
 * «Crear temporada» form now opens in a DetalleResponsivo over the list
 * (artboards design/talleres-interior/26 and 27, `#crear`). This route stays
 * for old links (rutaTemporadaCrear) and opens that form; the list page only
 * offers it to whoever may create in some dirección.
 */

import { redirect } from 'next/navigation'

import { rutaTemporadas } from '@/lib/platform/talleres/rutas'

export default function CrearTemporadaPage(): never {
  redirect(`${rutaTemporadas()}?crear=1`)
}
