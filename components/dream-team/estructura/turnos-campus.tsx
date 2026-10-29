'use client'

/**
 * Estructura — the "Turnos del campus" tab (S12, D12; prototype
 * `renderTurnos`): the shifts of the campus selected in the app, shared by
 * every dirección. Two cards, "Semanales" (every team inherits them unless it
 * chooses its own) and "Por fechas" (no weekday; only the teams that choose
 * one serve it, its dates are planned in Mi equipo), and the deactivated ones
 * folded under "Desactivados (n)". Each row shows the day and hour and, for
 * someone who manages the structure, an `Interruptor` to enable or disable
 * it. A shift is never deleted: servicios may be assigned to it.
 *
 * "Agregar turno" (formulario-turno.tsx) opens from the page's primary
 * action when the parent controls it (`nuevoAbierto`), else from a button
 * here.
 */
import { useState, useTransition, type ReactElement } from 'react'
import { ChevronDown, Plus } from 'lucide-react'

import { Interruptor } from '@/components/ui/interruptor'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { cambiarActivoTurno } from '@/app/(auth)/admin/dream-team/estructura/turnos-actions'
import { detalleTurno, ordenarTurnos, type Turno } from '@/lib/platform/dream-team/turnos'

import { FormularioTurno } from './formulario-turno'
import { reportarResultado, type Toast } from './mensajes'

export interface CampusOpcion {
  readonly id: string
  readonly nombre: string
}

export interface TurnosCampusProps {
  readonly campus: readonly CampusOpcion[]
  readonly turnos: readonly Turno[]
  /** The campus selected in the app: only it is listed. `null` (or unknown) = every campus. */
  readonly campusId?: string | null
  readonly puedeEditar: boolean
  /** "Agregar turno" controlled by the page (header action, FAB); internal with its own button when absent. */
  readonly nuevoAbierto?: boolean
  readonly onNuevoAbierto?: (abierto: boolean) => void
  readonly onActualizado: () => void
  readonly toast: Toast
}

const TARJETA = 'overflow-hidden rounded-2xl border border-border bg-card'

function TurnoFila({ turno, puedeEditar, onActualizado, toast }: {
  readonly turno: Turno
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
  readonly toast: Toast
}): ReactElement {
  const [isPending, startTransition] = useTransition()

  function alternar(activo: boolean): void {
    startTransition(async () => {
      const resultado = await cambiarActivoTurno({ id: turno.id, activo })
      if (reportarResultado(toast, resultado, activo ? 'Turno activado.' : 'Turno desactivado.')) onActualizado()
    })
  }

  return (
    <li className="flex min-h-16 items-center gap-3 py-2 pr-2.5 pl-4 sm:pl-5">
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn('truncate text-[15px] font-medium', turno.activo ? 'text-foreground' : 'text-muted-foreground')}>{turno.nombre}</span>
        <span className="text-[13px] text-muted-foreground">{turno.activo ? detalleTurno(turno) : `${detalleTurno(turno)} · Desactivado`}</span>
      </span>
      {puedeEditar ? (
        <Interruptor activo={turno.activo} onCambio={alternar} disabled={isPending} aria-label={`Turno ${turno.nombre}`} />
      ) : (
        <PuntoEstado tono={turno.activo ? 'success' : 'muted'} etiqueta={turno.activo ? 'Activo' : 'Desactivado'} />
      )}
    </li>
  )
}

function Tarjeta({ titulo, descripcion, turnos, vacio, ...fila }: {
  readonly titulo: string
  readonly descripcion: string
  readonly turnos: readonly Turno[]
  readonly vacio: string
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
  readonly toast: Toast
}): ReactElement {
  return (
    <section aria-label={titulo} className={TARJETA}>
      <div className="border-b border-border px-4 py-3.5 sm:px-5">
        <h3 className="text-base font-semibold text-foreground">{titulo}</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{descripcion}</p>
      </div>
      {turnos.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="divide-y divide-border">
          {turnos.map((turno) => (
            <TurnoFila key={turno.id} turno={turno} {...fila} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function TurnosCampus({
  campus: todos,
  turnos,
  campusId = null,
  puedeEditar,
  nuevoAbierto,
  onNuevoAbierto,
  onActualizado,
  toast,
}: TurnosCampusProps): ReactElement {
  const [nuevoLocal, setNuevoLocal] = useState(false)
  const controlado = onNuevoAbierto !== undefined
  const abierto = controlado ? (nuevoAbierto ?? false) : nuevoLocal
  const cambiarNuevo = onNuevoAbierto ?? setNuevoLocal
  const elegido = todos.filter((opcion) => opcion.id === campusId)
  const campus = elegido.length > 0 ? elegido : todos
  const varios = campus.length > 1
  const fila = { puedeEditar, onActualizado, toast }

  return (
    <div role="region" aria-label="Turnos del campus" className="grid gap-6">
      {puedeEditar && !controlado && campus.length > 0 && (
        <div>
          <BotonSistema type="button" variante="outline" tamaño="sm" icono={Plus} onClick={() => cambiarNuevo(true)}>
            Agregar turno
          </BotonSistema>
        </div>
      )}
      {campus.length === 0 && <p className={cn(TARJETA, 'px-6 py-8 text-center text-sm text-muted-foreground')}>El campus todavía no tiene turnos.</p>}
      {campus.map((opcion) => {
        const delCampus = ordenarTurnos(turnos.filter((turno) => turno.campusId === opcion.id))
        const activos = delCampus.filter((turno) => turno.activo)
        const apagados = delCampus.filter((turno) => !turno.activo)
        return (
          <section key={opcion.id} aria-label={varios ? opcion.nombre : undefined} className="grid gap-4">
            {varios && <h2 className="text-lg font-semibold text-foreground">{opcion.nombre}</h2>}
            {delCampus.length === 0 ? (
              <p className={cn(TARJETA, 'px-6 py-8 text-center text-sm text-muted-foreground')}>El campus todavía no tiene turnos.</p>
            ) : (
              <>
                <div className="grid items-start gap-4 lg:grid-cols-2">
                  <Tarjeta
                    titulo="Semanales"
                    descripcion={`${opcion.nombre} · todos los equipos los heredan, salvo que elijan los suyos`}
                    turnos={activos.filter((turno) => turno.tipo !== 'fechas')}
                    vacio="No hay turnos semanales activos."
                    {...fila}
                  />
                  <Tarjeta
                    titulo="Por fechas"
                    descripcion="Sin día fijo: solo los sirven los equipos que los eligen. Las fechas se planifican en Mi equipo."
                    turnos={activos.filter((turno) => turno.tipo === 'fechas')}
                    vacio="No hay turnos por fechas activos."
                    {...fila}
                  />
                </div>
                {apagados.length > 0 && (
                  <details className={cn(TARJETA, 'group')}>
                    <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-foreground sm:px-5 [&::-webkit-details-marker]:hidden">
                      <span>
                        Desactivados (<span className="font-mono tabular-nums">{apagados.length}</span>)
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </summary>
                    <ul className="divide-y divide-border border-t border-border">
                      {apagados.map((turno) => (
                        <TurnoFila key={turno.id} turno={turno} {...fila} />
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>
        )
      })}
      {puedeEditar && campus.length > 0 && (
        <FormularioTurno
          abierto={abierto}
          onCambioAbierto={cambiarNuevo}
          campus={campus}
          turnos={turnos}
          onActualizado={onActualizado}
          toast={toast}
        />
      )}
    </div>
  )
}
