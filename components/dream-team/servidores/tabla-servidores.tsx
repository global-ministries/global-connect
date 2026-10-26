'use client'

/**
 * Servidores — the table: one `TarjetaSistema p-0` with sortable header
 * buttons (`aria-sort` on the active column header). "Por persona" (the
 * default) renders one `<tbody>` per person: the person's cell (avatar, name,
 * marks, phone) spans the stacked lines of their servicios, each with its
 * equipo and path, role and etapa badges, the campus shifts ("—" when none),
 * start date and its own "⋯" menu; past three servicios a "+N más" button
 * expands the rest. "Sin agrupar" and "Por equipo" render one row per
 * servicio (with group header rows for "Por equipo").
 */
import { useState, type ReactElement, type ReactNode } from 'react'
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
  MAX_SERVICIOS_POR_PERSONA,
  recortarServicios,
  type ColumnaOrden,
  type FilaVista,
  type FiltrosServidores,
  type ItemLista,
  type PersonaLista,
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

interface MarcasProps {
  readonly gruposVida: boolean
  readonly sinCuenta: boolean
  /** Shown as "N equipos" from 2 on; 0 hides it. */
  readonly equipos: number
}

function Marcas({ gruposVida, sinCuenta, equipos }: MarcasProps): ReactElement | null {
  const marcas: ReactElement[] = []
  if (gruposVida) {
    marcas.push(
      <BadgeSistema key="gdv" variante="default" tamaño="sm">
        {ORIGEN_GRUPOS_VIDA_LABEL}
      </BadgeSistema>,
    )
  }
  if (sinCuenta) {
    marcas.push(
      <BadgeSistema key="sin-cuenta" variante="warning" tamaño="sm">
        {SIN_CUENTA_LABEL}
      </BadgeSistema>,
    )
  }
  if (equipos >= 2) {
    marcas.push(
      <BadgeSistema key="varios" variante="info" tamaño="sm">
        {equipos} equipos
      </BadgeSistema>,
    )
  }
  return marcas.length > 0 ? <>{marcas}</> : null
}

export function MarcasDeFila({ fila }: { readonly fila: FilaVista }): ReactElement | null {
  return <Marcas gruposVida={fila.origen === 'grupos_vida'} sinCuenta={fila.tieneCuenta === false} equipos={fila.equiposDeLaPersona} />
}

/** A person's marks, once: no "N equipos", their servicios are listed right there. */
export function MarcasDePersona({ persona }: { readonly persona: PersonaLista }): ReactElement | null {
  return <Marcas gruposVida={persona.soloGruposVida} sinCuenta={persona.tieneCuenta === false} equipos={0} />
}

/** A Grupos de Vida servicio of a person who also serves in Dream Team: the mark goes on that line. */
export function MarcaGruposVidaDeServicio({
  persona,
  fila,
}: {
  readonly persona: PersonaLista
  readonly fila: FilaVista
}): ReactElement | null {
  if (persona.soloGruposVida || fila.origen !== 'grupos_vida') return null
  return (
    <BadgeSistema variante="default" tamaño="sm">
      {ORIGEN_GRUPOS_VIDA_LABEL}
    </BadgeSistema>
  )
}

/** "+N más" / "Ver menos" under a person's servicios (a 44px button). */
export function BotonVerMas({
  ocultos,
  expandido,
  onCambio,
}: {
  readonly ocultos: number
  readonly expandido: boolean
  readonly onCambio: (expandido: boolean) => void
}): ReactElement {
  return (
    <button
      type="button"
      aria-expanded={expandido}
      onClick={() => onCambio(!expandido)}
      className={cn(
        'min-h-[44px] rounded-xl px-2 text-sm font-medium text-brand-text transition-colors hover:bg-accent',
        ANILLO,
      )}
    >
      {expandido ? 'Ver menos' : `+${ocultos} más`}
    </button>
  )
}

/** The servicios a person shows (three until expanded) and the "+N más" state. */
export function useServiciosDePersona(persona: PersonaLista): {
  readonly visibles: readonly FilaVista[]
  readonly toggle: ReactElement | null
} {
  const [expandido, setExpandido] = useState(false)
  const { visibles, ocultos } = recortarServicios(persona.filas, expandido)
  const toggle =
    persona.filas.length > MAX_SERVICIOS_POR_PERSONA ? (
      <BotonVerMas ocultos={ocultos} expandido={expandido} onCambio={setExpandido} />
    ) : null
  return { visibles, toggle }
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
                      '-mx-2 flex min-h-[44px] items-center gap-1 rounded-xl px-2 uppercase tracking-wider transition-colors hover:bg-accent',
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
        {items.some((item) => item.tipo === 'persona') ? (
          items.map((item) =>
            item.tipo === 'persona' ? <PersonaTabla key={item.clave} persona={item} onActualizado={onActualizado} /> : null,
          )
        ) : (
          <tbody className="divide-y divide-border">
            {items.map((item) =>
              item.tipo === 'grupo' ? (
                <tr key={`grupo-${item.clave}`} className="bg-muted/40">
                  <th scope="row" colSpan={COLUMNAS_ORDEN.length + 2} className="px-4 py-2 text-left">
                    <span className="text-sm font-semibold text-foreground">{item.titulo}</span>
                    <span className="ml-3 text-sm font-normal text-muted-foreground">{item.detalle}</span>
                  </th>
                </tr>
              ) : item.tipo === 'fila' ? (
                <FilaTabla key={item.fila.clave} fila={item.fila} onActualizado={onActualizado} />
              ) : null,
            )}
          </tbody>
        )}
      </table>
    </TarjetaSistema>
  )
}

function CeldaPersona({
  nombre,
  telefono,
  marcas,
  className,
  rowSpan,
}: {
  readonly nombre: string
  readonly telefono: string | null
  readonly marcas: ReactNode
  readonly className?: string
  readonly rowSpan?: number
}): ReactElement {
  return (
    <td rowSpan={rowSpan} className={cn('px-4 py-2', className)}>
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-bold text-brand-text"
        >
          {inicialesDe(nombre)}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium text-foreground">{nombre}</span>
            {marcas}
          </div>
          <TelefonoServidor telefono={telefono} />
        </div>
      </div>
    </td>
  )
}

/** Equipo, rol, etapa, inicio, turno and the menu of one servicio. */
function CeldasServicio({
  fila,
  onActualizado,
  detalleMenu,
  marca,
}: {
  readonly fila: FilaVista
  readonly onActualizado: () => void
  readonly detalleMenu?: string
  readonly marca?: ReactNode
}): ReactElement {
  return (
    <>
      <td className="px-4 py-2">
        <div className="text-sm text-foreground">{fila.equipoLabel}</div>
        <div className="text-xs text-muted-foreground">{fila.equipoRuta || 'Raíz del organigrama'}</div>
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <BadgeSistema variante={rolBadgeVariante(fila.rolLabel)} tamaño="sm">
            {fila.rolLabel}
          </BadgeSistema>
          {marca}
        </div>
      </td>
      <td className="px-4 py-2">
        <BadgeSistema variante={ESTADO_BADGE_VARIANTE[fila.estado]} tamaño="sm">
          {ESTADO_LABELS[fila.estado]}
        </BadgeSistema>
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-sm text-muted-foreground">{formatearFecha(fila.fechaInicio)}</td>
      <td className="px-4 py-2 text-sm text-muted-foreground">{fila.turnosTexto}</td>
      <td className="px-2 py-2">
        <MenuServidor fila={fila} onActualizado={onActualizado} detalle={detalleMenu} />
      </td>
    </>
  )
}

function FilaTabla({ fila, onActualizado }: { readonly fila: FilaVista; readonly onActualizado: () => void }): ReactElement {
  return (
    <tr className="hover:bg-accent/50">
      <CeldaPersona nombre={fila.nombre} telefono={fila.telefono} marcas={<MarcasDeFila fila={fila} />} />
      <CeldasServicio fila={fila} onActualizado={onActualizado} />
    </tr>
  )
}

/** A person once: their cell spans the stacked lines of their servicios (and the "+N más" line). */
function PersonaTabla({
  persona,
  onActualizado,
}: {
  readonly persona: PersonaLista
  readonly onActualizado: () => void
}): ReactElement {
  const { visibles, toggle } = useServiciosDePersona(persona)
  const varios = persona.filas.length > 1
  return (
    <tbody aria-label={persona.nombre} className="border-t border-border hover:bg-accent/50">
      {visibles.map((fila, i) => (
        <tr key={fila.clave}>
          {i === 0 && (
            <CeldaPersona
              nombre={persona.nombre}
              telefono={persona.telefono}
              marcas={<MarcasDePersona persona={persona} />}
              rowSpan={visibles.length + (toggle ? 1 : 0)}
              className="align-top"
            />
          )}
          <CeldasServicio
            fila={fila}
            onActualizado={onActualizado}
            detalleMenu={varios ? fila.equipoLabel : undefined}
            marca={<MarcaGruposVidaDeServicio persona={persona} fila={fila} />}
          />
        </tr>
      ))}
      {toggle && (
        <tr>
          <td colSpan={COLUMNAS_ORDEN.length + 1} className="px-2 pb-2">
            {toggle}
          </td>
        </tr>
      )}
    </tbody>
  )
}
