'use client'

/**
 * The leaders' filters of the supervision view (odd/tasks/uno-a-uno.md, T8
 * S8.2, S8.4), after Dream Team → Servidores (barra-filtros.tsx,
 * hoja-filtros.tsx): the name search, Dirección, Área (only once a dirección
 * is chosen), Equipo o grupo, in cascade (T9 S9.1), and Estado. Below `md`
 * only the search stays, next to the "Filtros · N" button of a bottom sheet
 * that holds the selects, "Limpiar" (empties exactly those) and "Ver N"
 * (closes it). Every change applies live.
 */

import { useState, type ReactElement } from 'react'
import { Filter, Search } from 'lucide-react'

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { BotonSistema, InputSistema, PieAccionesSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { DIAS_SUPERVISION_LIDERES } from '@/lib/uno-a-uno/vista'
import {
  parcheElegirArea,
  parcheElegirDireccion,
  parcheElegirEquipo,
  type EstadoLider,
  type FiltrosLideres,
  type OpcionUbicacion,
  type OpcionesUbicacion,
} from '@/lib/uno-a-uno/supervision'

export const ESTADOS_LIDER: readonly { valor: EstadoLider; etiqueta: string }[] = [
  { valor: 'sin_uno_a_uno', etiqueta: `Sin 1 a 1 en ${DIAS_SUPERVISION_LIDERES} días` },
  { valor: 'al_dia', etiqueta: 'Al día' },
  { valor: 'con_agendados', etiqueta: 'Con agendados' },
]

const TODOS = ''
const LIMPIAR_HOJA: Partial<FiltrosLideres> = { direccion: null, area: null, equipo: null, estado: null }

// Literal class names so Tailwind keeps them: search plus 3 or 4 selects.
const COLUMNAS: Readonly<Record<number, string>> = {
  3: 'md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]',
  4: 'md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]',
}

interface FiltrosLideresProps {
  readonly filtros: FiltrosLideres
  readonly opciones: OpcionesUbicacion
  readonly visibles: number
  readonly onCambio: (parche: Partial<FiltrosLideres>) => void
}

function conTodas(todas: string, opciones: readonly OpcionUbicacion[]): { valor: string; etiqueta: string }[] {
  return [{ valor: TODOS, etiqueta: todas }, ...opciones.map((o) => ({ valor: o.id, etiqueta: o.label }))]
}

const elegido = (valor: string): string | null => (valor === TODOS ? null : valor)

function SelectoresLideres({ filtros, opciones, onCambio }: Omit<FiltrosLideresProps, 'visibles'>): ReactElement {
  return (
    <>
      <SelectSistema
        label="Dirección"
        opciones={conTodas('Todas', opciones.direcciones)}
        value={filtros.direccion ?? TODOS}
        onValueChange={(valor) => onCambio(parcheElegirDireccion(elegido(valor)))}
      />
      {opciones.areas.length > 0 ? (
        <SelectSistema
          label="Área"
          opciones={conTodas('Todas', opciones.areas)}
          value={filtros.area ?? TODOS}
          onValueChange={(valor) => onCambio(parcheElegirArea(elegido(valor), opciones.areas))}
        />
      ) : null}
      <SelectSistema
        label="Equipo o grupo"
        opciones={conTodas('Todos', opciones.equipos)}
        value={filtros.equipo ?? TODOS}
        onValueChange={(valor) => onCambio(parcheElegirEquipo(elegido(valor), opciones.equipos))}
      />
      <SelectSistema
        label="Estado"
        opciones={[{ valor: TODOS, etiqueta: 'Todos' }, ...ESTADOS_LIDER]}
        value={filtros.estado ?? TODOS}
        onValueChange={(valor) => onCambio({ estado: valor === TODOS ? null : (valor as EstadoLider) })}
      />
    </>
  )
}

function HojaFiltrosLideres({ filtros, opciones, visibles, onCambio }: FiltrosLideresProps): ReactElement {
  const [abierta, setAbierta] = useState(false)
  const enHoja = [filtros.direccion, filtros.area, filtros.equipo, filtros.estado].filter((f) => f !== null).length

  return (
    <Sheet open={abierta} onOpenChange={setAbierta}>
      <SheetTrigger asChild>
        <BotonSistema type="button" variante="outline" icono={Filter} className="md:hidden">
          {enHoja > 0 ? `Filtros · ${enHoja}` : 'Filtros'}
        </BotonSistema>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] gap-0 overflow-y-auto rounded-t-2xl p-0">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle className="text-lg font-semibold text-foreground">Filtros</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 p-4">
          <SelectoresLideres filtros={filtros} opciones={opciones} onCambio={onCambio} />
        </div>
        <PieAccionesSistema className="grid grid-cols-2 gap-3 bg-background px-4">
          <BotonSistema type="button" variante="outline" onClick={() => onCambio(LIMPIAR_HOJA)}>
            Limpiar
          </BotonSistema>
          <BotonSistema type="button" onClick={() => setAbierta(false)}>
            {`Ver ${visibles}`}
          </BotonSistema>
        </PieAccionesSistema>
      </SheetContent>
    </Sheet>
  )
}

export function FiltrosLideresSupervision(props: FiltrosLideresProps): ReactElement {
  const { filtros, opciones, onCambio } = props
  return (
    <section aria-label="Filtros de líderes" className={cn('grid gap-3', COLUMNAS[opciones.areas.length > 0 ? 4 : 3])}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <InputSistema
            type="search"
            icono={Search}
            label="Buscar"
            placeholder="Nombre del líder"
            value={filtros.q}
            onChange={(evento) => onCambio({ q: evento.target.value })}
          />
        </div>
        <HojaFiltrosLideres {...props} />
      </div>
      <div className="hidden md:contents">
        <SelectoresLideres filtros={filtros} opciones={opciones} onCambio={onCambio} />
      </div>
    </section>
  )
}
