'use client'

/**
 * DPS › Matriz — the matrix of Sundays (`table[role=grid]` of
 * prototipos/planificacion-dps/03-matriz-domingos.html; planned
 * `MatrizAsignar` and `PopoverAsignar` of
 * docs/design-system/components.md#planning-style-components and
 * docs/design-system/patterns.md#matrix-assign, local here until they move
 * to components/ui). Two sticky head rows: the series bands (3px `chart-*`
 * top border on its tint; «Especial» hatched; «Sin serie» plain) and the
 * dates (the link to the plan, «Próximo», "Semana N" or the special day's
 * date and horario). The frozen first column (190px) holds the team rows
 * (muted, "N faltan" / "completo") and the puesto rows. Every column has one
 * fixed width in a `<colgroup>` (`table-layout: fixed`) and the sticky cells
 * are only ever `sticky` (never `relative` after it: tailwind-merge keeps
 * the last `position`, L46), so each cell stays under its head while
 * scrolling. Each cell lists the convocados of that puesto on that date
 * (names wrap, never cut; "Lorena I." when condensed; the highlighted
 * person in the brand tint) and «Falta N» while places are missing; "—"
 * when the date has no plan or the puesto is not in it.
 *
 * Keyboard: one roving cell; arrows move (team rows and filtered rows are
 * skipped), Home / End go to the first / last date; click, Enter or F2
 * opens the popover on the cell (`aria-selected`, inset brand ring) or
 * announces why it does not apply. The popover lists who is there with
 * «Resaltar» and, for whoever plans, «Quitar» (never for the automatic
 * director of S8, tagged «Automático») and the candidates of
 * convocar-puesto.tsx with the "Ya sirve ese día" warning; a pick or a
 * removal keeps it open on the updated cell. Escape returns the focus to the
 * cell. The parent saves.
 */
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { Crosshair, X } from 'lucide-react'

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { CLASE_BOTON_ICONO } from '@/components/grupos-vida/planner/estilo-planner'
import { EtiquetaPlanner } from '@/components/grupos-vida/planner/etiqueta'
import {
  bandasMatriz,
  celdaMatriz,
  etiquetaColumna,
  faltaEquipoMatriz,
  nombreCorto,
  type ColumnaMatriz,
  type EquipoMatriz,
} from '@/lib/platform/dps/matriz'
import { faltaPuesto, fechaHablada, type CandidatoPuesto, type ConvocadoPlan, type EquiposPlan, type PuestoPlan } from '@/lib/platform/dps/plan'
import { horariosTexto } from '@/lib/platform/dps/planilla'
import { cn } from '@/lib/utils'

import { CLASE_INSIGNIA_FALTA } from './columnas-equipos'
import { ConvocarPuesto } from './convocar-puesto'
import { hrefPlan } from './encabezado-plan'
import { CLASE_RAYADO, type Densidad } from './hoja-programacion'

export interface CeldaAbierta {
  readonly puestoId: string
  readonly clave: string
}

export interface MatrizDomingosProps {
  readonly columnas: readonly ColumnaMatriz[]
  /** The rows to show (already filtered by team). */
  readonly equipos: readonly EquipoMatriz[]
  readonly equiposPorPlan: Readonly<Record<string, EquiposPlan>>
  readonly editable: boolean
  readonly densidad: Densidad
  /** clave of the «Próximo» column. */
  readonly proximo: string | null
  /** personaId of the highlighted person. */
  readonly resaltado: string | null
  readonly abierta: CeldaAbierta | null
  readonly onAbrir: (celda: CeldaAbierta | null) => void
  /** Bumped after each saved change: the popover reads its candidates again. */
  readonly recarga: number
  readonly onConvocar: (columna: ColumnaMatriz, puesto: PuestoPlan, candidato: CandidatoPuesto) => void
  readonly onQuitar: (columna: ColumnaMatriz, puesto: PuestoPlan, convocado: ConvocadoPlan) => void
  readonly onResaltar: (convocado: ConvocadoPlan) => void
  /** A polite sentence (a cell that does not apply). */
  readonly onAviso: (frase: string) => void
}

/** The frozen column and the date columns: the `<col>` widths. */
export const ANCHO_PUESTO = 190
export const ANCHO_DOMINGO = 150
export const ANCHO_ESPECIAL = 130

const CLASE_BORDE = 'border-r border-b border-border/70'
const CLASE_AJUSTE = 'whitespace-normal break-words align-top'

const BORDE_SERIE: Readonly<Record<string, string>> = {
  'chart-1': 'border-t-chart-1 bg-[color-mix(in_oklab,var(--chart-1)_12%,var(--card))]',
  'chart-2': 'border-t-chart-2 bg-[color-mix(in_oklab,var(--chart-2)_12%,var(--card))]',
  'chart-3': 'border-t-chart-3 bg-[color-mix(in_oklab,var(--chart-3)_12%,var(--card))]',
  'chart-4': 'border-t-chart-4 bg-[color-mix(in_oklab,var(--chart-4)_12%,var(--card))]',
  'chart-5': 'border-t-chart-5 bg-[color-mix(in_oklab,var(--chart-5)_12%,var(--card))]',
}

const ANILLO = 'shadow-[inset_0_0_0_2px_var(--brand-primary)]'

const anchoColumna = (c: ColumnaMatriz): number => (c.especial ? ANCHO_ESPECIAL : ANCHO_DOMINGO)

const textoFalta = (n: number): string => (n === 0 ? 'completo' : `${n} ${n === 1 ? 'falta' : 'faltan'}`)

/** Why a cell does not open, read aloud. */
function motivoNoAplica(columna: ColumnaMatriz, puesto: string, equiposPorPlan: Readonly<Record<string, EquiposPlan>>): string {
  if (!columna.plan) {
    const fecha = fechaHablada(columna.fecha)
    return `El ${fecha} no tiene plan todavía.`
  }
  if (!equiposPorPlan[columna.plan.id]) return `No se pudo cargar ${etiquetaColumna(columna).titulo}. Actualiza la página.`
  return `${puesto} no se convoca para ${etiquetaColumna(columna).titulo}.`
}

function ContenidoCelda({ puesto, condensado, resaltado }: { puesto: PuestoPlan | null; condensado: boolean; resaltado: string | null }): ReactElement {
  if (!puesto) return <span className="text-muted-foreground">—</span>
  const falta = faltaPuesto(puesto)
  return (
    <div className={cn('flex flex-col gap-[3px]', condensado && 'flex-row flex-wrap gap-x-1.5 gap-y-0.5')}>
      {puesto.convocados.map((c) => {
        const marcado = c.personaId === resaltado
        return (
          <span
            key={c.personaId}
            data-resaltado={marcado || undefined}
            title={c.nombre}
            className={cn(
              'block rounded-sm border border-transparent bg-muted px-1.5 py-0.5 leading-4 break-words',
              condensado && 'inline bg-transparent px-0.5 py-0',
              marcado && 'border-brand bg-brand-tint font-[650]',
            )}
          >
            {condensado ? nombreCorto(c.nombre) : c.nombre}
            {c.automatico && <span className="sr-only"> (automático)</span>}
          </span>
        )
      })}
      {falta > 0 && (
        <span className="inline-flex items-center gap-1 px-0.5 py-px font-semibold text-danger-text">
          <span className={CLASE_INSIGNIA_FALTA}>{falta}</span>
          Falta
        </span>
      )}
    </div>
  )
}

interface PopoverCeldaProps {
  readonly columna: ColumnaMatriz
  readonly equipo: EquipoMatriz
  readonly puesto: PuestoPlan
  readonly editable: boolean
  readonly resaltado: string | null
  readonly recarga: number
  readonly onConvocar: MatrizDomingosProps['onConvocar']
  readonly onQuitar: MatrizDomingosProps['onQuitar']
  readonly onResaltar: MatrizDomingosProps['onResaltar']
}

function CuerpoPopover({ columna, equipo, puesto, editable, resaltado, recarga, onConvocar, onQuitar, onResaltar, idTitulo, idBusqueda }: PopoverCeldaProps & { idTitulo: string; idBusqueda: string }): ReactElement {
  const plan = columna.plan!
  const horarios = horariosTexto(plan.horarios)
  return (
    <div className="space-y-2">
      <div>
        <h2 id={idTitulo} className="text-[13px] font-[650]">
          {puesto.nombre} · {etiquetaColumna(columna).titulo}
        </h2>
        <p className="text-xs text-muted-foreground">
          {equipo.equipo} · <span className="font-mono tabular-nums">{puesto.convocados.length}</span> de{' '}
          <span className="font-mono tabular-nums">{puesto.cantidad}</span>
          {horarios && <> · {horarios}</>}
        </p>
      </div>
      <ul aria-label={`Convocados en ${puesto.nombre}`}>
        {puesto.convocados.length === 0 ? (
          <li className="flex min-h-9 items-center text-[13px] text-danger-text">Nadie convocado todavía</li>
        ) : (
          puesto.convocados.map((c) => (
            <li key={c.personaId} className="flex min-h-9 items-center gap-1.5 text-[13px]">
              <span className="min-w-0 flex-1 font-medium break-words">{c.nombre}</span>
              {c.automatico && (
                <span className="shrink-0">
                  <EtiquetaPlanner tono="neutro">Automático</EtiquetaPlanner>
                </span>
              )}
              <button
                type="button"
                aria-pressed={c.personaId === resaltado}
                aria-label={`Resaltar a ${c.nombre} en la matriz`}
                onClick={() => onResaltar(c)}
                className={cn(CLASE_BOTON_ICONO, 'aria-pressed:text-brand-text')}
              >
                <Crosshair aria-hidden="true" className="size-3.5" />
              </button>
              {/* The director of the dirección follows Dream Team: never removed here (S8). */}
              {editable && !c.automatico && (
                <button type="button" aria-label={`Quitar a ${c.nombre}`} onClick={() => onQuitar(columna, puesto, c)} className={CLASE_BOTON_ICONO}>
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              )}
            </li>
          ))
        )}
      </ul>
      {editable && puesto.activo && (
        <>
          <h3 className="pt-1 text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Convocar</h3>
          <ConvocarPuesto
            planId={plan.id}
            puestoId={puesto.puestoId}
            puesto={puesto.nombre}
            equipo={equipo.equipo}
            horarios={horarios}
            idTitulo={idTitulo}
            idBusqueda={idBusqueda}
            encabezado={false}
            recarga={recarga}
            onElegir={(candidato) => onConvocar(columna, puesto, candidato)}
          />
        </>
      )}
    </div>
  )
}

export function MatrizDomingos({
  columnas,
  equipos,
  equiposPorPlan,
  editable,
  densidad,
  proximo,
  resaltado,
  abierta,
  onAbrir,
  recarga,
  onConvocar,
  onQuitar,
  onResaltar,
  onAviso,
}: MatrizDomingosProps): ReactElement {
  const tablaRef = useRef<HTMLTableElement>(null)
  const contenidoRef = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const idBusqueda = useId()
  const [foco, setFoco] = useState<CeldaAbierta | null>(null)
  const enfocarRef = useRef(false)
  const devolverRef = useRef<CeldaAbierta | null>(null)
  const condensado = densidad === 'condensado'

  const filas = equipos.flatMap((e) => e.puestos.map((p) => p.puestoId))
  const visible = foco && filas.includes(foco.puestoId) && columnas.some((c) => c.clave === foco.clave)
  const parada: CeldaAbierta | null = visible ? foco : filas[0] && columnas[0] ? { puestoId: filas[0], clave: columnas[0].clave } : null

  const celdaDom = (c: CeldaAbierta) => tablaRef.current?.querySelector<HTMLElement>(`td[data-puesto="${c.puestoId}"][data-columna="${c.clave}"]`) ?? null

  useEffect(() => {
    if (!enfocarRef.current || !foco) return
    enfocarRef.current = false
    celdaDom(foco)?.focus()
  }, [foco])

  // Escape (not a click elsewhere) gives the focus back to the cell once the popover is gone.
  useEffect(() => {
    if (abierta || !devolverRef.current) return
    celdaDom(devolverRef.current)?.focus()
    devolverRef.current = null
  }, [abierta])

  function mover(destino: CeldaAbierta): void {
    enfocarRef.current = true
    setFoco(destino)
  }

  function abrir(columna: ColumnaMatriz, equipo: EquipoMatriz, puestoId: string): void {
    setFoco({ puestoId, clave: columna.clave })
    if (!celdaMatriz(equiposPorPlan, columna, puestoId)) {
      onAviso(motivoNoAplica(columna, equipo.puestos.find((p) => p.puestoId === puestoId)?.nombre ?? '', equiposPorPlan))
      return
    }
    onAbrir({ puestoId, clave: columna.clave })
  }

  function tecla(e: KeyboardEvent<HTMLTableCellElement>, columna: ColumnaMatriz, equipo: EquipoMatriz, puestoId: string): void {
    // Keys typed in the popover bubble here through the React tree.
    if (e.target !== e.currentTarget) return
    const f = filas.indexOf(puestoId)
    const c = columnas.findIndex((x) => x.clave === columna.clave)
    const destino: Record<string, [number, number]> = {
      ArrowUp: [f - 1, c],
      ArrowDown: [f + 1, c],
      ArrowLeft: [f, c - 1],
      ArrowRight: [f, c + 1],
      Home: [f, 0],
      End: [f, columnas.length - 1],
    }
    const d = destino[e.key]
    if (d) {
      e.preventDefault()
      const fila = filas[d[0]]
      const col = columnas[d[1]]
      if (fila && col) mover({ puestoId: fila, clave: col.clave })
      return
    }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      abrir(columna, equipo, puestoId)
    }
  }

  function clic(e: MouseEvent<HTMLTableCellElement>, columna: ColumnaMatriz, equipo: EquipoMatriz, puestoId: string): void {
    // Clicks in the popover (a portal) bubble here through the React tree.
    if (!e.currentTarget.contains(e.target as Node)) return
    abrir(columna, equipo, puestoId)
  }

  const bandas = bandasMatriz(columnas)
  const ancho = ANCHO_PUESTO + columnas.reduce((n, c) => n + anchoColumna(c), 0)
  // aria-rowindex: the two head rows, then each team row followed by its puestos.
  const inicios = equipos.reduce<number[]>((acc, e, i) => [...acc, i === 0 ? 3 : acc[i - 1] + 1 + equipos[i - 1].puestos.length], [])

  return (
    <table
      ref={tablaRef}
      role="grid"
      aria-label="Convocados por puesto y fecha"
      aria-readonly={editable ? undefined : true}
      aria-describedby="ayuda-matriz"
      aria-rowcount={2 + equipos.length + filas.length}
      data-densidad={densidad}
      style={{ width: ancho }}
      className="table-fixed border-separate border-spacing-0 text-xs"
    >
      <colgroup>
        <col style={{ width: ANCHO_PUESTO }} />
        {columnas.map((c) => (
          <col key={c.clave} style={{ width: anchoColumna(c) }} />
        ))}
      </colgroup>
      <thead>
        <tr aria-rowindex={1}>
          <th
            scope="col"
            rowSpan={2}
            className={cn(CLASE_BORDE, 'sticky top-0 left-0 z-[4] border-b-border bg-card px-2.5 py-1.5 text-left align-bottom text-xs font-medium text-muted-foreground')}
          >
            Equipo › puesto
          </th>
          {bandas.map((b) => (
            <th
              key={b.clave}
              data-testid="banda"
              scope="colgroup"
              colSpan={b.columnas}
              title={b.serie?.nombre}
              className={cn(
                CLASE_BORDE,
                'sticky top-0 z-[3] h-[30px] truncate px-2 py-1 text-left text-xs font-semibold',
                b.especial ? CLASE_RAYADO : b.serie ? ['border-t-[3px]', BORDE_SERIE[b.serie.color] ?? BORDE_SERIE['chart-1']] : 'bg-card font-normal text-muted-foreground',
              )}
            >
              {b.especial ? 'Especial' : (b.serie?.nombre ?? 'Sin serie')}
              {b.serie?.semanas ? (
                <small className="ml-1.5 text-xs font-normal text-muted-foreground">
                  <span className="font-mono tabular-nums">{b.serie.semanas}</span> {b.serie.semanas === 1 ? 'semana' : 'semanas'}
                </small>
              ) : null}
            </th>
          ))}
        </tr>
        <tr aria-rowindex={2}>
          {columnas.map((c, i) => {
            const { titulo, detalle } = etiquetaColumna(c)
            return (
              <th
                key={c.clave}
                scope="col"
                aria-colindex={i + 2}
                className={cn(
                  CLASE_BORDE,
                  CLASE_AJUSTE,
                  'sticky top-[30px] z-[3] h-[44px] border-b-border px-2 py-1 text-left font-normal',
                  c.especial ? CLASE_RAYADO : 'bg-card',
                )}
              >
                {c.plan ? (
                  <Link href={hrefPlan(c.plan.id)} className="rounded-sm text-[13px] font-[650] text-foreground hover:underline focus-ring">
                    {titulo}
                  </Link>
                ) : (
                  <span className="text-[13px] font-[650] text-muted-foreground">{titulo}</span>
                )}
                {c.clave === proximo && <span className="ml-1 rounded-sm bg-brand-tint px-1.5 text-[11px] font-semibold text-brand-text">Próximo</span>}
                {detalle && <small className="block text-xs text-muted-foreground">{detalle}</small>}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {equipos.map((equipo, iEquipo) => {
          const falta = faltaEquipoMatriz(equipo, columnas, equiposPorPlan)
          return (
            <Fragment key={equipo.equipoId}>
              <tr aria-rowindex={inicios[iEquipo]}>
                <th
                  role="rowheader"
                  scope="rowgroup"
                  className={cn(CLASE_BORDE, CLASE_AJUSTE, 'sticky left-0 z-[2] bg-muted px-2.5 py-1 text-left text-xs font-[650]')}
                >
                  {equipo.equipo}
                  <span className={cn('ml-1.5 font-normal text-muted-foreground', falta > 0 && 'text-danger-text')}>{textoFalta(falta)}</span>
                </th>
                {columnas.map((c) => (
                  <td key={c.clave} aria-hidden="true" className={cn(CLASE_BORDE, 'bg-muted')} />
                ))}
              </tr>
              {equipo.puestos.map((p, iPuesto) => (
                <tr key={p.puestoId} aria-rowindex={inicios[iEquipo] + 1 + iPuesto}>
                  <th scope="row" className={cn(CLASE_BORDE, CLASE_AJUSTE, 'sticky left-0 z-[2] bg-card px-2.5 py-1.5 text-left text-[13px] font-medium', condensado && 'py-0.5')}>
                    {p.nombre}
                  </th>
                  {columnas.map((c, i) => {
                    const puesto = celdaMatriz(equiposPorPlan, c, p.puestoId)
                    const esAbierta = abierta?.puestoId === p.puestoId && abierta.clave === c.clave && puesto !== null && c.plan !== null
                    const esParada = parada?.puestoId === p.puestoId && parada.clave === c.clave
                    const contenido = (
                      <div>
                        <ContenidoCelda puesto={puesto} condensado={condensado} resaltado={resaltado} />
                      </div>
                    )
                    return (
                      <td
                        key={c.clave}
                        role="gridcell"
                        aria-colindex={i + 2}
                        aria-selected={esAbierta || undefined}
                        data-puesto={p.puestoId}
                        data-columna={c.clave}
                        tabIndex={esParada ? 0 : -1}
                        onKeyDown={(e) => tecla(e, c, equipo, p.puestoId)}
                        onClick={(e) => clic(e, c, equipo, p.puestoId)}
                        onFocus={(e) => {
                          if (e.target === e.currentTarget && (foco?.puestoId !== p.puestoId || foco?.clave !== c.clave)) setFoco({ puestoId: p.puestoId, clave: c.clave })
                        }}
                        className={cn(
                          CLASE_BORDE,
                          CLASE_AJUSTE,
                          'cursor-pointer px-1.5 py-1 outline-none transition-colors hover:bg-accent focus-visible:shadow-[inset_0_0_0_2px_var(--brand-primary)]',
                          c.especial && CLASE_RAYADO,
                          condensado && 'py-0.5',
                          esAbierta && ANILLO,
                        )}
                      >
                        {esAbierta && puesto ? (
                          <Popover
                            open
                            onOpenChange={(o) => {
                              if (!o) onAbrir(null)
                            }}
                          >
                            <PopoverAnchor asChild>{contenido}</PopoverAnchor>
                            <PopoverContent
                              ref={contenidoRef}
                              align="start"
                              aria-labelledby={idTitulo}
                              className="w-[290px] max-w-[calc(100vw-2rem)] rounded-md border-border bg-card p-2.5 shadow-sheet"
                              onOpenAutoFocus={(e) => {
                                e.preventDefault()
                                const busqueda = document.getElementById(idBusqueda)
                                ;(busqueda ?? contenidoRef.current?.querySelector<HTMLElement>('button'))?.focus()
                              }}
                              onEscapeKeyDown={() => {
                                devolverRef.current = { puestoId: p.puestoId, clave: c.clave }
                              }}
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              <CuerpoPopover
                                columna={c}
                                equipo={equipo}
                                puesto={puesto}
                                editable={editable}
                                resaltado={resaltado}
                                recarga={recarga}
                                onConvocar={onConvocar}
                                onQuitar={onQuitar}
                                onResaltar={onResaltar}
                                idTitulo={idTitulo}
                                idBusqueda={idBusqueda}
                              />
                            </PopoverContent>
                          </Popover>
                        ) : (
                          contenido
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
