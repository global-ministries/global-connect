'use client'

/**
 * Mi equipo — page header: the direccion's name, who leads it and how big it
 * is, a direccion selector when the caller reaches several, the person search
 * and, with write access, the "Agregar persona" action (`accion`, hidden on phones,
 * where mi-equipo-client.tsx shows a floating button instead).
 */
import type { ReactElement, ReactNode } from 'react'
import { Search } from 'lucide-react'

import { InputSistema, SelectSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import type { DireccionResumen } from '@/lib/platform/dream-team/mi-equipo-vista'

export interface EncabezadoMiEquipoProps {
  readonly direccionLabel: string
  readonly dirige: string | null
  readonly totalPersonas: number
  readonly totalEquipos: number
  readonly direcciones: readonly DireccionResumen[]
  readonly direccionId: string
  readonly onDireccionChange: (direccionId: string) => void
  readonly query: string
  readonly onQueryChange: (query: string) => void
  /** The primary action, rendered after the search; the caller decides whether there is one. */
  readonly accion?: ReactNode
}

function plural(cantidad: number, singular: string, pluralForma: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralForma}`
}

export function resumenDeDireccion(dirige: string | null, personas: number, equipos: number): string {
  const conteo =
    equipos > 0
      ? `${plural(personas, 'persona', 'personas')} en ${plural(equipos, 'equipo', 'equipos')}`
      : plural(personas, 'persona', 'personas')
  return dirige ? `Dirige ${dirige} · ${conteo}` : conteo
}

export function EncabezadoMiEquipo({
  direccionLabel,
  dirige,
  totalPersonas,
  totalEquipos,
  direcciones,
  direccionId,
  onDireccionChange,
  query,
  onQueryChange,
  accion,
}: EncabezadoMiEquipoProps): ReactElement {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1">
        <TituloSistema nivel={2} className="text-2xl md:text-3xl">
          {direccionLabel}
        </TituloSistema>
        <TextoSistema variante="sutil">{resumenDeDireccion(dirige, totalPersonas, totalEquipos)}</TextoSistema>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {direcciones.length > 1 && (
          <div className="sm:w-64">
            <SelectSistema
              label="Dirección"
              opciones={direcciones.map((d) => ({ valor: d.id, etiqueta: d.label }))}
              value={direccionId}
              onValueChange={onDireccionChange}
            />
          </div>
        )}
        <div className="sm:w-72">
          <InputSistema
            type="search"
            icono={Search}
            aria-label="Buscar persona"
            placeholder="Buscar por nombre"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
        {accion}
      </div>
    </header>
  )
}
