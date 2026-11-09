/**
 * Niños › Eventos — the list of events of the campus (artboard `.ps`):
 * Activos, then Archivados, then "Cómo funciona". Each event is a button
 * (`aria-current` on the open one) with its state, kind, horarios and next
 * date.
 */
import type { ReactElement } from 'react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import {
  NOMBRE_TIPO,
  estadoEvento,
  fechaCorta,
  proximaFecha,
  textoFrecuencia,
  type EventoAdmin,
} from '@/lib/platform/ninos/eventos'
import { cn } from '@/lib/utils'

import { Num } from './partes'

const horarios = (n: number) => `${n} ${n === 1 ? 'horario' : 'horarios'}`

function FilaEvento({
  evento,
  hoy,
  actual,
  onElegir,
}: {
  readonly evento: EventoAdmin
  readonly hoy: string
  readonly actual: boolean
  readonly onElegir: (id: string) => void
}): ReactElement {
  const estado = estadoEvento(evento, hoy)
  const proxima = proximaFecha(evento, hoy)
  return (
    <li>
      <button
        type="button"
        aria-current={actual ? 'true' : undefined}
        onClick={() => onElegir(evento.id)}
        className={cn(
          'focus-ring mt-0.5 grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 rounded-md border px-2.5 py-2 text-left transition-colors touch-manipulation pointer-coarse:min-h-11',
          actual ? 'border-brand/45 bg-brand-tint' : 'border-transparent hover:bg-accent',
        )}
      >
        <span className="truncate text-sm font-[650] text-foreground">{evento.nombre}</span>
        <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} className="text-xs" />
        <span className="col-span-2 text-xs text-muted-foreground">
          {NOMBRE_TIPO[evento.tipo]} · {horarios(evento.horarios.length)}
        </span>
        <span className="col-span-2 truncate text-xs text-muted-foreground">
          {proxima ? `Próxima: ${fechaCorta(proxima)}` : textoFrecuencia(evento)}
        </span>
      </button>
    </li>
  )
}

export function ListaEventos({
  eventos,
  hoy,
  actualId,
  onElegir,
}: {
  readonly eventos: readonly EventoAdmin[]
  readonly hoy: string
  readonly actualId: string | null
  readonly onElegir: (id: string) => void
}): ReactElement {
  const activos = eventos.filter((e) => e.activo)
  const archivados = eventos.filter((e) => !e.activo)
  const grupo = (id: string, titulo: string, lista: readonly EventoAdmin[]) => (
    <section aria-labelledby={id} className="px-3 pb-3 pt-2.5">
      <h2 id={id} className="flex min-h-[26px] items-center justify-between px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {titulo} <Num>{lista.length}</Num>
      </h2>
      {lista.length > 0 ? (
        <ul>
          {lista.map((e) => (
            <FilaEvento key={e.id} evento={e} hoy={hoy} actual={e.id === actualId} onElegir={onElegir} />
          ))}
        </ul>
      ) : (
        <p className="px-1 pt-1 text-xs text-muted-foreground">{id === 'eventos-activos' ? 'Ningún evento activo.' : 'Ningún evento archivado.'}</p>
      )}
    </section>
  )

  return (
    <aside aria-label="Lista de eventos" className="min-w-0 divide-y divide-border rounded-md border border-border bg-card">
      {grupo('eventos-activos', 'Activos', activos)}
      {archivados.length > 0 && grupo('eventos-archivados', 'Archivados', archivados)}
      <section aria-labelledby="eventos-como" className="px-3 pb-3 pt-2.5">
        <h2 id="eventos-como" className="flex min-h-[26px] items-center px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Cómo funciona
        </h2>
        <p className="px-1 pt-1 text-xs leading-relaxed text-muted-foreground">
          Un <strong className="text-foreground">evento</strong> tiene horarios. Cada horario es un turno de Dream Team: su hora se cambia
          allá; aquí eliges cuántos minutos antes abre el check-in y cuántos después cierra el retiro.
        </p>
      </section>
    </aside>
  )
}
