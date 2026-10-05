'use client'

/**
 * Estructura — "Turnos de este equipo": the campus shifts the selected team
 * serves in (D12). A team with no choice of its own inherits its parent's (by
 * default, every shift of the campus); someone who manages the structure can
 * pick the team's own shifts, which its sub-teams then inherit, or go back to
 * inheriting.
 *
 * `efectivos` comes resolved from the database (dream_team_turnos_del_equipo),
 * which sees the ancestors this screen may not.
 */
import { useId, useState, useTransition, type ReactElement } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { BotonSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { guardarTurnosEquipo } from '@/app/(auth)/admin/dream-team/estructura/turnos-actions'
import { detalleTurno, ordenarTurnos, type Turno } from '@/lib/platform/dream-team/turnos'

import { reportarResultado, type Toast } from './mensajes'

export interface TurnosEquipoProps {
  readonly equipoId: string
  readonly equipoLabel: string
  readonly turnos: readonly Turno[]
  /** The team's own restriction; empty = it inherits. */
  readonly propios: readonly string[]
  /** The shifts it serves in after inheritance. */
  readonly efectivos: readonly string[]
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
  readonly toast: Toast
}

export function TurnosEquipo({
  equipoId,
  equipoLabel,
  turnos,
  propios,
  efectivos,
  puedeEditar,
  onActualizado,
  toast,
}: TurnosEquipoProps): ReactElement {
  const idBase = useId()
  const [isPending, startTransition] = useTransition()
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(() => new Set(efectivos))
  const heredado = propios.length === 0
  const activos = ordenarTurnos(turnos.filter((turno) => turno.activo))
  const nombres = activos.filter((turno) => efectivos.includes(turno.id)).map((turno) => turno.nombre)

  function alternar(id: string): void {
    setElegidos((previos) => {
      const siguientes = new Set(previos)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      return siguientes
    })
  }

  function guardar(turnoIds: readonly string[], exito: string): void {
    startTransition(async () => {
      const resultado = await guardarTurnosEquipo({ equipoId, turnoIds })
      if (reportarResultado(toast, resultado, exito)) onActualizado()
    })
  }

  return (
    <TarjetaSistema role="region" aria-label="Turnos de este equipo" className="flex flex-col overflow-hidden p-0">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <TituloSistema nivel={3}>Turnos de este equipo</TituloSistema>
        <p className="text-sm text-muted-foreground">
          {heredado ? 'Heredados del equipo superior' : 'Elegidos para este equipo'} · sus sub-equipos los heredan
        </p>
      </div>

      <p className="px-5 py-3 text-sm text-foreground sm:px-6">
        {nombres.length > 0 ? nombres.join(' · ') : 'Ningún turno activo.'}
      </p>

      {puedeEditar && activos.length > 0 && (
        <div className="border-t border-border px-5 py-3 sm:px-6">
          <ul className="grid gap-1 sm:grid-cols-2">
            {activos.map((turno) => {
              const id = `${idBase}-${turno.id}`
              return (
                <li key={turno.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-accent">
                  <Checkbox id={id} checked={elegidos.has(turno.id)} disabled={isPending} onCheckedChange={() => alternar(turno.id)} />
                  <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col py-2">
                    <span className="text-sm font-medium text-foreground">{turno.nombre}</span>
                    <span className="text-xs text-muted-foreground">{detalleTurno(turno)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {!heredado && (
              <BotonSistema
                type="button"
                variante="outline"
                tamaño="sm"
                disabled={isPending}
                onClick={() => guardar([], `${equipoLabel} vuelve a heredar los turnos.`)}
              >
                Heredar del equipo superior
              </BotonSistema>
            )}
            <BotonSistema
              type="button"
              tamaño="sm"
              disabled={isPending || elegidos.size === 0}
              onClick={() =>
                guardar(
                  activos.filter((turno) => elegidos.has(turno.id)).map((turno) => turno.id),
                  'Turnos del equipo guardados.',
                )
              }
            >
              Guardar turnos
            </BotonSistema>
          </div>
        </div>
      )}
    </TarjetaSistema>
  )
}
