'use client'

/**
 * Estructura — "Turnos de servicio": the shifts of each campus, shared by
 * every dirección (D12). One row per shift with its day and hour and, for
 * someone who manages the structure, a switch to enable or disable it and a
 * form to add one. A shift is never deleted: servicios may be assigned to it.
 */
import { useState, useTransition, type FormEvent, type ReactElement } from 'react'

import { BadgeSistema, BotonSistema, InputSistema, SelectSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { cambiarActivoTurno, crearTurno } from '@/app/(auth)/admin/dream-team/estructura/turnos-actions'
import { DIAS_SEMANA, detalleTurno, ordenarTurnos, type Turno } from '@/lib/platform/dream-team/turnos'

import { ANILLO_FOCO, reportarResultado, type Toast } from './mensajes'

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
  readonly onActualizado: () => void
  readonly toast: Toast
}

function TurnoFila({
  turno,
  puedeEditar,
  onActualizado,
  toast,
}: {
  readonly turno: Turno
  readonly puedeEditar: boolean
  readonly onActualizado: () => void
  readonly toast: Toast
}): ReactElement {
  const [isPending, startTransition] = useTransition()

  function alternar(): void {
    startTransition(async () => {
      const resultado = await cambiarActivoTurno({ id: turno.id, activo: !turno.activo })
      if (reportarResultado(toast, resultado, turno.activo ? 'Turno desactivado.' : 'Turno activado.')) onActualizado()
    })
  }

  return (
    <li className="flex min-h-[60px] items-center gap-3 py-1 pl-5 pr-3 sm:pl-6">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('truncate text-sm font-medium sm:text-base', turno.activo ? 'text-foreground' : 'text-muted-foreground')}>
          {turno.nombre}
        </span>
        <span className="text-sm text-muted-foreground">
          {turno.activo ? detalleTurno(turno) : `${detalleTurno(turno)} · Desactivado`}
        </span>
      </span>
      {puedeEditar ? (
        <button
          type="button"
          role="switch"
          aria-checked={turno.activo}
          aria-label={`Turno ${turno.nombre}`}
          title={turno.activo ? 'Desactivar turno' : 'Activar turno'}
          disabled={isPending}
          onClick={alternar}
          className={cn('flex h-11 w-12 shrink-0 items-center justify-center rounded-xl disabled:opacity-50', ANILLO_FOCO)}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex h-6 w-11 items-center rounded-full p-[3px] transition-colors',
              turno.activo ? 'justify-end bg-[var(--brand-primary)]' : 'justify-start bg-input',
            )}
          >
            <span className="h-[18px] w-[18px] rounded-full bg-background shadow-sm" />
          </span>
        </button>
      ) : (
        <BadgeSistema variante={turno.activo ? 'success' : 'default'} tamaño="sm">
          {turno.activo ? 'Activo' : 'Desactivado'}
        </BadgeSistema>
      )}
    </li>
  )
}

function FormularioTurnoNuevo({
  campus,
  turnos,
  onActualizado,
  toast,
}: Omit<TurnosCampusProps, 'puedeEditar'>): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [campusId, setCampusId] = useState(campus[0]?.id ?? '')
  const [nombre, setNombre] = useState('')
  const [dia, setDia] = useState('0')
  const [hora, setHora] = useState('09:00')
  const label = nombre.trim()

  function agregar(event: FormEvent): void {
    event.preventDefault()
    if (!label || !campusId) return
    // New shifts go last in their campus.
    const orden = Math.max(0, ...turnos.filter((turno) => turno.campusId === campusId).map((turno) => turno.orden)) + 1
    startTransition(async () => {
      const resultado = await crearTurno({ campusId, nombre: label, diaSemana: Number(dia), hora, orden })
      if (reportarResultado(toast, resultado, 'Turno agregado correctamente.')) {
        setNombre('')
        onActualizado()
      }
    })
  }

  return (
    <form onSubmit={agregar} className="grid gap-3 border-t border-border px-5 py-4 sm:grid-cols-2 sm:px-6">
      {campus.length > 1 && (
        <SelectSistema
          label="Campus"
          opciones={campus.map((opcion) => ({ valor: opcion.id, etiqueta: opcion.nombre }))}
          value={campusId}
          onValueChange={setCampusId}
          disabled={isPending}
        />
      )}
      <InputSistema
        label="Nombre del turno"
        placeholder="Domingo 9:00"
        value={nombre}
        onChange={(event) => setNombre(event.target.value)}
        disabled={isPending}
      />
      <SelectSistema
        label="Día"
        opciones={DIAS_SEMANA.map((nombreDia, indice) => ({ valor: String(indice), etiqueta: nombreDia }))}
        value={dia}
        onValueChange={setDia}
        disabled={isPending}
      />
      <InputSistema label="Hora" type="time" value={hora} onChange={(event) => setHora(event.target.value)} disabled={isPending} />
      <div className="flex items-end">
        <BotonSistema type="submit" variante="outline" tamaño="sm" disabled={isPending || !label || !campusId || !hora}>
          Agregar turno
        </BotonSistema>
      </div>
    </form>
  )
}

export function TurnosCampus({
  campus: todos,
  turnos,
  campusId = null,
  puedeEditar,
  onActualizado,
  toast,
}: TurnosCampusProps): ReactElement {
  const elegido = todos.filter((opcion) => opcion.id === campusId)
  const campus = elegido.length > 0 ? elegido : todos
  const varios = campus.length > 1
  const grupos = campus
    .map((opcion) => ({ ...opcion, turnos: ordenarTurnos(turnos.filter((turno) => turno.campusId === opcion.id)) }))
    .filter((grupo) => grupo.turnos.length > 0)

  return (
    <TarjetaSistema role="region" aria-label="Turnos de servicio" className="flex flex-col overflow-hidden p-0">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <TituloSistema nivel={3}>Turnos de servicio</TituloSistema>
        <p className="text-sm text-muted-foreground">Los turnos del campus, compartidos por todas las direcciones</p>
      </div>

      {grupos.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">El campus todavía no tiene turnos.</p>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.id} aria-label={varios ? grupo.nombre : undefined}>
            {varios && <h4 className="px-5 pt-3 text-sm font-semibold text-foreground sm:px-6">{grupo.nombre}</h4>}
            <ul className="divide-y divide-border">
              {grupo.turnos.map((turno) => (
                <TurnoFila key={turno.id} turno={turno} puedeEditar={puedeEditar} onActualizado={onActualizado} toast={toast} />
              ))}
            </ul>
          </section>
        ))
      )}

      {puedeEditar && campus.length > 0 && (
        <FormularioTurnoNuevo campus={campus} turnos={turnos} onActualizado={onActualizado} toast={toast} />
      )}
    </TarjetaSistema>
  )
}
