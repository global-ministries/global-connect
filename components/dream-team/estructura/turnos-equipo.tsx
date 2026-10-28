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
 *
 * Dated shifts (tipo `fechas`, odd/tasks/tlr-calendario-servicios.md) are never
 * inherited by default: only a team that chooses one (and its sub-teams) serves
 * it, and choosing one does not take the weekly shifts away. Each kind is
 * saved apart: a dated shift the team still inherits unchanged is not written
 * as its own choice, and when the save lists a dated shift, neither are the
 * weekly ones the team inherits unchanged, so they stay inherited.
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
  /**
   * The campus selected in the app: only its shifts are shown and edited, and
   * the restriction of other campuses is kept as is. `null` = every campus.
   */
  readonly campusId?: string | null
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
  campusId = null,
  propios,
  efectivos,
  puedeEditar,
  onActualizado,
  toast,
}: TurnosEquipoProps): ReactElement {
  const idBase = useId()
  const [isPending, startTransition] = useTransition()
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(() => new Set(efectivos))
  const delCampus = turnos.filter((turno) => campusId === null || turno.campusId === campusId)
  const idsDelCampus = new Set(delCampus.map((turno) => turno.id))
  // The restriction this screen does not show (other campuses) travels unchanged on every save.
  const otrosCampus = propios.filter((id) => !idsDelCampus.has(id))
  const heredado = propios.every((id) => !idsDelCampus.has(id))
  const activos = ordenarTurnos(delCampus.filter((turno) => turno.activo))
  const semanales = activos.filter((turno) => turno.tipo !== 'fechas')
  const porFechas = activos.filter((turno) => turno.tipo === 'fechas')
  const nombres = activos.filter((turno) => efectivos.includes(turno.id)).map((turno) => turno.nombre)
  const ningunSemanal = semanales.length > 0 && !semanales.some((turno) => elegidos.has(turno.id))

  /** The chosen shifts of one kind, and whether the team inherits that kind and the choice did not change. */
  function eleccionDe(grupo: readonly Turno[], esFechas: boolean): { readonly ids: string[]; readonly heredadaIgual: boolean } {
    const ids = grupo.filter((turno) => elegidos.has(turno.id)).map((turno) => turno.id)
    const efectivosGrupo = grupo.filter((turno) => efectivos.includes(turno.id)).map((turno) => turno.id)
    const heredaGrupo = !delCampus.some((turno) => (turno.tipo === 'fechas') === esFechas && propios.includes(turno.id))
    const igual = ids.length === efectivosGrupo.length && ids.every((id) => efectivosGrupo.includes(id))
    return { ids, heredadaIgual: heredaGrupo && igual }
  }

  function eleccion(): string[] {
    const semanal = eleccionDe(semanales, false)
    const fechas = eleccionDe(porFechas, true)
    const idsFechas = fechas.heredadaIgual ? [] : fechas.ids
    const idsSemanales = semanal.heredadaIgual && idsFechas.length > 0 ? [] : semanal.ids
    return [...otrosCampus, ...idsSemanales, ...idsFechas]
  }

  function casilla(turno: Turno): ReactElement {
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
  }

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
          {semanales.length > 0 && <ul className="grid gap-1 sm:grid-cols-2">{semanales.map(casilla)}</ul>}
          {porFechas.length > 0 && (
            <div role="group" aria-label="Turnos por fechas" className="mt-3 grid gap-1">
              <p className="text-sm font-semibold text-foreground">Turnos por fechas</p>
              <p className="text-sm text-muted-foreground">
                Un turno por fechas sólo lo sirven los equipos que lo eligen aquí (y sus sub-equipos). Elegirlo no quita los turnos
                semanales.
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">{porFechas.map(casilla)}</ul>
            </div>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {!heredado && (
              <BotonSistema
                type="button"
                variante="outline"
                disabled={isPending}
                onClick={() => guardar(otrosCampus, `${equipoLabel} vuelve a heredar los turnos.`)}
              >
                Heredar del equipo superior
              </BotonSistema>
            )}
            <BotonSistema
              type="button"
              disabled={isPending || elegidos.size === 0 || ningunSemanal}
              onClick={() => guardar(eleccion(), 'Turnos del equipo guardados.')}
            >
              Guardar turnos
            </BotonSistema>
          </div>
        </div>
      )}
    </TarjetaSistema>
  )
}
