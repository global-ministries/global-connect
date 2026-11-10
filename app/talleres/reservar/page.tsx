/**
 * /talleres/reservar (RSC, public, no login) — catalog of the Grupos de Corto
 * Plazo (design/talleres-reserva/01; T5b of odd/tasks/talleres-reserva-publica.md,
 * S1). Read with the service-role RPC talleres_publico_catalogo: public
 * talleres and their open ediciones, with no personal data beyond the first
 * names of the leaders. Places change by the minute, so it renders per request.
 */
import type { Metadata } from 'next'
import { ShieldCheck, Sprout } from 'lucide-react'

import { EncabezadoPublico, PiePublico } from '@/components/talleres/reserva/encabezado-publico'
import { ListaPasos } from '@/components/talleres/reserva/piezas'
import { TarjetaTaller } from '@/components/talleres/reserva/tarjeta-taller'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { edicionesConLugar } from '@/lib/platform/talleres/reserva-publica'
import { leerCatalogoPublico, rpcServicio } from '@/lib/platform/talleres/reserva-publica-servidor'

export const metadata: Metadata = {
  title: 'Grupos de Corto Plazo — Reserva tu lugar | Iglesia Global',
  description: 'Talleres de pocas semanas para crecer junto a otras personas. Elige uno y reserva tu lugar en Iglesia Global.',
}
export const dynamic = 'force-dynamic'

const encabezadoSeccion = 'px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'

export default async function CatalogoTalleresPage() {
  const talleres = await leerCatalogoPublico(rpcServicio())
  const abiertos = talleres.filter((t) => edicionesConLugar(t).length > 0)
  const otros = talleres.filter((t) => edicionesConLugar(t).length === 0)

  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <EncabezadoPublico migas={[{ etiqueta: 'Grupos de Corto Plazo' }]} />
      <main id="contenido" className="grid min-w-0 gap-8 px-4 pt-3 pb-10 sm:px-6 lg:px-12 lg:pt-8">
        <section aria-labelledby="catalogo-titulo" className="grid gap-2 px-1">
          <h1 id="catalogo-titulo" className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] text-foreground md:text-2xl md:font-semibold md:tracking-tight">
            Grupos de Corto Plazo
          </h1>
          <p className="max-w-[68ch] text-[15px] text-muted-foreground">
            Talleres de <strong className="font-semibold text-foreground">pocas semanas</strong> para crecer junto a otras personas. Elige uno y reserva tu lugar.
          </p>
        </section>

        {talleres.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card">
            <EstadoVacioSistema icono={Sprout} titulo="No hay talleres abiertos ahora" subtitulo="Vuelve pronto: las nuevas ediciones aparecen aquí." />
          </div>
        ) : (
          <>
            {abiertos.length > 0 && (
              <section aria-labelledby="catalogo-abiertos" className="grid gap-2">
                <div className="flex items-baseline gap-2">
                  <h2 id="catalogo-abiertos" className={`flex-1 ${encabezadoSeccion}`}>
                    Inscripciones abiertas
                  </h2>
                  <span className="text-[13px] text-muted-foreground">
                    <span className="font-mono tabular-nums">{abiertos.length}</span> {abiertos.length === 1 ? 'taller' : 'talleres'}
                  </span>
                </div>
                <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {abiertos.map((t) => (
                    <li key={t.slug}>
                      <TarjetaTaller taller={t} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {otros.length > 0 && (
              <section aria-labelledby="catalogo-otros" className="grid gap-2">
                <h2 id="catalogo-otros" className={encabezadoSeccion}>
                  Más talleres
                </h2>
                <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {otros.map((t) => (
                    <li key={t.slug}>
                      <TarjetaTaller taller={t} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="catalogo-como" className="grid content-start gap-2">
            <h2 id="catalogo-como" className={encabezadoSeccion}>
              Cómo funciona
            </h2>
            <ListaPasos
              pasos={[
                { titulo: 'Reservas tu lugar', detalle: 'Eliges el horario y nos dejas tus datos en dos minutos.' },
                { titulo: 'La coordinación te aprueba', detalle: 'Revisamos cada solicitud y te avisamos por correo y en la app.' },
                { titulo: 'Te asignamos grupo', detalle: 'Conoces a quien facilita tu grupo antes de la primera clase.' },
              ]}
            />
          </section>
          <div className="flex gap-3 self-start rounded-2xl border border-border bg-card p-4 lg:mt-6">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-text">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <b className="block text-[15px] font-semibold text-foreground">¿Ya eres parte de Global?</b>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Al reservar te pedimos tu cédula y un código. No vuelves a llenar tus datos.</p>
            </div>
          </div>
        </div>
      </main>
      <PiePublico />
    </div>
  )
}
