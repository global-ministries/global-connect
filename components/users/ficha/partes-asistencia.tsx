/**
 * Pieces of the Asistencia tab (prototype 03-ficha-escritorio.html: `.kpis`,
 * `.g-lista`, `.g-asis`, `.g-taller`, `.lidera`, `.hist`, `.tend`).
 */
import Link from 'next/link'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Heart } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { cn } from '@/lib/utils'
import type { GrupoAsistencia } from '@/lib/platform/usuarios/asistencia-persona'
import { estadoDeGrupo, type FilaHistorial, type Tendencia } from '@/lib/platform/usuarios/asistencia-vista'
import { enlaceAsistenciaGrupo } from '@/lib/platform/usuarios/ficha-vista'

import { etiquetaSemana } from './curva-asistencia'
import { EtiquetaNeutra } from './partes-ficha'

const NUM = 'font-mono tabular-nums tracking-[-0.02em]'

export function Kpis({ items }: { readonly items: readonly { etiqueta: string; valor: string; numero?: boolean }[] }): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
      {items.map((k) => (
        <div key={k.etiqueta} className="grid min-w-0 content-start gap-1.5 rounded-2xl border border-border bg-card p-3 md:p-4">
          <span className="text-xs text-muted-foreground">{k.etiqueta}</span>
          <span className={k.numero === false ? 'text-[15px] font-semibold [overflow-wrap:anywhere]' : cn(NUM, 'text-[26px] font-semibold leading-none md:text-[30px]')}>
            {k.valor}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The cards row: a grid from md, a snapping horizontal row on phones (prototype `.g-lista`). */
export function ListaTarjetas({ etiqueta, children }: { readonly etiqueta: string; readonly children: ReactNode }): ReactElement {
  return (
    <section
      aria-label={etiqueta}
      className={cn(
        'grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]',
        'max-md:-mx-4 max-md:auto-cols-[minmax(200px,72%)] max-md:grid-flow-col max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:px-4 max-md:scroll-px-4 max-md:[scrollbar-width:none]',
      )}
    >
      {children}
    </section>
  )
}

const CLASE_TARJETA =
  'grid min-w-0 content-start gap-2 rounded-2xl border border-border bg-card p-4 text-left text-foreground max-md:snap-start'
const CLASE_PULSABLE =
  'focus-ring min-h-11 cursor-pointer transition-colors hover:border-foreground/25 aria-pressed:border-brand-strong aria-pressed:bg-brand-tint motion-reduce:transition-none'

function Barra({ porcentaje, tono }: { readonly porcentaje: number; readonly tono: 'brand' | 'muted' | 'success' }): ReactElement {
  const fondo = { brand: 'bg-brand-strong', muted: 'bg-muted-foreground', success: 'bg-success' }[tono]
  return (
    <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-muted">
      <span className={cn('block h-full rounded-full', fondo)} style={{ width: `${Math.max(0, Math.min(100, porcentaje))}%` }} />
    </span>
  )
}

export function TarjetaTodos({ total, pulsada, onPulsar }: { readonly total: number; readonly pulsada: boolean; readonly onPulsar: () => void }): ReactElement {
  return (
    <button type="button" aria-pressed={pulsada} onClick={onPulsar} className={cn(CLASE_TARJETA, CLASE_PULSABLE, 'content-center')}>
      <span className="font-semibold">Todos los grupos</span>
      <span className="text-[13px] text-muted-foreground">{`${total} grupos`}</span>
    </button>
  )
}

export function TarjetaGrupo({ grupo, pulsada, onPulsar }: { readonly grupo: GrupoAsistencia; readonly pulsada: boolean; readonly onPulsar: () => void }): ReactElement {
  const estado = estadoDeGrupo(grupo)
  const { porcentaje, reuniones } = grupo.totales
  return (
    <button type="button" aria-pressed={pulsada} onClick={onPulsar} className={cn(CLASE_TARJETA, CLASE_PULSABLE)}>
      {grupo.tipo === 'estudiantes' && grupo.area && <span className="text-xs text-muted-foreground">{grupo.area}</span>}
      <span className="truncate font-semibold">{grupo.nombre}</span>
      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
        <EtiquetaNeutra>{grupo.rol}</EtiquetaNeutra>
        <PuntoEstado tono={estado.tono} etiqueta={estado.texto} />
      </span>
      <span className="flex items-baseline gap-2">
        <span className={cn(NUM, 'text-[22px] font-semibold')}>{porcentaje === null ? '—' : `${porcentaje}%`}</span>
        <span className="text-[13px] text-muted-foreground">{`${reuniones} ${reuniones === 1 ? 'reunión' : 'reuniones'}`}</span>
      </span>
      <Barra porcentaje={porcentaje ?? 0} tono={grupo.actual ? 'brand' : 'muted'} />
    </button>
  )
}

export function TarjetaTaller({ taller }: { readonly taller: GrupoAsistencia }): ReactElement {
  const estado = estadoDeGrupo(taller)
  const total = taller.totalSesiones ?? taller.totales.reuniones
  const { presentes } = taller.totales
  return (
    <div className={CLASE_TARJETA}>
      <span className="truncate font-semibold">{taller.nombre}</span>
      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
        <PuntoEstado tono={estado.tono} etiqueta={estado.texto} />
        {taller.area && <span className="text-muted-foreground">{taller.area}</span>}
      </span>
      <span className="flex items-baseline gap-2">
        <span className={cn(NUM, 'text-[22px] font-semibold')}>{`${presentes} de ${total}`}</span>
        <span className="text-[13px] text-muted-foreground">sesiones</span>
      </span>
      <Barra porcentaje={total ? (presentes / total) * 100 : 0} tono={taller.completado ? 'success' : 'brand'} />
    </div>
  )
}

/** "Lidera X. La asistencia de los miembros está en la página del grupo. Ver asistencia del grupo →" */
export function LlamadaLider({ grupo }: { readonly grupo: GrupoAsistencia }): ReactElement {
  return (
    <Link
      href={enlaceAsistenciaGrupo(grupo)}
      className="focus-ring flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground transition-colors hover:border-foreground/25"
    >
      <Heart aria-hidden="true" className="size-[18px] shrink-0 text-brand-text" />
      <span className="min-w-0 flex-[1_1_260px]">
        Lidera <b className="font-semibold">{grupo.nombre}</b>. La asistencia de los miembros está en la página del grupo.
      </span>
      <span className="inline-flex items-center gap-1 font-semibold text-brand-text">
        Ver asistencia del grupo <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </Link>
  )
}

export function ChipTendencia({ tendencia }: { readonly tendencia: Tendencia }): ReactElement {
  const { puntos, sentido } = tendencia
  const clase = { sube: 'bg-success/12 text-success-text', baja: 'bg-danger/12 text-danger-text', igual: 'bg-muted text-muted-foreground' }[sentido]
  const Icono = { sube: ArrowUpRight, baja: ArrowDownRight, igual: ArrowRight }[sentido]
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold', clase)}>
      <Icono aria-hidden="true" className="size-3.5" />
      <span className={NUM}>{`${puntos > 0 ? '+' : ''}${puntos} pts`}</span>
      <span className="font-normal text-muted-foreground">vs. hace 4 semanas</span>
    </span>
  )
}

export function Historial({ filas }: { readonly filas: readonly FilaHistorial[] }): ReactElement {
  return (
    <ul aria-label="Historial" className="m-0 list-none p-0">
      {filas.map((f) => (
        <li key={`${f.grupoId}-${f.fecha}`} className="flex min-h-[52px] items-center gap-3 border-t border-border/60 first:border-t-0">
          <span className={cn(NUM, 'w-16 shrink-0 text-[13px] text-muted-foreground')}>{etiquetaSemana(f.fecha)}</span>
          <span className="min-w-0 flex-1 truncate text-[15px]">
            {f.grupo}
            {f.pasado && <span className="text-[13px] text-muted-foreground"> · pasado</span>}
            {f.comoVisitante && <span className="text-[13px] text-muted-foreground"> · como visitante</span>}
          </span>
          <PuntoEstado tono={f.presente ? 'success' : 'muted'} etiqueta={f.presente ? 'Asistió' : 'No asistió'} className="shrink-0" />
        </li>
      ))}
    </ul>
  )
}
