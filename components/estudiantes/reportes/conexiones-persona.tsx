'use client'

/**
 * Estudiantes › Reportes — the «Conexiones» section of a The Living Room
 * person drawer (C7c of odd/tasks/estudiantes-fase-b.md, S21 with L54 / L55;
 * artboards 13 / 14 of design/estudiantes-asistencia, A41–A47). Four cards in
 * the plan's order — Con su líder, Con otros, Con la Iglesia, Con Jesús — two
 * by two from a 520px wide panel (container query of `PanelLateralSistema`),
 * stacked below. Two pieces cover gaps listed under "Planned components" in
 * docs/design-system/components.md until the system has them:
 * - GC1 `TarjetaConexion`: the `TarjetaSistema` surface with an icon and a
 *   title, then one big number or value rows with the GR4 bar.
 * - GC2 `EstadoSinRegistro`: the muted "not recorded yet" block (retiros,
 *   CGL, Irresistibles, Con Jesús), told apart from a real zero and from an
 *   empty state that points at a fix.
 * Every word and number comes from vistaConexiones
 * (lib/platform/estudiantes/conexiones.ts).
 */
import { useId, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { Church, Cross, Info, MessagesSquare, UsersRound } from 'lucide-react'

import { BadgeSistema, BotonSistema, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { vistaConexiones, type ConexionesPersona, type SinRegistro } from '@/lib/platform/estudiantes/conexiones'
import { fechaRango } from '@/lib/platform/estudiantes/reportes'

import { TituloSeccion } from '../filas-inset'
import { BarraPorcentaje } from './partes-reportes'

const CLASE_DETALLE = 'text-[13px] text-muted-foreground'

/** GC1: a summary card of one connection. */
function TarjetaConexion({ icono: Icono, titulo, children }: { readonly icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>; readonly titulo: string; readonly children: ReactNode }): ReactElement {
  const id = useId()
  return (
    <TarjetaSistema role="article" aria-labelledby={id} className="grid min-w-0 content-start gap-3 p-4">
      <div className="flex min-w-0 items-center gap-2">
        <Icono aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
        <h4 id={id} className="truncate text-[15px] font-semibold text-foreground">
          {titulo}
        </h4>
      </div>
      {children}
    </TarjetaSistema>
  )
}

/** GC2: data that is not recorded in the app yet. */
function EstadoSinRegistro({ estado }: { readonly estado: SinRegistro }): ReactElement {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-xl bg-muted p-3 text-[13px] text-muted-foreground">
      <Info aria-hidden="true" className="mt-px size-4 shrink-0" />
      <p className="min-w-0">
        <span className="block font-medium text-foreground">{estado.titulo}</span>
        <span className="block">{estado.texto}</span>
      </p>
    </div>
  )
}

function Cantidad({ valor, etiqueta, alerta = null }: { readonly valor: number; readonly etiqueta: string; readonly alerta?: string | null }): ReactElement {
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${CLASE_DETALLE}`}>
      <span className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">{valor}</span>
      <span>{etiqueta}</span>
      {alerta && (
        <BadgeSistema variante="warning" tamaño="sm" className="self-center">
          {alerta}
        </BadgeSistema>
      )}
    </p>
  )
}

function TarjetasConexiones({ persona, desde, hasta, hoy }: { readonly persona: ConexionesPersona; readonly desde: string; readonly hasta: string; readonly hoy: string }): ReactElement {
  const v = vistaConexiones(persona, { desde, hasta, hoy })
  return (
    <div className="grid grid-cols-1 gap-2.5 @min-[520px]:grid-cols-2">
      <TarjetaConexion icono={MessagesSquare} titulo={v.lider.titulo}>
        <Cantidad valor={v.lider.cantidad} etiqueta={v.lider.etiqueta} alerta={v.lider.alerta} />
        <dl className="grid gap-1.5 text-[13px]">
          {v.lider.datos.map((d) => (
            <div key={d.etiqueta} className="flex min-w-0 items-baseline justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">{d.etiqueta}</dt>
              <dd className="min-w-0 truncate text-right font-medium tabular-nums text-foreground">{d.valor}</dd>
            </div>
          ))}
        </dl>
        <p className={CLASE_DETALLE}>{v.lider.nota}</p>
      </TarjetaConexion>

      <TarjetaConexion icono={UsersRound} titulo={v.otros.titulo}>
        <div className="grid min-w-0 divide-y divide-border/60">
          {v.otros.filas.map((f) => (
            <div key={f.clave} className="grid min-w-0 gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-foreground">{f.titulo}</span>
                  <span className={`mt-0.5 block truncate ${CLASE_DETALLE}`}>{f.subtitulo}</span>
                </span>
                <span className="grid shrink-0 justify-items-end gap-0.5 text-right">
                  <span className="font-mono text-[15px] font-medium tabular-nums text-foreground">{f.valor}</span>
                  {f.detalle && <span className={`tabular-nums ${CLASE_DETALLE}`}>{f.detalle}</span>}
                </span>
              </div>
              {f.porcentaje !== null && <BarraPorcentaje porcentaje={f.porcentaje} />}
            </div>
          ))}
        </div>
      </TarjetaConexion>

      <TarjetaConexion icono={Church} titulo={v.iglesia.titulo}>
        <Cantidad valor={v.iglesia.cantidad} etiqueta={v.iglesia.etiqueta} />
        {v.iglesia.talleres.length > 0 ? (
          <ul aria-label="Talleres completados" className="grid gap-1.5 text-[13px]">
            {v.iglesia.talleres.map((t) => (
              <li key={t.clave} className="flex min-w-0 justify-between gap-2">
                <span className="min-w-0 truncate text-foreground">{t.taller}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{t.anio}</span>
              </li>
            ))}
          </ul>
        ) : (
          v.iglesia.vacio && <p className={CLASE_DETALLE}>{v.iglesia.vacio}</p>
        )}
        <EstadoSinRegistro estado={v.iglesia.sinRegistro} />
      </TarjetaConexion>

      <TarjetaConexion icono={Cross} titulo={v.jesus.titulo}>
        <EstadoSinRegistro estado={v.jesus.sinRegistro} />
      </TarjetaConexion>
    </div>
  )
}

export interface SeccionConexionesProps {
  readonly persona: ConexionesPersona | null
  readonly cargando: boolean
  readonly error: string | null
  readonly onReintentar: () => void
  readonly desde: string
  readonly hasta: string
  readonly hoy: string
}

/** Between the attendance note and «Reunión por reunión» (A42). */
export function SeccionConexiones({ persona, cargando, error, onReintentar, desde, hasta, hoy }: SeccionConexionesProps): ReactElement {
  return (
    <section aria-labelledby="reporte-detalle-conexiones" aria-busy={cargando || undefined} className="space-y-2.5">
      <TituloSeccion id="reporte-detalle-conexiones" texto="Conexiones" pista={`${fechaRango(desde, hasta)} · talleres en total`} />
      {error ? (
        <div className="space-y-3">
          <AvisoFormulario tono="error">{error}</AvisoFormulario>
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onReintentar}>
            Reintentar
          </BotonSistema>
        </div>
      ) : persona && !cargando ? (
        <TarjetasConexiones persona={persona} desde={desde} hasta={hasta} hoy={hoy} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 @min-[520px]:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <SkeletonSistema key={i} alto="148px" className="rounded-2xl" />
          ))}
        </div>
      )}
    </section>
  )
}
