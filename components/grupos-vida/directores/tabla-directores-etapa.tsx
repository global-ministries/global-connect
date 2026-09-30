'use client'

/**
 * Directores — the stage directors: a table on desktop and one card per
 * director on phones (both are in the DOM; the breakpoint classes pick one).
 * Read-only: "Ver grupos" is a link to the segment's directors screen, where
 * groups are assigned and directors added.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'

import { BadgeSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import type { FilaEtapa } from '@/lib/platform/grupos-vida/directores-vista'
import { ANILLO } from './franja-por-ordenar'

export interface TablaDirectoresEtapaProps {
  readonly filas: readonly FilaEtapa[]
}

const MAX_AVATARES = 3

function CuentaBadge({ tieneCuenta }: { readonly tieneCuenta: boolean }): ReactElement {
  return (
    <BadgeSistema variante={tieneCuenta ? 'success' : 'warning'} tamaño="sm">
      {tieneCuenta ? 'Con cuenta' : 'Sin cuenta'}
    </BadgeSistema>
  )
}

function Avatar({ iniciales, tamano }: { readonly iniciales: string; readonly tamano: 'md' | 'sm' }): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent-strong)] font-bold text-[var(--brand-primary)]',
        tamano === 'md' ? 'h-10 w-10 text-sm' : 'h-6 w-6 text-[10px]',
      )}
    >
      {iniciales}
    </div>
  )
}

function RespondeA({ fila }: { readonly fila: FilaEtapa }): ReactElement {
  if (fila.respondeA.length === 0) return <span className="text-xs text-muted-foreground">Sin director general</span>
  const etiqueta = `Responde a: ${fila.respondeA.map((r) => r.nombre).join(', ')}`
  const primero = fila.respondeA[0].nombre.split(' ')[0]
  const resto = fila.respondeA.length - 1
  return (
    <div className="flex flex-col gap-1">
      <span role="img" aria-label={etiqueta} title={etiqueta} className="flex items-center">
        {fila.respondeA.slice(0, MAX_AVATARES).map((r, i) => (
          <span
            key={r.usuarioId}
            aria-hidden="true"
            className={cn(
              'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-bold text-foreground',
              i > 0 && '-ml-2',
            )}
          >
            {r.iniciales}
          </span>
        ))}
      </span>
      <span className="text-xs text-muted-foreground">{resto > 0 ? `${primero} +${resto}` : primero}</span>
    </div>
  )
}

function VerGrupos({ fila }: { readonly fila: FilaEtapa }): ReactElement {
  return (
    <Link
      href={fila.hrefGrupos}
      aria-label={`Ver grupos de ${fila.nombre}`}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-border px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent',
        ANILLO,
      )}
    >
      Ver grupos
    </Link>
  )
}

function GruposActivos({ fila }: { readonly fila: FilaEtapa }): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-semibold text-foreground">{fila.gruposActivos}</span>
      {fila.sinGrupos && (
        <BadgeSistema variante="warning" tamaño="sm">
          Sin grupos asignados
        </BadgeSistema>
      )}
    </div>
  )
}

export function TablaDirectoresEtapa({ filas }: TablaDirectoresEtapaProps): ReactElement {
  return (
    <>
      <TarjetaSistema variante="outlined" className="hidden overflow-hidden p-0 md:block">
        <table aria-label="Directores de etapa" className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              {['Director', 'Segmento', 'Ciudad', 'Grupos activos', 'Responde a', 'Cuenta'].map((titulo) => (
                <th key={titulo} scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {titulo}
                </th>
              ))}
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((fila) => (
              <tr key={fila.segmentoLiderId} className="hover:bg-accent/50">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar iniciales={fila.iniciales} tamano="md" />
                    <span className="text-[15px] font-medium text-foreground">{fila.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-sm text-foreground">{fila.segmentoNombre}</td>
                <td className="px-4 py-2 text-sm text-muted-foreground">{fila.ciudad ?? 'Sin ciudad'}</td>
                <td className="px-4 py-2">
                  <GruposActivos fila={fila} />
                </td>
                <td className="px-4 py-2">
                  <RespondeA fila={fila} />
                </td>
                <td className="px-4 py-2">
                  <CuentaBadge tieneCuenta={fila.tieneCuenta} />
                </td>
                <td className="px-4 py-2">
                  <VerGrupos fila={fila} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TarjetaSistema>

      <ul aria-label="Directores de etapa en tarjetas" className="space-y-2 md:hidden">
        {filas.map((fila) => (
          <li key={fila.segmentoLiderId}>
            <TarjetaSistema variante="outlined" className="flex items-start gap-3 p-4">
              <Avatar iniciales={fila.iniciales} tamano="md" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-[15px] font-semibold text-foreground">{fila.nombre}</p>
                <p className="text-[13px] text-muted-foreground">{`${fila.segmentoNombre} · ${fila.ciudad ?? 'Sin ciudad'}`}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-foreground">
                    {fila.gruposActivos} {fila.gruposActivos === 1 ? 'grupo activo' : 'grupos activos'}
                  </span>
                  {fila.sinGrupos && (
                    <BadgeSistema variante="warning" tamaño="sm">
                      Sin grupos asignados
                    </BadgeSistema>
                  )}
                  <CuentaBadge tieneCuenta={fila.tieneCuenta} />
                </div>
                <div>
                  <VerGrupos fila={fila} />
                </div>
              </div>
            </TarjetaSistema>
          </li>
        ))}
      </ul>
    </>
  )
}
