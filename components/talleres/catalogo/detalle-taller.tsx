'use client'

/**
 * R3c (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the one drawer per
 * taller of the v2 /talleres catálogo (artboards design/talleres-interior/18
 * `#mdh` `#pp` and 19 `#hoja` `#pp`): side panel from md, bottom sheet on
 * phones (DetalleResponsivo).
 *
 * Quick actions are links to the existing routes and follow the taller
 * page's own gates, read from the same talleres_mis_permisos the page loads
 * (loadMisTalleres): «Abrir edición» (abrir_edicion) goes to the taller
 * page's ediciones section, where its form lives; «Compartir», «Avisos» and
 * «Configuración» (editar_taller) go to /compartir, /avisos and the taller
 * page's configuración. Each destination checks again.
 *
 * Próximo Paso is administered on /talleres/proximo-paso like any taller; its drawer only summarises and
 * links to /proximo-paso.
 */

import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Bell, ChevronRight, Info, PlusCircle, Settings, Share2 } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { edicionEstadoLabel } from '@/components/talleres/labels'
import { RUTA_PROXIMO_PASO } from '@/lib/platform/talleres/proximo-paso-registro'
import { rutaEdicion, rutaPendientes, rutaTaller } from '@/lib/platform/talleres/rutas'
import type { CatalogoEdicionPanel } from '@/lib/platform/talleres/catalogo'
import { cn } from '@/lib/utils'

import { BarraCupo } from './partes-catalogo'
import { DIRECCIONES, estadoProxima, formatearDia, plural, unidadDe, type FilaCatalogo } from './vista-catalogo'

const TONO_EDICION: Record<CatalogoEdicionPanel['estado'], TonoEstado> = {
  borrador: 'muted',
  abierto: 'success',
  en_curso: 'info',
  cerrado: 'muted',
  cancelado: 'danger',
}

interface Props {
  readonly fila: FilaCatalogo | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  /** The viewer can open /talleres/pendientes (the «Pendientes» tab shows). */
  readonly puedeVerPendientes: boolean
}

function Subtitulo({ id, children }: { readonly id: string; readonly children: ReactNode }): ReactElement {
  return (
    <h3 id={id} className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </h3>
  )
}

function Numero({ children }: { readonly children: ReactNode }): ReactElement {
  return <span className="font-mono tabular-nums">{children}</span>
}

function AccionRapida({ href, icono: Icono, children }: { readonly href: string; readonly icono: typeof Bell; readonly children: ReactNode }) {
  return (
    <Link
      href={href}
      className="focus-ring flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border px-2 py-3 text-center text-[13px] font-medium text-foreground press-scale transition-[background-color,transform] hover:bg-accent"
    >
      <Icono aria-hidden="true" className="size-5 text-brand-text" />
      {children}
    </Link>
  )
}

/** Warning notice: `AvisoFormulario` has no warning tone yet (components.md, planned); same composition as Temporadas. */
function AvisoAtencion({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-text" />
      <div className="grid min-w-0 gap-2">{children}</div>
    </div>
  )
}

function Datos({ filas }: { readonly filas: readonly (readonly [string, ReactNode])[] }): ReactElement {
  return (
    <dl className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
      {filas.map(([clave, valor]) => (
        <div key={clave} className="flex min-h-11 items-center justify-between gap-4 px-4 py-2 text-sm">
          <dt className="text-muted-foreground">{clave}</dt>
          <dd className="min-w-0 truncate text-right text-foreground">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DetalleTaller({ fila, abierto, onCambioAbierto, puedeVerPendientes }: Props): ReactElement | null {
  if (!fila) return null
  const { taller, proxima } = fila
  const direccion = DIRECCIONES[fila.direccion]
  const otras = taller.ediciones.filter((e) => e.id !== proxima?.id)
  const estado = estadoProxima(fila)
  const empieza = formatearDia(proxima?.fecha_inicio ?? null)
  const cierra = formatearDia(proxima?.cierre_inscripcion ?? null)
  const acciones = [
    fila.puedeAbrirEdicion && { href: `${rutaTaller(taller.slug)}#ediciones`, icono: PlusCircle, texto: 'Abrir edición' },
    fila.puedeEditar && { href: `${rutaTaller(taller.slug)}/compartir`, icono: Share2, texto: 'Compartir' },
    fila.puedeEditar && { href: `${rutaTaller(taller.slug)}/avisos`, icono: Bell, texto: 'Avisos' },
    fila.puedeEditar && { href: `${rutaTaller(taller.slug)}/configuracion`, icono: Settings, texto: 'Configuración' },
  ].filter((a): a is { href: string; icono: typeof Bell; texto: string } => Boolean(a))

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onCambioAbierto}
      titulo={taller.nombre}
      descripcion={`${direccion.nombre} · ${direccion.direccion}`}
      pie={
        <>
          <BotonSistema type="button" variante="ghost" onClick={() => onCambioAbierto(false)}>
            Cerrar
          </BotonSistema>
          <BotonSistema asChild icono={ChevronRight} iconoPosicion="derecha">
            <Link href={rutaTaller(taller.slug)}>Ver taller</Link>
          </BotonSistema>
        </>
      }
    >
      <div className="grid gap-5">
        {fila.externo ? (
          <>
            <AvisoFormulario tono="info" className="flex items-start gap-3">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" />
              <span>
                Las personas se inscriben con el enlace público. Las ediciones, la configuración y los avisos se
                manejan en la página del taller, como en cualquier otro.
              </span>
            </AvisoFormulario>
            <BotonSistema asChild variante="outline" icono={ArrowUpRight}>
              <Link href={RUTA_PROXIMO_PASO}>Ver página pública</Link>
            </BotonSistema>
          </>
        ) : (
          acciones.length > 0 && (
            <nav aria-label={`Acciones de ${taller.nombre}`} className={cn('grid gap-2', acciones.length >= 4 ? 'grid-cols-4' : 'grid-cols-3')}>
              {acciones.map((a) => (
                <AccionRapida key={a.texto} href={a.href} icono={a.icono}>
                  {a.texto}
                </AccionRapida>
              ))}
            </nav>
          )
        )}

        {proxima && fila.faltanParaMinimo !== null && (
          <AvisoAtencion>
            <p>
              <strong className="font-semibold">
                {plural(fila.faltanParaMinimo, 'Falta', 'Faltan')} <Numero>{fila.faltanParaMinimo}</Numero>{' '}
                {plural(fila.faltanParaMinimo, 'aprobado', 'aprobados')} para el mínimo.
              </strong>{' '}
              {cierra ? `La inscripción cierra el ${cierra}. ` : ''}Si al cierre no llega, decides tú: suspender y mover de
              fecha, abrir igual o cancelar.
            </p>
            {!fila.externo && (
              <Link
                href={rutaEdicion(taller.slug, proxima.id)}
                className="focus-ring inline-flex min-h-11 w-fit items-center rounded-md text-sm font-medium text-brand-text hover:underline"
              >
                Ver opciones
              </Link>
            )}
          </AvisoAtencion>
        )}

        {(fila.gruposSinFacilitador ?? 0) > 0 && (
          <AvisoFormulario tono="info" className="flex items-start gap-3">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" />
            <span>
              <strong className="font-semibold">
                <Numero>{fila.gruposSinFacilitador}</Numero>{' '}
                {plural(fila.gruposSinFacilitador ?? 0, 'grupo sin facilitador', 'grupos sin facilitador')}.
              </strong>{' '}
              Asígnalos desde los grupos de la edición.
            </span>
          </AvisoFormulario>
        )}

        <section aria-labelledby="detalle-proxima" className="grid gap-3">
          <Subtitulo id="detalle-proxima">Próxima edición</Subtitulo>
          {proxima ? (
            <div className="grid gap-3 rounded-xl border border-border/60 p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{proxima.nombre_snapshot}</span>
                <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} />
              </div>
              {(empieza || cierra) && (
                <p className="text-[13px] text-muted-foreground">
                  {[empieza && `Empieza el ${empieza}`, cierra && `cierra la inscripción el ${cierra}`].filter(Boolean).join(' · ')}
                </p>
              )}
              <BarraCupo fila={fila} />
              <Datos
                filas={[
                  ['Por aprobar', <Numero key="p">{proxima.pendientes}</Numero>],
                  ['Aprobados', <Numero key="a">{proxima.aprobados}</Numero>],
                  ...(taller.minimo_inscritos !== null
                    ? ([['Mínimo para abrir', <Numero key="m">{taller.minimo_inscritos}</Numero>]] as const)
                    : []),
                ]}
              />
              {!fila.externo && (
                <div className="flex flex-wrap gap-2">
                  <BotonSistema asChild variante="outline" className="flex-1">
                    <Link href={rutaEdicion(taller.slug, proxima.id)}>Ver inscripciones</Link>
                  </BotonSistema>
                  {proxima.pendientes > 0 && puedeVerPendientes && (
                    <BotonSistema asChild variante="outline" className="flex-1">
                      <Link href={rutaPendientes()}>
                        Aprobar <Numero>{proxima.pendientes}</Numero>
                      </Link>
                    </BotonSistema>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay una edición abierta ni planificada.
              {fila.puedeAbrirEdicion && !fila.externo ? ' Usa «Abrir edición» para crear la siguiente.' : ''}
            </p>
          )}
        </section>

        {otras.length > 0 && (
          <section aria-labelledby="detalle-otras" className="grid gap-3">
            <Subtitulo id="detalle-otras">Otras ediciones</Subtitulo>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
              {otras.map((e) => (
                <li key={e.id}>
                  <Link
                    href={rutaEdicion(taller.slug, e.id)}
                    className="focus-ring flex min-h-12 min-w-0 items-center gap-3 px-4 py-2 text-sm hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{e.nombre_snapshot}</span>
                    <span className="hidden text-[13px] text-muted-foreground sm:inline">
                      <Numero>{e.ocupados}</Numero> {unidadDe(e, e.ocupados)}
                    </span>
                    <PuntoEstado tono={TONO_EDICION[e.estado]} etiqueta={edicionEstadoLabel(e.estado)} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DetalleResponsivo>
  )
}
