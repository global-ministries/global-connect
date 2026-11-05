/**
 * Pendientes — the "% en orden" bar and the strip of Mi equipo
 * (odd/tasks/dream-team-pendientes-director.md, T4, S6; the strip of artboards
 * design/pendientes-director/03 and 04, without B's "Pendientes" tab).
 *
 * `FranjaPendientes` sits at the top of Mi equipo on every tab: the "% en
 * orden", the urgent counts (only those above 0, as dot + label) and how many
 * people have something pending, linking to /dream-team/pendientes. Nothing
 * when the summary could not be read, or when there is neither a person nor
 * an urgent item in scope.
 *
 * Server-safe: no hooks, no handlers.
 */
import Link from 'next/link'
import type { ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'

import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import type { ResumenPendientes } from '@/lib/platform/dream-team/pendientes'

export const RUTA_PENDIENTES = '/dream-team/pendientes'

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

/** The urgent counts above 0, as the strip and the page summary name them (S7). */
export function urgentesDe(resumen: ResumenPendientes): { readonly texto: string; readonly tono: TonoEstado }[] {
  const urgentes: { texto: string; tono: TonoEstado }[] = []
  if (resumen.areasSinServidores > 0) {
    urgentes.push({ texto: plural(resumen.areasSinServidores, 'puesto sin servidores', 'puestos sin servidores'), tono: 'danger' })
  }
  if (resumen.solicitudes > 0) {
    urgentes.push({ texto: plural(resumen.solicitudes, 'solicitud de cambio de área', 'solicitudes de cambio de área'), tono: 'info' })
  }
  if (resumen.invitacionesVencidas > 0) {
    urgentes.push({ texto: plural(resumen.invitacionesVencidas, 'invitación vencida', 'invitaciones vencidas'), tono: 'warning' })
  }
  return urgentes
}

/** "83%" over a 6px bar; the bar is an image named "83% en orden". */
export function BarraEnOrden({ porcentaje, className }: { readonly porcentaje: number; readonly className?: string }): ReactElement {
  return (
    <span role="img" aria-label={`${porcentaje}% en orden`} className={`block h-1.5 overflow-hidden rounded-full bg-muted ${className ?? ''}`}>
      <span
        className="block h-full rounded-full bg-success transition-[width] duration-500 ease-[var(--ease-out-quint)]"
        style={{ width: `${porcentaje}%` }}
      />
    </span>
  )
}

export function FranjaPendientes({ resumen }: { readonly resumen: ResumenPendientes | null | undefined }): ReactElement | null {
  // Nothing to say without people and without urgentes.
  if (!resumen || (resumen.personasTotal === 0 && resumen.urgentes === 0)) return null
  const urgentes = urgentesDe(resumen)
  const conPendientes = resumen.personasTotal - resumen.personasEnOrden

  return (
    <TarjetaSistema role="region" aria-label="Estado de tu equipo" className="p-4">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-5">
        {resumen.porcentaje !== null && (
          <div className="grid min-w-0 gap-1.5 md:w-44 md:shrink-0">
            <p className="text-sm text-muted-foreground">
              <strong className="mr-1.5 font-mono text-2xl font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                {resumen.porcentaje}%
              </strong>
              en orden
            </p>
            <BarraEnOrden porcentaje={resumen.porcentaje} />
          </div>
        )}
        <div className="grid min-w-0 flex-1 gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Urgente</p>
          {urgentes.length > 0 ? (
            <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
              {urgentes.map((urgente) => (
                <li key={urgente.texto} className="min-w-0">
                  <PuntoEstado tono={urgente.tono} etiqueta={urgente.texto} />
                </li>
              ))}
            </ul>
          ) : (
            <PuntoEstado tono="success" etiqueta="Nada urgente" />
          )}
        </div>
        {conPendientes > 0 && (
          <p className="text-[13px] text-muted-foreground md:shrink-0">
            <strong className="font-mono font-semibold text-foreground tabular-nums">{conPendientes}</strong>
            {conPendientes === 1 ? ' persona con algo pendiente' : ' personas con algo pendiente'}
          </p>
        )}
        <BotonSistema asChild variante="outline" tamaño="sm" className="md:shrink-0">
          <Link
            href={RUTA_PENDIENTES}
            aria-label={resumen.urgentes > 0 ? `Ver pendientes, ${plural(resumen.urgentes, 'urgente', 'urgentes')}` : 'Ver pendientes'}
          >
            Ver pendientes
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </BotonSistema>
      </div>
    </TarjetaSistema>
  )
}
