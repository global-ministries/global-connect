'use client'

/**
 * Niños › Check-in — one child of the family at the mesa (prototype 01
 * `.hijos > li`). A child that can go in comes already marked with its
 * salón ("Preescolar 16/18"); "Cambiar" is the exception and opens the
 * "Cambiar salón" panel. A full salón warns, never blocks.
 * A child without a ficha offers "Completar ficha"; one already in shows its
 * code.
 *
 * Desk rules (odd/tasks/ninos-checkin-pco.md, T2d; artboard 05 `.lleno`):
 * «Primera vez» / «Visitante» (S9.3), and a room full for this child (its
 * quota, plus the visitor places for a visitor) shows «{salón} está lleno»
 * with «Usar {otro salón}»; registering it anyway is allowed and recorded as
 * forced (S9.1).
 *
 * Custody (T2e, S9.2; artboard 05 `.q-al`): an active restriction adds the
 * «Custodia» chip, which expands to «No entregar a {persona} — {respaldo}».
 */
import type { ReactElement } from 'react'
import { AlertTriangle, ClipboardPlus } from 'lucide-react'

import { BadgeSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { alertasDeHijo } from '@/lib/platform/ninos/checkin'
import { edadCorta, estadoCupo, type OcupacionSalon, type SalonDeHijo } from '@/lib/platform/ninos/checkin-vista'
import type { RestriccionCustodia } from '@/lib/platform/ninos/custodia'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'
import { ETIQUETA_VISITA, type EstadoHijoMesa } from '@/lib/platform/ninos/mesa-reglas'
import { cn } from '@/lib/utils'

import { ChipCustodia } from '../custodia/chip-custodia'
import { Alertas } from './alertas'
import { CupoSalon, EtiquetaLleno } from './partes'

export interface FilaHijoProps {
  readonly hijo: HijoEncontrado
  readonly fecha: string
  readonly salones: readonly SalonFila[]
  readonly salon: SalonDeHijo
  readonly ocupacion: ReadonlyMap<string, OcupacionSalon>
  /** Pickup code when the child already came in to this service. */
  readonly codigo?: string
  readonly marcado: boolean
  readonly onMarcar: (marcado: boolean) => void
  /** Opens the "Cambiar salón" panel for this child. */
  readonly onCambiarSalon: () => void
  readonly onCompletar: () => void
  /** Visit badge and full room by the desk rules (T2d); without it the room is full at its quota. */
  readonly estado?: EstadoHijoMesa
  /** «Usar {otro salón}». */
  readonly onUsarOtro?: (salonId: string) => void
  /** Active custody restrictions of the child (T2e). */
  readonly custodia?: readonly RestriccionCustodia[]
}

export function FilaHijo(p: FilaHijoProps): ReactElement {
  const { hijo: h, salon } = p
  const nombre = `${h.nombre} ${h.apellido}`
  const edad = edadCorta(h.fecha_nacimiento, p.fecha)
  const cupo = salon.salonId ? p.ocupacion.get(salon.salonId) : undefined
  const lleno = p.estado ? p.estado.lleno : cupo !== undefined && estadoCupo(cupo.presentes, cupo.capacidad) === 'lleno'
  const visita = p.estado?.visita
  const etiquetaVisita = visita && visita !== 'regular' ? ETIQUETA_VISITA[visita] : null
  const otro = p.estado?.otro ?? null
  const cupoOtro = otro ? p.ocupacion.get(otro.id) : undefined
  const nombreSalon = p.salones.find((s) => s.id === salon.salonId)?.nombre ?? 'salón'
  const idSalon = `salon-${h.id}`
  const marcable = h.tiene_ficha && !p.codigo

  const nombreYEdad = (
    <span className="flex min-h-11 min-w-0 items-center gap-2 text-base font-semibold text-foreground">
      <span className="truncate">{nombre}</span>
      {edad && <span className="shrink-0 text-[13px] font-normal text-muted-foreground">{edad}</span>}
    </span>
  )

  return (
    <li
      data-testid={`nino-${h.id}`}
      className={cn(
        'grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-0.5 py-2 pr-3 pl-1 first:rounded-t-xl last:rounded-b-xl [&+li]:border-t [&+li]:border-border/60',
        marcable && p.marcado && 'bg-brand-tint',
      )}
    >
      {marcable ? (
        <>
          <label className="row-span-3 grid size-11 cursor-pointer place-items-center">
            <input
              id={`marcar-${h.id}`}
              type="checkbox"
              className="size-[22px] cursor-pointer accent-[var(--brand-strong)]"
              aria-label={nombre}
              aria-describedby={idSalon}
              checked={p.marcado}
              onChange={(e) => p.onMarcar(e.target.checked)}
            />
          </label>
          <label htmlFor={`marcar-${h.id}`} className="min-w-0 cursor-pointer">
            {nombreYEdad}
          </label>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="row-span-3" />
          {nombreYEdad}
        </>
      )}

      <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        {!h.tiene_ficha ? (
          <>
            <BadgeSistema variante="info" tamaño="sm">
              Sin ficha de niños
            </BadgeSistema>
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              icono={ClipboardPlus}
              className="ml-auto pointer-coarse:min-h-11"
              aria-label={`Completar ficha de ${nombre}`}
              onClick={p.onCompletar}
            >
              Completar ficha
            </BotonSistema>
          </>
        ) : p.codigo ? (
          <BadgeSistema variante="success" tamaño="sm">
            Ya ingresó (código <span className="font-mono tabular-nums">{p.codigo}</span>)
          </BadgeSistema>
        ) : salon.salonId ? (
          <>
            <span id={idSalon} className="min-w-0">
              <CupoSalon nombre={nombreSalon} ocupacion={cupo} />
            </span>
            {lleno && cupo && <EtiquetaLleno ocupacion={cupo} />}
            <BotonSistema
              type="button"
              variante="ghost"
              tamaño="sm"
              className="ml-auto pointer-coarse:min-h-11"
              aria-label={`Cambiar salón de ${nombre}`}
              aria-haspopup="dialog"
              onClick={p.onCambiarSalon}
            >
              Cambiar
            </BotonSistema>
          </>
        ) : (
          <>
            <span id={idSalon} className="flex items-center gap-2 text-sm font-medium text-warning-text">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              Sin salón sugerido: asígnalo manualmente
            </span>
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              className="ml-auto pointer-coarse:min-h-11"
              aria-label={`Elegir salón de ${nombre}`}
              aria-haspopup="dialog"
              onClick={p.onCambiarSalon}
            >
              Elegir salón
            </BotonSistema>
          </>
        )}
      </div>

      {marcable && p.estado && lleno && salon.salonId && cupo && (
        <div role="alert" className="col-start-2 mt-1 grid min-w-0 gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px]">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0 text-warning-text" />
            <div className="min-w-0">
              <p className="text-foreground">
                <b className="font-semibold">
                  {nombreSalon} está lleno (<span className="font-mono tabular-nums">{cupo.presentes}/{cupo.capacidad}</span>).
                </b>{' '}
                {otro ? (
                  <>
                    El siguiente que le sirve es <b className="font-semibold">{otro.nombre}</b>
                    {cupoOtro && (
                      <>
                        {' · '}
                        <span className="font-mono tabular-nums">
                          {cupoOtro.presentes}/{cupoOtro.capacidad}
                        </span>
                      </>
                    )}
                    .
                  </>
                ) : (
                  'No hay otro salón con lugar que le sirva.'
                )}
              </p>
              <p className="mt-0.5 text-muted-foreground">Si lo registras aquí, queda anotado que forzaste el cupo.</p>
            </div>
          </div>
          {otro && p.onUsarOtro && (
            <BotonSistema
              type="button"
              tamaño="sm"
              className="justify-self-start pointer-coarse:min-h-11"
              onClick={() => p.onUsarOtro?.(otro.id)}
            >
              Usar {otro.nombre}
            </BotonSistema>
          )}
        </div>
      )}

      {(h.es_vip_desde || h.desde_casa || etiquetaVisita || alertasDeHijo(h).length > 0 || (p.custodia?.length ?? 0) > 0) && (
        <div className="col-start-2 flex min-w-0 flex-wrap gap-1.5 pt-1">
          <ChipCustodia restricciones={p.custodia ?? []} />
          {etiquetaVisita && (
            <BadgeSistema variante="info" tamaño="sm">
              {etiquetaVisita}
            </BadgeSistema>
          )}
          {h.es_vip_desde && (
            <BadgeSistema variante="warning" tamaño="sm">
              VIP
            </BadgeSistema>
          )}
          {h.desde_casa && (
            <BadgeSistema variante="info" tamaño="sm">
              Registrado desde casa
            </BadgeSistema>
          )}
          <Alertas alertas={alertasDeHijo(h)} />
        </div>
      )}
    </li>
  )
}
