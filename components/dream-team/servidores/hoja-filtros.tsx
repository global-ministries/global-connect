'use client'

/**
 * Servidores on phones: the "Filtros · N" button and the bottom sheet behind
 * it. The sheet holds what does not fit the phone bar — Equipo, Rol and the
 * quick filters — with "Limpiar" (empties exactly those filters) and "Ver N"
 * (closes the sheet; N is what the list now shows). Every change applies live.
 */
import { useState, type ReactElement } from 'react'
import { Filter } from 'lucide-react'

import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { parcheElegirEquipo, type FiltrosServidores, type VistaServidores } from '@/lib/platform/dream-team/servidores-vista'
import { ANILLO } from './contadores-etapa'

export interface HojaFiltrosProps {
  readonly vista: VistaServidores
  readonly onCambio: (parche: Partial<FiltrosServidores>) => void
  readonly className?: string
}

const TODOS = ''
const LIMPIAR_HOJA: Partial<FiltrosServidores> = { equipo: null, rol: null, sinCuenta: false, varios: false }

export function HojaFiltros({ vista, onCambio, className }: HojaFiltrosProps): ReactElement {
  const [abierta, setAbierta] = useState(false)
  const { filtros, opciones, rapidos, filtrosEnHoja } = vista
  const rapidosLista = [
    { clave: 'sinCuenta' as const, etiqueta: 'Sin cuenta', ...rapidos.sinCuenta },
    { clave: 'varios' as const, etiqueta: 'En varios equipos', ...rapidos.varios },
  ]

  return (
    <Sheet open={abierta} onOpenChange={setAbierta}>
      <SheetTrigger asChild>
        <BotonSistema type="button" variante="outline" className={cn('shrink-0', className)}>
          <Filter className="h-4 w-4" aria-hidden="true" />
          <span className="ml-2">{filtrosEnHoja > 0 ? `Filtros · ${filtrosEnHoja}` : 'Filtros'}</span>
        </BotonSistema>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] gap-0 overflow-y-auto rounded-t-2xl p-0">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle className="text-lg font-semibold text-foreground">Filtros</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 p-4">
          <SelectSistema
            label="Equipo"
            opciones={[{ valor: TODOS, etiqueta: 'Todos' }, ...opciones.equipos.map((e) => ({ valor: e.id, etiqueta: e.label }))]}
            value={filtros.equipo ?? TODOS}
            onValueChange={(valor) => onCambio(parcheElegirEquipo(valor === TODOS ? null : valor, opciones.equipos))}
          />
          <SelectSistema
            label="Rol"
            opciones={[{ valor: TODOS, etiqueta: 'Todos' }, ...opciones.roles.map((r) => ({ valor: r.id, etiqueta: r.label }))]}
            value={filtros.rol ?? TODOS}
            onValueChange={(valor) => onCambio({ rol: valor === TODOS ? null : valor })}
          />
          <div className="flex flex-wrap gap-2">
            {rapidosLista.map((rapido) => (
              <button
                key={rapido.clave}
                type="button"
                aria-pressed={rapido.activo}
                onClick={() => onCambio({ [rapido.clave]: !rapido.activo })}
                className={cn(
                  'min-h-[44px] rounded-full border px-4 text-sm font-medium transition-colors',
                  rapido.activo
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-accent-strong)] text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  ANILLO,
                )}
              >
                {rapido.etiqueta} · {rapido.cantidad}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BotonSistema type="button" variante="outline" onClick={() => onCambio(LIMPIAR_HOJA)}>
              Limpiar
            </BotonSistema>
            <BotonSistema type="button" onClick={() => setAbierta(false)}>
              Ver {vista.visibles.length}
            </BotonSistema>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
