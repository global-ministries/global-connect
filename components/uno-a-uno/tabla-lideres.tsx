'use client'

/**
 * The leaders of the supervision view (odd/tasks/uno-a-uno.md, T8), after
 * Dream Team → Servidores (tabla-servidores.tsx, tarjetas-servidores.tsx):
 *
 *   - from `md` up, a table with sortable header buttons (`aria-sort` on the
 *     active column) — Líder, Qué lidera, Dirigidos, Realizados, Agendados,
 *     Último 1 a 1 (S8.3);
 *   - below `md`, one compact row per leader with the same data (S8.4).
 *
 * Both keep the "Sin 1 a 1 en 30 días" mark and say "Nunca" without a last 1:1.
 */

import type { ReactElement } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { BadgeSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { formatearFecha } from '@/lib/uno-a-uno/fecha'
import { nombreDeLider, type ColumnaLider, type OrdenLideres } from '@/lib/uno-a-uno/supervision'
import { DIAS_SUPERVISION_LIDERES, type LiderSupervisado } from '@/lib/uno-a-uno/vista'

export const ANILLO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const COLUMNAS: readonly { columna: ColumnaLider; etiqueta: string }[] = [
  { columna: 'lider', etiqueta: 'Líder' },
  { columna: 'rol', etiqueta: 'Rol' },
  { columna: 'contextos', etiqueta: 'Qué lidera' },
  { columna: 'dirigidos', etiqueta: 'Dirigidos' },
  { columna: 'realizados', etiqueta: `Realizados (${DIAS_SUPERVISION_LIDERES} días)` },
  { columna: 'agendados', etiqueta: 'Agendados' },
  { columna: 'ultimo', etiqueta: 'Último 1 a 1' },
]

function ultimoDe(lider: LiderSupervisado): string {
  return formatearFecha(lider.ultimoRealizado) || 'Nunca'
}

function MarcaSinUnoAUno({ lider }: { lider: LiderSupervisado }): ReactElement | null {
  if (lider.realizados > 0) return null
  return (
    <BadgeSistema variante="warning" tamaño="sm" className="whitespace-nowrap">
      {`Sin 1 a 1 en ${DIAS_SUPERVISION_LIDERES} días`}
    </BadgeSistema>
  )
}

interface TablaLideresProps {
  readonly lideres: readonly LiderSupervisado[]
  readonly orden: OrdenLideres
  readonly onOrdenar: (columna: ColumnaLider) => void
}

function Encabezado({
  columna,
  etiqueta,
  orden,
  onOrdenar,
}: (typeof COLUMNAS)[number] & Omit<TablaLideresProps, 'lideres'>): ReactElement {
  const sentido = orden?.columna === columna ? orden.sentido : null
  return (
    <th
      scope="col"
      aria-sort={sentido ? (sentido === 'asc' ? 'ascending' : 'descending') : undefined}
      className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        aria-label={`Ordenar por ${etiqueta.toLowerCase()}`}
        className={cn(
          '-mx-2 flex min-h-[44px] items-center gap-1 rounded-xl px-2 text-left uppercase tracking-wider transition-colors hover:bg-accent',
          sentido ? 'text-foreground' : 'text-muted-foreground',
          ANILLO,
        )}
      >
        {etiqueta}
        {sentido === 'asc' ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : null}
        {sentido === 'desc' ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : null}
      </button>
    </th>
  )
}

export function TablaLideres({ lideres, orden, onOrdenar }: TablaLideresProps): ReactElement {
  return (
    <TarjetaSistema className="hidden overflow-x-auto p-0 md:block">
      <table aria-label="Líderes" className="w-full">
        <thead>
          <tr className="border-b border-border text-left">
            {COLUMNAS.map((c) => (
              <Encabezado key={c.columna} {...c} orden={orden} onOrdenar={onOrdenar} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lideres.map((lider) => (
            <tr key={lider.usuarioId} className="hover:bg-accent/50">
              <td className="px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-medium text-foreground">{nombreDeLider(lider)}</span>
                  <MarcaSinUnoAUno lider={lider} />
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-sm text-foreground">{lider.rol}</td>
              <td className="px-4 py-2 text-sm text-muted-foreground">{lider.contextos.join(', ') || '—'}</td>
              <td className="px-4 py-2 text-sm tabular-nums text-foreground">{lider.dirigidos}</td>
              <td className="px-4 py-2 text-sm tabular-nums text-foreground">{lider.realizados}</td>
              <td className="px-4 py-2 text-sm tabular-nums text-foreground">{lider.agendados}</td>
              <td className="whitespace-nowrap px-4 py-2 text-sm text-muted-foreground">{ultimoDe(lider)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TarjetaSistema>
  )
}

export function ListaLideres({ lideres }: { lideres: readonly LiderSupervisado[] }): ReactElement {
  return (
    <TarjetaSistema className="p-0 md:hidden">
      <ul aria-label="Líderes en lista" className="divide-y divide-border">
        {lideres.map((lider) => {
          const nombre = nombreDeLider(lider)
          return (
            <li key={lider.usuarioId} aria-label={nombre} className="space-y-0.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium text-foreground">{nombre}</span>
                <MarcaSinUnoAUno lider={lider} />
              </div>
              <p className="text-sm text-foreground">{lider.rol}</p>
              {lider.contextos.length > 0 ? (
                <p className="text-sm text-muted-foreground">{lider.contextos.join(', ')}</p>
              ) : null}
              <p className="text-xs tabular-nums text-muted-foreground">
                {`Dirigidos ${lider.dirigidos} · Realizados ${lider.realizados} · Agendados ${lider.agendados} · Último: ${ultimoDe(lider)}`}
              </p>
            </li>
          )
        })}
      </ul>
    </TarjetaSistema>
  )
}
