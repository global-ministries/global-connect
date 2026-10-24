'use client'

/**
 * "Líderes" of the supervision view (odd/tasks/uno-a-uno.md, T8): the three
 * counters that filter by estado (S8.1), the filters (S8.2; T9 S9.1 for
 * Dirección → Área → Equipo o grupo), "Mostrando X de
 * N" with "Limpiar filtros", and the table or the phone list (S8.3, S8.4).
 * Filters and sorting live in local state over the leaders the page loaded
 * (S8.6); the rules are in lib/uno-a-uno/supervision.ts.
 */

import { useMemo, useState, type ReactElement } from 'react'

import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import {
  FILTROS_LIDERES_VACIOS,
  contadoresLideres,
  filtrarLideres,
  hayFiltrosLideres,
  opcionesUbicacion,
  ordenarLideres,
  siguienteOrden,
  type ColumnaLider,
  type EstadoLider,
  type FiltrosLideres,
  type OrdenLideres,
} from '@/lib/uno-a-uno/supervision'
import { DIAS_SUPERVISION_LIDERES, type LiderSupervisado } from '@/lib/uno-a-uno/vista'

import { FiltrosLideresSupervision } from './filtros-lideres'
import { ANILLO, ListaLideres, TablaLideres } from './tabla-lideres'

interface ContadoresProps {
  readonly lideres: readonly LiderSupervisado[]
  readonly estado: EstadoLider | null
  readonly onEstado: (estado: EstadoLider | null) => void
}

function ContadoresLideres({ lideres, estado, onEstado }: ContadoresProps): ReactElement {
  const contadores = contadoresLideres(lideres)
  const opciones: readonly { valor: EstadoLider | null; etiqueta: string; cantidad: number }[] = [
    { valor: null, etiqueta: 'Líderes', cantidad: contadores.total },
    { valor: 'sin_uno_a_uno', etiqueta: `Sin 1 a 1 en ${DIAS_SUPERVISION_LIDERES} días`, cantidad: contadores.sinUnoAUno },
    { valor: 'al_dia', etiqueta: 'Al día', cantidad: contadores.alDia },
  ]

  return (
    <div role="group" aria-label="Resumen de líderes" className="grid grid-cols-3 gap-2">
      {opciones.map(({ valor, etiqueta, cantidad }) => {
        const activo = estado === valor
        return (
          <button
            key={valor ?? 'todos'}
            type="button"
            aria-pressed={activo}
            // A second tap on an active estado removes the filter.
            onClick={() => onEstado(activo ? null : valor)}
            className={cn(
              'flex min-h-[44px] flex-col items-start rounded-2xl border px-3 py-2 text-left transition-colors',
              activo ? 'border-brand bg-brand-tint' : 'border-border hover:bg-accent',
              ANILLO,
            )}
          >
            <span className="text-xs font-medium text-muted-foreground sm:text-sm">{etiqueta}</span>{' '}
            <span className="text-xl font-semibold tabular-nums text-foreground">{cantidad}</span>
          </button>
        )
      })}
    </div>
  )
}

export function LideresSupervision({ lideres }: { lideres: readonly LiderSupervisado[] }): ReactElement {
  const [filtros, setFiltros] = useState<FiltrosLideres>(FILTROS_LIDERES_VACIOS)
  const [orden, setOrden] = useState<OrdenLideres>(null)

  const opciones = useMemo(() => opcionesUbicacion(lideres, filtros), [lideres, filtros])
  const visibles = useMemo(() => ordenarLideres(filtrarLideres(lideres, filtros), orden), [lideres, filtros, orden])

  if (lideres.length === 0) {
    return <TextoSistema variante="sutil">No hay líderes en tu cadena de supervisión.</TextoSistema>
  }

  const cambiar = (parche: Partial<FiltrosLideres>): void => setFiltros((actuales) => ({ ...actuales, ...parche }))
  const ordenar = (columna: ColumnaLider): void => setOrden((actual) => siguienteOrden(actual, columna))

  return (
    <div className="space-y-4">
      <ContadoresLideres lideres={lideres} estado={filtros.estado} onEstado={(estado) => cambiar({ estado })} />
      <FiltrosLideresSupervision filtros={filtros} opciones={opciones} visibles={visibles.length} onCambio={cambiar} />

      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2">
        <TextoSistema variante="sutil" tamaño="sm" aria-live="polite">
          {`Mostrando ${visibles.length} de ${lideres.length}`}
        </TextoSistema>
        {hayFiltrosLideres(filtros) ? (
          <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => setFiltros(FILTROS_LIDERES_VACIOS)}>
            Limpiar filtros
          </BotonSistema>
        ) : null}
      </div>

      {visibles.length === 0 ? (
        <TextoSistema variante="sutil">Ningún líder coincide con estos filtros.</TextoSistema>
      ) : (
        <>
          <TablaLideres lideres={visibles} orden={orden} onOrdenar={ordenar} />
          <ListaLideres lideres={visibles} />
        </>
      )}
    </div>
  )
}
