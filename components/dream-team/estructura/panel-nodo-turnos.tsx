'use client'

/**
 * Estructura — the Turnos tab of the node panel (S12): the shifts the team
 * serves in and where they come from; "Editar turnos" swaps in the weekly and
 * dated checkboxes, "Heredar del superior" and "Guardar turnos". Same rules
 * and server action as turnos-equipo.tsx (D12):
 *
 * - A team with no choice of its own inherits its parent's; its own choice is
 *   inherited by its subequipos.
 * - Only the app's campus is shown and edited; the restriction of other
 *   campuses travels unchanged on every save.
 * - Dated shifts are never inherited by default and do not take the weekly
 *   ones away. Each kind is saved apart: a kind the team still inherits
 *   unchanged is not written as its own choice (see `eleccion`).
 */
import { useId, useState, useTransition, type ReactElement } from 'react'
import { ArrowRight, ChevronLeft, Pencil } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { guardarTurnosEquipo } from '@/app/(auth)/admin/dream-team/estructura/turnos-actions'
import { detalleTurno, ordenarTurnos, type Turno } from '@/lib/platform/dream-team/turnos'

import { reportarResultado, type Toast } from './mensajes'

/** The shifts of the campus and the team's own and effective choice. */
export interface TurnosNodo {
  readonly turnos: readonly Turno[]
  /** The campus selected in the app; `null` = every campus. */
  readonly campusId: string | null
  /** The team's own restriction; empty = it inherits. */
  readonly propios: readonly string[]
  /** The shifts it serves in after inheritance (resolved by the database). */
  readonly efectivos: readonly string[]
}

export interface PanelNodoTurnosProps {
  readonly equipoId: string
  readonly equipoLabel: string
  readonly datos: TurnosNodo
  readonly puedeEditar: boolean
  readonly editando: boolean
  readonly onEditando: (editando: boolean) => void
  readonly onActualizado: () => void
  readonly toast: Toast
  /** Opens the "Turnos del campus" page tab; the link hides without it. */
  readonly onVerTurnosCampus?: () => void
}

const TITULO_GRUPO = 'text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground'

export function PanelNodoTurnos({
  equipoId,
  equipoLabel,
  datos,
  puedeEditar,
  editando,
  onEditando,
  onActualizado,
  toast,
  onVerTurnosCampus,
}: PanelNodoTurnosProps): ReactElement {
  const { turnos, campusId, propios, efectivos } = datos
  const idBase = useId()
  const [isPending, startTransition] = useTransition()
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(() => new Set(efectivos))
  const delCampus = turnos.filter((turno) => campusId === null || turno.campusId === campusId)
  const idsDelCampus = new Set(delCampus.map((turno) => turno.id))
  const otrosCampus = propios.filter((id) => !idsDelCampus.has(id))
  const heredado = propios.every((id) => !idsDelCampus.has(id))
  const activos = ordenarTurnos(delCampus.filter((turno) => turno.activo))
  const semanales = activos.filter((turno) => turno.tipo !== 'fechas')
  const porFechas = activos.filter((turno) => turno.tipo === 'fechas')
  const vigentes = activos.filter((turno) => efectivos.includes(turno.id))
  const conSemanal = vigentes.some((turno) => turno.tipo !== 'fechas')
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
      if (reportarResultado(toast, resultado, exito)) {
        onEditando(false)
        onActualizado()
      }
    })
  }

  function casilla(turno: Turno): ReactElement {
    const id = `${idBase}-${turno.id}`
    return (
      <li key={turno.id} className="flex min-h-11 items-center gap-3 px-3.5">
        <Checkbox id={id} checked={elegidos.has(turno.id)} disabled={isPending} onCheckedChange={() => alternar(turno.id)} />
        <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col py-2.5">
          <span className="text-sm font-medium text-foreground">{turno.nombre}</span>
          <span className="text-xs text-muted-foreground">{detalleTurno(turno)}</span>
        </label>
      </li>
    )
  }

  if (editando && puedeEditar) {
    return (
      <div className="grid gap-4">
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          icono={ChevronLeft}
          className="-ml-2 justify-self-start"
          disabled={isPending}
          onClick={() => onEditando(false)}
        >
          Turnos de {equipoLabel}
        </BotonSistema>

        <fieldset className="grid gap-2">
          <legend className={TITULO_GRUPO}>Semanales</legend>
          {semanales.length > 0 ? (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">{semanales.map(casilla)}</ul>
          ) : (
            <p className="text-sm text-muted-foreground">El campus no tiene turnos semanales activos.</p>
          )}
        </fieldset>

        {porFechas.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className={TITULO_GRUPO}>Por fechas</legend>
            <p className="text-sm text-muted-foreground">
              Solo lo sirven los equipos que lo eligen aquí (y sus subequipos). Elegirlo no quita los semanales.
            </p>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">{porFechas.map(casilla)}</ul>
          </fieldset>
        )}

        <p className="text-sm text-muted-foreground">Sus subequipos heredan esta elección. Hace falta al menos un turno semanal.</p>

        <div className="flex flex-wrap justify-end gap-2">
          {!heredado && (
            <BotonSistema
              type="button"
              variante="outline"
              disabled={isPending}
              onClick={() => guardar(otrosCampus, `${equipoLabel} vuelve a heredar los turnos.`)}
            >
              Heredar del superior
            </BotonSistema>
          )}
          <BotonSistema
            type="button"
            cargando={isPending}
            disabled={elegidos.size === 0 || ningunSemanal}
            onClick={() => guardar(eleccion(), 'Turnos del equipo guardados.')}
          >
            Guardar turnos
          </BotonSistema>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {conSemanal && (
        <p className="text-sm text-muted-foreground">
          {heredado ? 'Heredados del equipo superior' : 'Elegidos para este equipo'} · sus subequipos los heredan.
        </p>
      )}

      <ul aria-label={`Turnos de ${equipoLabel}`} className="flex flex-wrap gap-1.5">
        {vigentes.map((turno) => (
          <li
            key={turno.id}
            className="inline-flex min-h-[30px] items-center gap-2 rounded-xl border border-border bg-background px-2.5 text-[13px]"
          >
            <span className="font-medium text-foreground">{turno.nombre}</span>
            <span className="text-muted-foreground">{detalleTurno(turno)}</span>
          </li>
        ))}
        {!conSemanal && <li className="text-sm font-medium text-danger-text">Ningún turno semanal activo</li>}
      </ul>

      {puedeEditar && (
        <BotonSistema type="button" variante="outline" tamaño="sm" icono={Pencil} className="justify-self-start" onClick={() => onEditando(true)}>
          Editar turnos
        </BotonSistema>
      )}

      {onVerTurnosCampus && (
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          icono={ArrowRight}
          iconoPosicion="derecha"
          className="-ml-3 justify-self-start"
          onClick={onVerTurnosCampus}
        >
          Ver los turnos del campus
        </BotonSistema>
      )}
    </div>
  )
}
