'use client'

/**
 * Servidores — the table: one `TarjetaSistema p-0` with sortable header
 * buttons (`aria-sort` on the active column header), group header rows and one
 * row per servicio: avatar, name with its marks, equipo with its path, role
 * and etapa badges, the campus shifts ("—" when none), start date and the
 * "⋯" menu.
 */
import type { ReactElement } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { BadgeSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import {
  ESTADO_BADGE_VARIANTE,
  ESTADO_LABELS,
  ORIGEN_GRUPOS_VIDA_LABEL,
  SIN_CUENTA_LABEL,
  rolBadgeVariante,
} from '@/components/dream-team/labels'
import { cn } from '@/lib/utils'
import { inicialesDe } from '@/lib/platform/dream-team/mi-equipo-vista'
import {
  COLUMNAS_ORDEN,
  ETIQUETA_COLUMNA,
  type ColumnaOrden,
  type FilaVista,
  type FiltrosServidores,
  type ItemLista,
} from '@/lib/platform/dream-team/servidores-vista'
import { ANILLO } from './contadores-etapa'
import { MenuServidor } from './menu-servidor'
import { TelefonoServidor } from './telefono-servidor'

export interface TablaServidoresProps {
  readonly items: readonly ItemLista[]
  readonly orden: FiltrosServidores['orden']
  readonly onOrdenar: (columna: ColumnaOrden) => void
  readonly onActualizado: () => void
}

export function formatearFecha(valor: string | null): string {
  // A Grupos de Vida director de etapa has no start date: a dash, never 1970.
  if (valor === null) return '—'
  try {
    return new Date(valor).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return valor
  }
}

export function MarcasDeFila({ fila }: { readonly fila: FilaVista }): ReactElement | null {
  const marcas: ReactElement[] = []
  if (fila.origen === 'grupos_vida') {
    marcas.push(
      <BadgeSistema key="gdv" variante="default" tamaño="sm">
        {ORIGEN_GRUPOS_VIDA_LABEL}
      </BadgeSistema>,
    )
  }
  if (fila.tieneCuenta === false) {
    marcas.push(
      <BadgeSistema key="sin-cuenta" variante="warning" tamaño="sm">
        {SIN_CUENTA_LABEL}
      </BadgeSistema>,
    )
  }
  if (fila.equiposDeLaPersona >= 2) {
    marcas.push(
      <BadgeSistema key="varios" variante="info" tamaño="sm">
        {fila.equiposDeLaPersona} equipos
      </BadgeSistema>,
    )
  }
  return marcas.length > 0 ? <>{marcas}</> : null
}

export function TablaServidores({ items, orden, onOrdenar, onActualizado }: TablaServidoresProps): ReactElement {
  return (
    <TarjetaSistema className="hidden overflow-hidden p-0 md:block">
      <table aria-label="Servicios" className="w-full">
        <thead>
          <tr className="border-b border-border text-left">
            {COLUMNAS_ORDEN.map((columna) => {
              const activa = orden.columna === columna
              return (
                <th
                  key={columna}
                  scope="col"
                  aria-sort={activa ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : undefined}
                  className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  <button
                    type="button"
                    onClick={() => onOrdenar(columna)}
                    aria-label={`Ordenar por ${ETIQUETA_COLUMNA[columna].toLowerCase()}`}
                    className={cn(
                      '-mx-2 flex min-h-[44px] items-center gap-1 rounded-lg px-2 uppercase tracking-wider transition-colors hover:bg-accent',
                      activa ? 'text-foreground' : 'text-muted-foreground',
                      ANILLO,
                    )}
                  >
                    {ETIQUETA_COLUMNA[columna]}
                    {activa &&
                      (orden.sentido === 'asc' ? (
                        <ChevronUp className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3 w-3" aria-hidden="true" />
                      ))}
                  </button>
                </th>
              )
            })}
            <th
              scope="col"
              className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Turno
            </th>
            <th scope="col" className="w-14 px-2 py-2">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) =>
            item.tipo === 'grupo' ? (
              <tr key={`grupo-${item.clave}`} className="bg-muted/40">
                <th scope="row" colSpan={COLUMNAS_ORDEN.length + 2} className="px-4 py-2 text-left">
                  <span className="text-sm font-semibold text-foreground">{item.titulo}</span>
                  <span className="ml-3 text-sm font-normal text-muted-foreground">{item.detalle}</span>
                </th>
              </tr>
            ) : (
              <FilaTabla key={item.fila.clave} fila={item.fila} onActualizado={onActualizado} />
            ),
          )}
        </tbody>
      </table>
    </TarjetaSistema>
  )
}

function FilaTabla({ fila, onActualizado }: { readonly fila: FilaVista; readonly onActualizado: () => void }): ReactElement {
  return (
    <tr className="hover:bg-accent/50">
      <td className="px-4 py-2">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent-strong)] text-sm font-bold text-[var(--brand-primary)]"
          >
            {inicialesDe(fila.nombre)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-medium text-foreground">{fila.nombre}</span>
              <MarcasDeFila fila={fila} />
            </div>
            <TelefonoServidor telefono={fila.telefono} />
          </div>
        </div>
      </td>
      <td className="px-4 py-2">
        <div className="text-sm text-foreground">{fila.equipoLabel}</div>
        <div className="text-xs text-muted-foreground">{fila.equipoRuta || 'Raíz del organigrama'}</div>
      </td>
      <td className="px-4 py-2">
        <BadgeSistema variante={rolBadgeVariante(fila.rolLabel)} tamaño="sm">
          {fila.rolLabel}
        </BadgeSistema>
      </td>
      <td className="px-4 py-2">
        <BadgeSistema variante={ESTADO_BADGE_VARIANTE[fila.estado]} tamaño="sm">
          {ESTADO_LABELS[fila.estado]}
        </BadgeSistema>
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-sm text-muted-foreground">{formatearFecha(fila.fechaInicio)}</td>
      <td className="px-4 py-2 text-sm text-muted-foreground">{fila.turnosTexto}</td>
      <td className="px-2 py-2">
        <MenuServidor fila={fila} onActualizado={onActualizado} />
      </td>
    </tr>
  )
}
