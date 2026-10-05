'use client'

/**
 * Servidores — the visible filter bar: search (name or phone), Dirección,
 * Equipo (narrowed by the dirección), Rol, Turno (when the campus has shifts)
 * and Inicio; below it the quick
 * filters with their counters and the "Agrupar" segmented control. Below `md`
 * only the search stays, next to the "Filtros · N" button of the bottom sheet
 * (hoja-filtros.tsx).
 */
import type { ReactElement } from 'react'
import { Search } from 'lucide-react'

import { InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import {
  parcheElegirDireccion,
  parcheElegirEquipo,
  type Agrupar,
  type FiltrosServidores,
  type Inicio,
  type VistaServidores,
} from '@/lib/platform/dream-team/servidores-vista'
import { SelectorTurno } from '@/components/dream-team/turnos/selector-turno'
import { ANILLO } from './contadores-etapa'
import { HojaFiltros } from './hoja-filtros'

export interface BarraFiltrosProps {
  readonly vista: VistaServidores
  readonly onCambio: (parche: Partial<FiltrosServidores>) => void
}

const TODOS = ''

const OPCIONES_INICIO: ReadonlyArray<{ readonly valor: Inicio; readonly etiqueta: string }> = [
  { valor: 'cualquiera', etiqueta: 'Cualquier fecha' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'trimestre', etiqueta: 'Últimos 3 meses' },
]

const OPCIONES_AGRUPAR: ReadonlyArray<{ readonly valor: Agrupar; readonly etiqueta: string }> = [
  { valor: 'ninguno', etiqueta: 'Sin agrupar' },
  { valor: 'equipo', etiqueta: 'Por equipo' },
  { valor: 'persona', etiqueta: 'Por persona' },
]

export function BarraFiltros({ vista, onCambio }: BarraFiltrosProps): ReactElement {
  const { filtros, opciones, rapidos } = vista
  const rapidosLista = [
    { clave: 'sinCuenta' as const, etiqueta: 'Sin cuenta', ...rapidos.sinCuenta },
    { clave: 'varios' as const, etiqueta: 'En varios equipos', ...rapidos.varios },
  ]

  return (
    <section aria-label="Filtros" className="space-y-3">
      <div
        className={cn(
          'grid gap-3',
          opciones.turnos.length > 0
            ? 'md:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]'
            : 'md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]',
        )}
      >
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <InputSistema
              type="search"
              icono={Search}
              label="Buscar"
              placeholder="Nombre o teléfono"
              value={filtros.q}
              onChange={(evento) => onCambio({ q: evento.target.value })}
            />
          </div>
          <HojaFiltros vista={vista} onCambio={onCambio} className="md:hidden" />
        </div>
        <div className="hidden md:contents">
          <SelectSistema
            label="Dirección"
            opciones={[{ valor: TODOS, etiqueta: 'Todas' }, ...opciones.direcciones.map((d) => ({ valor: d.id, etiqueta: d.label }))]}
            value={filtros.direccion ?? TODOS}
            onValueChange={(valor) => onCambio(parcheElegirDireccion(valor === TODOS ? null : valor))}
          />
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
          <SelectorTurno turnos={opciones.turnos} valor={filtros.turno} onCambio={(turno) => onCambio({ turno })} />
          <SelectSistema
            label="Inicio"
            opciones={OPCIONES_INICIO.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))}
            value={filtros.inicio}
            onValueChange={(valor) => onCambio({ inicio: valor as Inicio })}
          />
        </div>
      </div>

      <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
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

        <div role="group" aria-label="Agrupar" className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Agrupar</span>
          <div className="flex rounded-xl border border-border p-0.5">
            {OPCIONES_AGRUPAR.map((opcion) => {
              const activa = filtros.agrupar === opcion.valor
              return (
                <button
                  key={opcion.valor}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => onCambio({ agrupar: opcion.valor })}
                  className={cn(
                    'min-h-[44px] rounded-[10px] px-3 text-sm font-medium transition-colors',
                    activa ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    ANILLO,
                  )}
                >
                  {opcion.etiqueta}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
