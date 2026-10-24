'use client'

/**
 * "1 a 1 recientes" of the supervision view (odd/tasks/uno-a-uno.md, T7 S7.2
 * and T8 S8.5): the chain's 1:1s of the last 90 days, in the database order
 * (latest first), with a name search over leaders and dirigidos and an
 * estado filter; a table from `md` up and a list below it. Read-only, and
 * there is no private note to show: UnoAUnoSupervisado has none.
 */

import { useMemo, useState, type ReactElement } from 'react'
import { CalendarDays, MapPin, Search } from 'lucide-react'

import { BadgeSistema, InputSistema, SelectSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { formatearFechaHora } from '@/lib/uno-a-uno/fecha'
import { FILTROS_RECIENTES_VACIOS, filtrarRecientes, type FiltrosRecientes } from '@/lib/uno-a-uno/supervision'
import {
  DIAS_SUPERVISION_RECIENTES,
  nombresDe,
  type EstadoUnoAUno,
  type UnoAUnoSupervisado,
} from '@/lib/uno-a-uno/vista'

import { CelebracionUnoAUno, Detalle } from './detalles-uno-a-uno'

const ESTADOS: Record<EstadoUnoAUno, { etiqueta: string; variante: 'info' | 'success' | 'default' }> = {
  agendado: { etiqueta: 'Agendado', variante: 'info' },
  realizado: { etiqueta: 'Realizado', variante: 'success' },
  cancelado: { etiqueta: 'Cancelado', variante: 'default' },
}

const TODOS = ''
const COLUMNAS = ['1 a 1', 'Fecha', 'Estado', 'Lugar', 'Detalle'] as const

function titulo(u: UnoAUnoSupervisado): string {
  return `${nombresDe(u.lideres)} → ${nombresDe(u.dirigidos)}`
}

function EstadoBadge({ estado }: { estado: EstadoUnoAUno }): ReactElement {
  const { etiqueta, variante } = ESTADOS[estado]
  return (
    <BadgeSistema variante={variante} tamaño="sm">
      {etiqueta}
    </BadgeSistema>
  )
}

/** Resumen (only once realizado), celebración and the motivo of a cancelled 1:1. */
function DetalleEscrito({ u }: { u: UnoAUnoSupervisado }): ReactElement | null {
  const motivo = u.estado === 'cancelado' ? u.motivoCancelacion : null
  if (!u.resumen && !u.celebracion && !motivo) return null
  return (
    <div className="space-y-2">
      {u.resumen ? (
        <TextoSistema tamaño="sm" className="whitespace-pre-line">
          {u.resumen}
        </TextoSistema>
      ) : null}
      {u.celebracion ? <CelebracionUnoAUno texto={u.celebracion} /> : null}
      {motivo ? <TextoSistema variante="sutil" tamaño="sm">{`Motivo: ${motivo}`}</TextoSistema> : null}
    </div>
  )
}

function TablaRecientes({ recientes }: { recientes: readonly UnoAUnoSupervisado[] }): ReactElement {
  return (
    <TarjetaSistema className="hidden overflow-x-auto p-0 md:block">
      <table aria-label="1 a 1 recientes" className="w-full">
        <thead>
          <tr className="border-b border-border text-left">
            {COLUMNAS.map((columna) => (
              <th
                key={columna}
                scope="col"
                className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {recientes.map((u) => (
            <tr key={u.id} className="align-top hover:bg-accent/50">
              <td className="px-4 py-2 text-sm font-medium text-foreground">{titulo(u)}</td>
              <td className="px-4 py-2 text-sm text-muted-foreground">{formatearFechaHora(u.fechaHora)}</td>
              <td className="px-4 py-2">
                <EstadoBadge estado={u.estado} />
              </td>
              <td className="px-4 py-2 text-sm text-muted-foreground">{u.lugar ?? '—'}</td>
              <td className="max-w-md px-4 py-2">
                <DetalleEscrito u={u} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TarjetaSistema>
  )
}

function ListaRecientes({ recientes }: { recientes: readonly UnoAUnoSupervisado[] }): ReactElement {
  return (
    <TarjetaSistema className="p-0 md:hidden">
      <ul aria-label="1 a 1 recientes en lista" className="divide-y divide-border">
        {recientes.map((u) => (
          <li key={u.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="text-[15px] font-medium text-foreground">{titulo(u)}</span>
              <EstadoBadge estado={u.estado} />
            </div>
            <div className="space-y-1">
              <Detalle icono={CalendarDays}>{formatearFechaHora(u.fechaHora)}</Detalle>
              {u.lugar ? <Detalle icono={MapPin}>{u.lugar}</Detalle> : null}
            </div>
            <DetalleEscrito u={u} />
          </li>
        ))}
      </ul>
    </TarjetaSistema>
  )
}

export function RecientesSupervision({ recientes }: { recientes: readonly UnoAUnoSupervisado[] }): ReactElement {
  const [filtros, setFiltros] = useState<FiltrosRecientes>(FILTROS_RECIENTES_VACIOS)
  const visibles = useMemo(() => filtrarRecientes(recientes, filtros), [recientes, filtros])

  if (recientes.length === 0) {
    return <TextoSistema variante="sutil">{`No hay 1 a 1 en los últimos ${DIAS_SUPERVISION_RECIENTES} días.`}</TextoSistema>
  }

  return (
    <div className="space-y-4">
      <TextoSistema variante="sutil" tamaño="sm">
        {`Los de tu cadena en los últimos ${DIAS_SUPERVISION_RECIENTES} días.`}
      </TextoSistema>
      <section aria-label="Filtros de 1 a 1 recientes" className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <InputSistema
          type="search"
          icono={Search}
          label="Buscar"
          placeholder="Nombre del líder o del dirigido"
          value={filtros.q}
          onChange={(evento) => setFiltros((actuales) => ({ ...actuales, q: evento.target.value }))}
        />
        <SelectSistema
          label="Estado"
          opciones={[
            { valor: TODOS, etiqueta: 'Todos' },
            ...Object.entries(ESTADOS).map(([valor, { etiqueta }]) => ({ valor, etiqueta })),
          ]}
          value={filtros.estado ?? TODOS}
          onValueChange={(valor) =>
            setFiltros((actuales) => ({ ...actuales, estado: valor === TODOS ? null : (valor as EstadoUnoAUno) }))
          }
        />
      </section>

      <TextoSistema variante="sutil" tamaño="sm" aria-live="polite">
        {`Mostrando ${visibles.length} de ${recientes.length}`}
      </TextoSistema>

      {visibles.length === 0 ? (
        <TextoSistema variante="sutil">Ningún 1 a 1 coincide con estos filtros.</TextoSistema>
      ) : (
        <>
          <TablaRecientes recientes={visibles} />
          <ListaRecientes recientes={visibles} />
        </>
      )}
    </div>
  )
}
