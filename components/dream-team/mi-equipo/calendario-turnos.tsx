'use client'

/**
 * Mi equipo — the "Calendario" tab (S11 decisions 8 and 9 of
 * odd/tasks/sistema-diseno-v2.md; A2, S1, S2, S4 of
 * odd/tasks/tlr-calendario-servicios.md; prototype 04-calendario). The Living
 * Room has no fixed day: its coordinator plans the dates ahead ("+ Fecha":
 * fecha, hora optional, nota optional) and, per date, picks among the
 * volunteers of the scope assigned to the shift who serves, with "Todos" in
 * one click.
 *
 * One block per dated shift: its name, "Por fechas · hora · N voluntarios
 * asignados al turno", "+ Fecha" for whoever may plan it, then the upcoming
 * dates as list rows (day tile, weekday and date, hora and nota, "N de M
 * sirven" with a bar, chevron) and the past ones collapsed in a `details`.
 * The data comes from `useCalendarioTurnos` (calendario-datos.ts), loaded by
 * the screen so it knows whether to offer the tab.
 */
import { useState, type ReactElement } from 'react'
import { CalendarDays, ChevronRight, Plus } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { isoLocal } from '@/lib/platform/dream-team/frecuencia-turno'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { TEXTO_POR_FECHAS, etiquetaFecha, horaDeFecha, separarFechas, textoSirven, type FechaTurno } from '@/lib/platform/dream-team/turno-fechas'
import { cn } from '@/lib/utils'

import { asignadosDe, type Asignado, type Toast, type TurnoCalendario } from './calendario-datos'
import { FormularioFecha } from './formulario-fecha'
import { PanelFecha } from './panel-fecha'

export interface CalendarioTurnosProps {
  /** The dated shifts of the scope (`useCalendarioTurnos`). */
  readonly turnos: readonly TurnoCalendario[]
  /** After a saved change: load the calendar again. */
  readonly onCambiado: () => void
  /** The people of the scope. */
  readonly personas: readonly PersonaVista[]
  readonly toast: Toast
  /** "YYYY-MM-DD"; defaults to today. */
  readonly hoy?: string
}

export function CalendarioTurnos({ turnos, onCambiado, personas, toast, hoy: hoyProp }: CalendarioTurnosProps): ReactElement {
  const hoy = hoyProp ?? isoLocal(new Date())
  const [abierta, setAbierta] = useState<{ readonly turnoId: string; readonly fechaId: string } | null>(null)
  const [formulario, setFormulario] = useState<{ readonly turnoId: string; readonly fecha: FechaTurno | null } | null>(null)

  const turnoAbierto = abierta ? turnos.find((turno) => turno.id === abierta.turnoId) : undefined
  const fechaAbierta = abierta ? turnoAbierto?.fechas.find((fecha) => fecha.id === abierta.fechaId) : undefined
  const turnoFormulario = formulario ? turnos.find((turno) => turno.id === formulario.turnoId) : undefined

  return (
    <div className="grid min-w-0 gap-8">
      {turnos.map((turno) => (
        <CalendarioDeTurno
          key={turno.id}
          turno={turno}
          asignados={asignadosDe(personas, turno.id)}
          hoy={hoy}
          onAbrirFecha={(fechaId) => setAbierta({ turnoId: turno.id, fechaId })}
          onAgregarFecha={() => setFormulario({ turnoId: turno.id, fecha: null })}
        />
      ))}

      {turnoAbierto && fechaAbierta && (
        <PanelFecha
          key={fechaAbierta.id}
          turno={turnoAbierto}
          fecha={fechaAbierta}
          asignados={asignadosDe(personas, turnoAbierto.id)}
          hoy={hoy}
          toast={toast}
          onCerrar={() => setAbierta(null)}
          onCambiado={onCambiado}
          onEditar={() => {
            setAbierta(null)
            setFormulario({ turnoId: turnoAbierto.id, fecha: fechaAbierta })
          }}
        />
      )}

      {formulario && turnoFormulario && (
        <FormularioFecha
          key={formulario.fecha?.id ?? `nueva-${turnoFormulario.id}`}
          turno={turnoFormulario}
          fecha={formulario.fecha}
          toast={toast}
          onCerrar={() => setFormulario(null)}
          onGuardado={onCambiado}
        />
      )}
    </div>
  )
}

/** The upcoming dates of the shifts: the count next to the tab. */
export function contarProximas(turnos: readonly TurnoCalendario[], hoy: string): number {
  return turnos.reduce((total, turno) => total + separarFechas(turno.fechas, hoy).proximas.length, 0)
}

// ── One shift: its dates ─────────────────────────────────────────────────

function FilaFecha({
  fecha,
  turno,
  asignados,
  hoy,
  pasada,
  onAbrir,
}: {
  readonly fecha: FechaTurno
  readonly turno: TurnoCalendario
  readonly asignados: readonly Asignado[]
  readonly hoy: string
  readonly pasada: boolean
  readonly onAbrir: () => void
}): ReactElement {
  const visibles = new Set(asignados.map((asignado) => asignado.servicioId))
  const sirven = fecha.servidores.filter((id) => visibles.has(id)).length
  const etiqueta = etiquetaFecha(fecha.fecha, hoy)
  // "Domingo 8 nov" → the day tile reads "8" over "NOV".
  const [, dia = '', mes = ''] = etiqueta.split(' ')
  const proporcion = asignados.length > 0 ? Math.round((sirven / asignados.length) * 100) : 0
  const completo = asignados.length > 0 && sirven === asignados.length

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={onAbrir}
        className="focus-ring flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/50 active:bg-accent md:min-h-[72px] md:px-[18px] md:py-3"
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-11 shrink-0 place-content-center rounded-lg border text-center',
            pasada ? 'border-border bg-muted' : 'border-brand/40 bg-brand-tint',
          )}
        >
          <b className="font-mono text-[17px] font-semibold leading-none tabular-nums text-foreground">{dia}</b>
          <small className={cn('mt-0.5 text-xs font-medium uppercase tracking-[0.04em]', pasada ? 'text-muted-foreground' : 'text-brand-text')}>
            {mes}
          </small>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-foreground">{etiqueta}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
            <span className="font-mono tabular-nums">{horaDeFecha(fecha, turno.hora)}</span>
            {fecha.nota ? ` · ${fecha.nota}` : ''}
          </span>
        </span>
        <span className="grid shrink-0 justify-items-end gap-1.5 text-[13px] text-muted-foreground">
          <span className={cn('tabular-nums', completo && 'text-success-text')}>{textoSirven(sirven, asignados.length)}</span>
          <span aria-hidden="true" className="block h-1 w-[72px] overflow-hidden rounded-full bg-muted">
            <span className={cn('block h-full rounded-full', completo ? 'bg-success' : 'bg-info')} style={{ width: `${proporcion}%` }} />
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

function CalendarioDeTurno({
  turno,
  asignados,
  hoy,
  onAbrirFecha,
  onAgregarFecha,
}: {
  readonly turno: TurnoCalendario
  readonly asignados: readonly Asignado[]
  readonly hoy: string
  readonly onAbrirFecha: (fechaId: string) => void
  readonly onAgregarFecha: () => void
}): ReactElement {
  const { proximas, pasadas } = separarFechas(turno.fechas, hoy)
  const fila = (fecha: FechaTurno, pasada: boolean): ReactElement => (
    <FilaFecha
      key={fecha.id}
      fecha={fecha}
      turno={turno}
      asignados={asignados}
      hoy={hoy}
      pasada={pasada}
      onAbrir={() => onAbrirFecha(fecha.id)}
    />
  )
  const voluntarios = `${asignados.length} ${asignados.length === 1 ? 'voluntario asignado' : 'voluntarios asignados'} al turno`

  return (
    <section aria-label={`Calendario · ${turno.nombre}`} className="grid min-w-0 gap-2.5">
      <div className="flex flex-wrap items-center gap-3 px-1 md:px-0">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-foreground">{turno.nombre}</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {`${TEXTO_POR_FECHAS} · `}
            <span className="font-mono tabular-nums">{turno.hora}</span>
            {` · ${voluntarios}`}
          </p>
        </div>
        {turno.puedeGestionar && (
          <BotonSistema type="button" variante="outline" tamaño="sm" icono={Plus} aria-label="Agregar fecha" onClick={onAgregarFecha}>
            Fecha
          </BotonSistema>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3 px-1 pt-1 md:px-0">
        <h4 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Próximas fechas</h4>
        <span className="hidden text-xs text-muted-foreground md:inline">Tocá una fecha para elegir quién sirve</span>
      </div>

      <div className="overflow-hidden rounded-2xl bg-card md:border md:border-border">
        {proximas.length === 0 ? (
          <EstadoVacioSistema
            icono={CalendarDays}
            titulo="No hay próximas fechas"
            subtitulo={turno.puedeGestionar ? 'Agregá la siguiente con «+ Fecha».' : 'Todavía no se planificaron fechas.'}
          />
        ) : (
          <ul aria-label="Próximas fechas">{proximas.map((fecha) => fila(fecha, false))}</ul>
        )}

        {pasadas.length > 0 && (
          <details className="border-t border-border/60">
            <summary className="focus-ring flex min-h-12 cursor-pointer items-center px-3.5 text-sm font-medium text-muted-foreground md:px-[18px]">
              {`Fechas pasadas (${pasadas.length})`}
            </summary>
            <ul aria-label="Fechas pasadas">{pasadas.map((fecha) => fila(fecha, true))}</ul>
          </details>
        )}
      </div>
    </section>
  )
}
