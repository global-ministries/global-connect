/**
 * «Tus próximos pasos» (design/home-por-rol section 6). Who has not done
 * Próximo Paso sees it first and highlighted (S3); the steps decidirSecciones
 * returns are the only ones named, so Dream Team appears only when the
 * section includes «Servir en Dream Team».
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { PasoInicio } from '@/lib/inicio/decidir-secciones'
import { cn } from '@/lib/utils'

import { CLASE_LISTA_INSET, EncabezadoSeccion, Numero } from './partes-inicio'
import { DESCRIPCION_PROXIMO_PASO, PASOS, RUTA_PROXIMO_PASO } from './textos-inicio'

function ProximoPasoDestacado(): ReactElement {
  return (
    <article aria-labelledby="inicio-proximo-paso" className="mb-2.5 rounded-2xl bg-brand-tint p-4 ring-[1.5px] ring-inset ring-brand">
      <PuntoEstado tono="warning" etiqueta="Tu siguiente paso" />
      <h3 id="inicio-proximo-paso" className="mt-2 text-[19px] font-semibold tracking-[-0.01em] text-foreground">
        Próximo Paso
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{DESCRIPCION_PROXIMO_PASO}</p>
      <BotonSistema asChild className="mt-3 w-full sm:w-auto">
        <Link href={RUTA_PROXIMO_PASO}>Inscribirme</Link>
      </BotonSistema>
    </article>
  )
}

export function SeccionProximosPasos({ pasos, className }: { readonly pasos: PasoInicio[]; readonly className?: string }): ReactElement {
  const hechos = pasos.filter((p) => p.hecho).length
  const destacado = pasos.some((p) => p.destacado)
  const filas = pasos.filter((p) => !p.destacado)

  return (
    <section aria-labelledby="inicio-proximos-pasos" className={className}>
      <EncabezadoSeccion id="inicio-proximos-pasos" titulo="Tus próximos pasos" />
      {destacado && <ProximoPasoDestacado />}
      <div className={CLASE_LISTA_INSET}>
        <div className="px-4 pt-3.5 pb-3">
          <p className="text-[15px] font-semibold text-foreground">
            <Numero>{hechos}</Numero> de <Numero>{pasos.length}</Numero> pasos
          </p>
          <span aria-hidden="true" className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-success" style={{ width: `${Math.round((hechos / pasos.length) * 100)}%` }} />
          </span>
        </div>
        <ul aria-labelledby="inicio-proximos-pasos">
          {filas.map((paso) => {
            const t = PASOS[paso.id]
            return (
              <li
                key={paso.id}
                className="relative flex min-h-16 min-w-0 items-center gap-3 px-3.5 py-2.5 before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border/60"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                    paso.hecho ? 'border-success bg-success text-brand-foreground' : 'border-border text-transparent',
                  )}
                >
                  <Check className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-base', paso.hecho ? 'font-medium text-muted-foreground' : 'font-semibold text-foreground')}>
                    {t.titulo}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{paso.hecho ? t.hecho : t.pendiente}</span>
                </span>
                {paso.hecho ? (
                  <span className="sr-only">Completado</span>
                ) : (
                  <BotonSistema asChild variante="outline" tamaño="sm">
                    <Link href={t.href}>{t.cta}</Link>
                  </BotonSistema>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
