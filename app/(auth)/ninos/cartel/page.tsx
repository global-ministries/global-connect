/**
 * Niños — /ninos/cartel (RSC), odd/tasks/ninos-checkin.md N8.
 *
 * A printable poster with a QR code to the public pre-registration page
 * (/ninos/registro?campus=…), for the church entrance. Same gate as
 * check-in: ninos_puede_operar_algun_area() (anfitriones and configurers);
 * everyone else gets a 404. The QR is rendered on the server as SVG.
 */
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { BotonImprimir } from '@/components/ninos/boton-imprimir'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { qrSvg, urlBaseCartel, urlRegistro } from '@/lib/platform/ninos/cartel'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Cartel de registro — Niños' }

export default async function NinosCartelPage() {
  const supabase = await createSupabaseServerClient()
  const { data: puede } = await supabase.rpc('ninos_puede_operar_algun_area')
  if (!puede) notFound()

  const { data: salones } = await supabase.from('ninos_salones').select('campus_id').eq('activo', true).order('orden').limit(1)
  const h = await headers()
  const origen = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host') ?? 'miembros.yosoyglobal.org'}`
  const url = urlRegistro(urlBaseCartel({ NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL }, origen), salones?.[0]?.campus_id ?? null)
  const svg = await qrSvg(url)

  return (
    <ContenedorDashboard titulo="Cartel de registro">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 rounded-3xl border border-border bg-white p-8 text-center text-neutral-900 print:border-0 print:p-0">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">Waumba Land · UpStreet</p>
        <h1 className="text-3xl font-bold sm:text-4xl">¿Primera vez con tus niños?</h1>
        <p className="text-lg">Escanea el código y registra a tu familia antes de llegar a la mesa de check-in.</p>
        {/* qrcode output: a static SVG built on the server from our own URL. */}
        <div className="w-64 max-w-full sm:w-80" aria-label="Código QR del registro de familias" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="break-all text-sm text-neutral-600">{url}</p>
      </div>
      <div className="mt-6 flex justify-center">
        <BotonImprimir />
      </div>
    </ContenedorDashboard>
  )
}
