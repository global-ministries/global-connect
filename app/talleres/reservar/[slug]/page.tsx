/**
 * /talleres/reservar/<slug> (RSC, public, no login) — one Grupo de Corto Plazo
 * and its reservation flow (design/talleres-reserva/02–06; T5b of
 * odd/tasks/talleres-reserva-publica.md, S1 S3 S4 S12 S13). The taller comes
 * from the service-role RPC talleres_publico_taller (null when the taller is
 * not public: 404). The flow posts to /api/talleres/reserva/*.
 *
 * `?embed=1` (T6, S2 S18) renders only the flow, for public/embed.js's card
 * and modal; middleware.ts lets any site frame these paths.
 */
import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EncabezadoPublico, PiePublico } from '@/components/talleres/reserva/encabezado-publico'
import { leerModoIncrustado } from '@/components/talleres/reserva/modo-incrustado'
import { PaginaTaller } from '@/components/talleres/reserva/pagina-taller'
import { TallerIncrustado } from '@/components/talleres/reserva/taller-incrustado'
import { esSlug } from '@/lib/platform/talleres/reserva-publica'
import { leerTallerPublico, rpcServicio } from '@/lib/platform/talleres/reserva-publica-servidor'

export const dynamic = 'force-dynamic'

type Props = {
  readonly params: Promise<{ readonly slug: string }>
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** One read per request, shared by the metadata and the page. */
const tallerDe = cache(async (slug: string) => (esSlug(slug) ? leerTallerPublico(rpcServicio(), slug) : null))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const taller = await tallerDe((await params).slug)
  if (!taller) return { title: 'Taller no disponible | Iglesia Global' }
  return {
    title: `${taller.nombre} — Reserva tu lugar | Iglesia Global`,
    description: taller.descripcion ?? `Reserva tu lugar en ${taller.nombre}, un Grupo de Corto Plazo de Iglesia Global.`,
  }
}

export default async function TallerPublicoPage({ params, searchParams }: Props) {
  const taller = await tallerDe((await params).slug)
  if (!taller) notFound()

  const modo = leerModoIncrustado(await searchParams)
  if (modo.incrustado) return <TallerIncrustado taller={taller} modo={modo} />

  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <EncabezadoPublico
        migas={[{ etiqueta: 'Grupos de Corto Plazo', href: '/talleres/reservar' }, { etiqueta: taller.nombre }]}
        atras={{ etiqueta: 'Talleres', href: '/talleres/reservar' }}
      />
      <PaginaTaller taller={taller} />
      <div className="pb-28 lg:pb-0">
        <PiePublico />
      </div>
    </div>
  )
}
