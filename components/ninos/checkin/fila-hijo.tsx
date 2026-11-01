'use client'

/**
 * Niños › Check-in — one child of the family at the mesa (prototype 01
 * `.hijos > li`). A child that can go in comes already marked with its
 * salón ("Preescolar 16/18"); "Cambiar" is the exception and opens the salón
 * select (N2b turns it into a side panel). A full salón warns, never blocks.
 * A child without a ficha offers "Completar ficha"; one already in shows its
 * code.
 */
import type { ReactElement } from 'react'
import { AlertTriangle, ClipboardPlus } from 'lucide-react'

import { BadgeSistema, BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { alertasDeHijo } from '@/lib/platform/ninos/checkin'
import { edadCorta, estadoCupo, type OcupacionSalon, type SalonDeHijo } from '@/lib/platform/ninos/checkin-vista'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'
import { cn } from '@/lib/utils'

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
  readonly selectorAbierto: boolean
  readonly onMarcar: (marcado: boolean) => void
  readonly onAbrirSelector: () => void
  readonly onSalon: (salonId: string) => void
  readonly onCompletar: () => void
}

export function FilaHijo(p: FilaHijoProps): ReactElement {
  const { hijo: h, salon } = p
  const nombre = `${h.nombre} ${h.apellido}`
  const edad = edadCorta(h.fecha_nacimiento, p.fecha)
  const cupo = salon.salonId ? p.ocupacion.get(salon.salonId) : undefined
  const lleno = cupo !== undefined && estadoCupo(cupo.presentes, cupo.capacidad) === 'lleno'
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
              aria-expanded={p.selectorAbierto}
              onClick={p.onAbrirSelector}
            >
              Cambiar
            </BotonSistema>
          </>
        ) : (
          <span id={idSalon} className="flex items-center gap-2 text-sm font-medium text-warning-text">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Sin salón sugerido: asígnalo manualmente
          </span>
        )}
      </div>

      {marcable && (p.selectorAbierto || !salon.salonId) && (
        <div className="col-start-2 pt-1">
          <SelectSistema
            aria-label={`Salón de ${h.nombre}`}
            opciones={[{ valor: '', etiqueta: 'Elige un salón…' }, ...p.salones.map((s) => ({ valor: s.id, etiqueta: s.nombre }))]}
            value={salon.salonId ?? ''}
            onValueChange={p.onSalon}
          />
          {salon.origen === 'manual' && (
            <p className="mt-1 px-1 text-[13px] text-muted-foreground">Si eliges otro, queda como su salón para el próximo domingo.</p>
          )}
        </div>
      )}

      {(h.es_vip_desde || h.desde_casa || alertasDeHijo(h).length > 0) && (
        <div className="col-start-2 flex min-w-0 flex-wrap gap-1.5 pt-1">
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
