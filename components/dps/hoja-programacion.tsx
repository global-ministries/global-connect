'use client'

/**
 * DPS › Programación — the sheet (`table[role=grid]` of
 * prototipos/planificacion-dps/04-programacion-anual-hoja.html; planned
 * `HojaCalculo` of docs/design-system/components.md#planning-style-components,
 * local here until it moves to components/ui). One row per Sunday of the
 * year, the special days as hatched full rows with a tag (never edited
 * here; their date opens their plan), and a month separator row
 * ("NOVIEMBRE 2026 · 5 domingos") whose label sticks to the top and to the
 * left. Frozen Fecha (146px, the link to the plan, "Próximo") and Serie
 * (250px, the 4px `chart-*` stripe and "n/m") columns ending in a 2px
 * border; sticky 34px header; 36px rows (30px condensed, 48px on touch);
 * 13px cells truncated with the full text in `title`; past dates muted;
 * empty cells read "Agregar" on hover when editable.
 *
 * Keyboard (docs/design-system/patterns.md#spreadsheet-keyboard), roving
 * tabindex over the Sunday rows (the Fecha link is the first stop of a row):
 * arrows move; Tab / Shift+Tab move and wrap; Enter, F2 or a double click
 * edits with the text selected; any character replaces the cell and keeps
 * typing; Delete / Backspace clears it. While editing: Enter saves and moves
 * down, Tab saves and moves right (left with Shift), Escape cancels, leaving
 * the cell saves. The edited cell keeps its size (the input fills it with
 * the brand outline). Read-only (aria-readonly): the same moves, no edits.
 * The parent saves and decides what changed.
 */
import { Fragment, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactElement } from 'react'
import Link from 'next/link'

import { EtiquetaPlanner } from '@/components/grupos-vida/planner/etiqueta'
import { horariosTexto } from '@/lib/platform/dps/planilla'
import {
  fechaCorta,
  nombreEspecial,
  nombreMes,
  partesFecha,
  semanaSerie,
  type ColumnaHoja,
  type DefColumna,
  type FilaHoja,
} from '@/lib/platform/dps/programacion'
import { cn } from '@/lib/utils'

import { hrefPlan } from './encabezado-plan'

export type Densidad = 'normal' | 'condensado'
export type FilaDomingo = Extract<FilaHoja, { clase: 'domingo' }>

/** The Fecha link is the first stop of a row. */
const FECHA = 'fecha'
type Columna = ColumnaHoja | typeof FECHA

interface Foco {
  readonly fecha: string
  readonly columna: Columna
}

interface Edicion {
  readonly fecha: string
  readonly columna: ColumnaHoja
  readonly valor: string
  readonly original: string
  /** Enter / F2 selects the text; a typed character keeps the caret at the end. */
  readonly seleccionar: boolean
}

const RAYA: Readonly<Record<string, string>> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
}

const CLASE_BORDE = 'border-r border-b border-border/70'
const CLASE_F1 = 'sticky left-0 w-[146px] min-w-[146px] max-w-[146px] bg-card'
const CLASE_F2 = 'sticky left-[146px] w-[250px] min-w-[250px] max-w-[250px] border-r-2 border-r-border bg-card pl-3.5'
const CLASE_RAYADO =
  'bg-[repeating-linear-gradient(135deg,var(--card)_0_7px,color-mix(in_oklab,var(--border)_45%,var(--card))_7px_8px)]'

export interface HojaProgramacionProps {
  readonly anio: number
  /** The rows to show (already filtered by month). */
  readonly filas: readonly FilaHoja[]
  /** The visible columns. */
  readonly columnas: readonly DefColumna[]
  readonly editable: boolean
  readonly densidad: Densidad
  readonly hoy: string
  /** clave of the "Próximo" Sunday. */
  readonly proximo: string | null
  /** What a cell shows now (its stored value or the change in flight). */
  readonly valor: (fila: FilaDomingo, columna: ColumnaHoja) => string
  /** A finished edit whose text differs from the one it started with. */
  readonly onGuardar: (fila: FilaDomingo, columna: ColumnaHoja, texto: string) => void
}

export function HojaProgramacion({ anio, filas, columnas, editable, densidad, hoy, proximo, valor, onGuardar }: HojaProgramacionProps): ReactElement {
  const tablaRef = useRef<HTMLTableElement>(null)
  const [foco, setFoco] = useState<Foco | null>(null)
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const edicionRef = useRef<Edicion | null>(null)
  const enfocarRef = useRef(false)

  const domingos = filas.filter((f): f is FilaDomingo => f.clase === 'domingo')
  const ordenColumnas: Columna[] = [FECHA, ...columnas.map((c) => c.id)]
  const porMes = new Map<number, number>()
  for (const f of domingos) porMes.set(f.mes, (porMes.get(f.mes) ?? 0) + 1)

  // The roving stop: the focused cell while it is visible, else the first data cell.
  const visible = foco && domingos.some((f) => f.fecha === foco.fecha) && ordenColumnas.includes(foco.columna)
  const parada: Foco | null = visible ? foco : domingos[0] && columnas[0] ? { fecha: domingos[0].fecha, columna: columnas[0].id } : null

  useEffect(() => {
    if (!enfocarRef.current || edicion || !foco) return
    enfocarRef.current = false
    tablaRef.current?.querySelector<HTMLElement>(`[data-fecha="${foco.fecha}"][data-columna="${foco.columna}"]`)?.focus()
  }, [foco, edicion])

  function mover(destino: Foco): void {
    enfocarRef.current = true
    setFoco(destino)
  }

  function paso(desde: Foco, deltaFila: number, deltaColumna: number, envolver: boolean): Foco {
    let f = domingos.findIndex((x) => x.fecha === desde.fecha)
    let c = ordenColumnas.indexOf(desde.columna) + deltaColumna
    if (envolver) {
      // Tab wraps over the data columns only.
      if (c >= ordenColumnas.length) {
        c = 1
        f += 1
      } else if (c < 1) {
        c = ordenColumnas.length - 1
        f -= 1
      }
    }
    f = Math.max(0, Math.min(domingos.length - 1, f + deltaFila))
    c = Math.max(0, Math.min(ordenColumnas.length - 1, c))
    return { fecha: domingos[f]?.fecha ?? desde.fecha, columna: ordenColumnas[c] ?? desde.columna }
  }

  function empezarEdicion(fila: FilaDomingo, columna: ColumnaHoja, semilla: string | null): void {
    if (!editable) return
    const original = valor(fila, columna)
    const nueva: Edicion = { fecha: fila.fecha, columna, valor: semilla ?? original, original, seleccionar: semilla === null }
    edicionRef.current = nueva
    setFoco({ fecha: fila.fecha, columna })
    setEdicion(nueva)
  }

  /** Ends the edit once (Enter, Tab, Escape and leaving the cell may all try). */
  function terminarEdicion(guardar: boolean): Edicion | null {
    const actual = edicionRef.current
    if (!actual) return null
    edicionRef.current = null
    setEdicion(null)
    const fila = domingos.find((f) => f.fecha === actual.fecha)
    if (guardar && fila && actual.valor !== actual.original) onGuardar(fila, actual.columna, actual.valor)
    return actual
  }

  function teclaEdicion(e: KeyboardEvent<HTMLInputElement>): void {
    const actual = edicionRef.current
    if (!actual) return
    const desde: Foco = { fecha: actual.fecha, columna: actual.columna }
    if (e.key === 'Enter') {
      e.preventDefault()
      terminarEdicion(true)
      mover(paso(desde, 1, 0, false))
    } else if (e.key === 'Tab') {
      e.preventDefault()
      terminarEdicion(true)
      mover(paso(desde, 0, e.shiftKey ? -1 : 1, true))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      terminarEdicion(false)
      mover(desde)
    }
  }

  function teclaCelda(e: KeyboardEvent<HTMLElement>, fila: FilaDomingo, columna: Columna): void {
    if (edicionRef.current) return
    const desde: Foco = { fecha: fila.fecha, columna }
    const flecha = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, [number, number]>)[e.key]
    if (flecha) {
      e.preventDefault()
      mover(paso(desde, flecha[0], flecha[1], false))
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      mover(paso(desde, 0, e.shiftKey ? -1 : 1, true))
      return
    }
    if (columna === FECHA || !editable) return
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      empezarEdicion(fila, columna, null)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (valor(fila, columna) !== '') onGuardar(fila, columna, '')
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      empezarEdicion(fila, columna, e.key)
    }
  }

  function alEnfocar(e: FocusEvent<HTMLTableElement>): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-fecha][data-columna]')
    if (!el || edicionRef.current) return
    const fecha = el.dataset.fecha!
    const columna = el.dataset.columna as Columna
    if (foco?.fecha !== fecha || foco?.columna !== columna) setFoco({ fecha, columna })
  }

  const alto = densidad === 'condensado' ? 'h-[30px]' : 'h-9'
  const totalColumnas = columnas.length + 2

  return (
    <table
      ref={tablaRef}
      role="grid"
      aria-label={`Programación ${anio}, un domingo por fila`}
      aria-readonly={editable ? undefined : true}
      aria-describedby="ayuda-hoja"
      data-densidad={densidad}
      onFocus={alEnfocar}
      className={cn('w-max min-w-full border-separate border-spacing-0', densidad === 'condensado' ? 'text-xs' : 'text-[13px]')}
    >
      <thead>
        <tr>
          <th scope="col" className={cn(CLASE_F1, CLASE_BORDE, 'top-0 z-[4] h-[34px] border-b-border px-2.5 text-left text-xs font-semibold text-muted-foreground')}>
            Fecha
          </th>
          <th scope="col" className={cn(CLASE_F2, CLASE_BORDE, 'top-0 z-[4] h-[34px] border-b-border text-left text-xs font-semibold text-muted-foreground')}>
            Serie · semana
          </th>
          {columnas.map((c) => (
            <th
              key={c.id}
              scope="col"
              style={{ minWidth: c.ancho }}
              className={cn(CLASE_BORDE, 'sticky top-0 z-[3] h-[34px] border-b-border bg-card px-2.5 text-left text-xs font-semibold text-muted-foreground')}
            >
              {c.etiqueta}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, i) => {
          const separador =
            i === 0 || filas[i - 1].mes !== fila.mes ? (
              <tr key={`mes-${fila.mes}`}>
                <th
                  role="rowheader"
                  colSpan={2}
                  className="sticky top-[34px] left-0 z-[3] h-[30px] border-b border-border/70 bg-muted px-2.5 text-left text-xs font-[650] uppercase tracking-[.08em] whitespace-nowrap text-foreground"
                >
                  {nombreMes(fila.mes)} {anio}
                  <small className="ml-2 text-xs font-normal normal-case tracking-normal text-muted-foreground">
                    <span className="font-mono tabular-nums">{porMes.get(fila.mes) ?? 0}</span> {(porMes.get(fila.mes) ?? 0) === 1 ? 'domingo' : 'domingos'}
                  </small>
                </th>
                <td aria-hidden="true" colSpan={totalColumnas - 2} className="sticky top-[34px] z-[2] border-b border-border/70 bg-muted" />
              </tr>
            ) : null
          const { dia, numero, mes } = partesFecha(fila.fecha)
          const pasado = fila.fecha < hoy
          const textoFecha = (
            <>
              <small className="mr-1 text-xs font-normal text-muted-foreground">{dia}</small> <span className="font-mono tabular-nums">{numero}</span> {mes}
            </>
          )

          if (fila.clase === 'especial') {
            return (
              <Fragment key={fila.clave}>
                {separador}
                <tr>
                  <th scope="row" className={cn(CLASE_F1, CLASE_BORDE, CLASE_RAYADO, alto, 'z-[2] px-2.5 text-left font-medium')}>
                    <Link href={hrefPlan(fila.plan.id)} tabIndex={-1} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]">
                      {textoFecha}
                    </Link>
                  </th>
                  <td className={cn(CLASE_F2, CLASE_BORDE, CLASE_RAYADO, alto, 'z-[2] truncate italic')}>
                    <span className="mr-2 not-italic">
                      <EtiquetaPlanner tono="info">{fila.plan.tipo === 'libre' ? 'Libre' : 'Especial'}</EtiquetaPlanner>
                    </span>
                    {nombreEspecial(fila.plan)}
                  </td>
                  <td colSpan={totalColumnas - 2} className={cn(CLASE_BORDE, CLASE_RAYADO, alto, 'px-2.5 text-muted-foreground')}>
                    <span className="font-mono tabular-nums">{horariosTexto(fila.plan.horarios)}</span>
                  </td>
                </tr>
              </Fragment>
            )
          }

          const plan = fila.plan
          const semana = plan ? semanaSerie(plan) : ''
          const esParada = (columna: Columna) => parada?.fecha === fila.fecha && parada.columna === columna
          return (
            <Fragment key={fila.fecha}>
              {separador}
              <tr className="group/fila">
                <th scope="row" className={cn(CLASE_F1, CLASE_BORDE, alto, 'z-[2] px-2.5 text-left font-medium', editable && 'pointer-coarse:h-12', pasado && 'text-muted-foreground')}>
                  {plan ? (
                    <Link
                      href={hrefPlan(plan.id)}
                      data-fecha={fila.fecha}
                      data-columna={FECHA}
                      tabIndex={esParada(FECHA) ? 0 : -1}
                      onKeyDown={(e) => teclaCelda(e, fila, FECHA)}
                      className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
                    >
                      {textoFecha}
                    </Link>
                  ) : (
                    <span
                      data-fecha={fila.fecha}
                      data-columna={FECHA}
                      tabIndex={esParada(FECHA) ? 0 : -1}
                      onKeyDown={(e) => teclaCelda(e, fila, FECHA)}
                      className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
                    >
                      {textoFecha}
                    </span>
                  )}
                  {fila.clave === proximo && <span className="ml-1 rounded-sm bg-brand-tint px-1.5 text-[11px] font-semibold text-brand-text">Próximo</span>}
                </th>
                <td className={cn(CLASE_F2, CLASE_BORDE, alto, 'relative z-[2] truncate')}>
                  {plan?.serie && <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', RAYA[plan.serie.color] ?? 'bg-chart-1')} />}
                  {plan?.serie ? (
                    <>
                      <b className="font-semibold">{plan.serie.nombre}</b>
                      {semana && <span className="ml-1.5 font-mono tabular-nums text-muted-foreground">{semana}</span>}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Sin serie</span>
                  )}
                </td>
                {columnas.map((c) => {
                  const texto = valor(fila, c.id)
                  const editando = edicion?.fecha === fila.fecha && edicion.columna === c.id
                  return (
                    <td
                      key={c.id}
                      role="gridcell"
                      data-fecha={fila.fecha}
                      data-columna={c.id}
                      tabIndex={editando ? -1 : esParada(c.id) ? 0 : -1}
                      title={texto && !editando ? texto : undefined}
                      style={{ maxWidth: c.ancho, minWidth: c.ancho }}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget) teclaCelda(e, fila, c.id)
                      }}
                      onClick={() => {
                        if (!editando) mover({ fecha: fila.fecha, columna: c.id })
                      }}
                      onDoubleClick={() => empezarEdicion(fila, c.id, null)}
                      className={cn(
                        CLASE_BORDE,
                        alto,
                        'truncate px-2.5 outline-none',
                        editable && 'cursor-cell pointer-coarse:h-12 hover:bg-accent',
                        // The selected cell always shows (a click selects it too), as `td:focus` of the artboard.
                        'focus:outline-2 focus:-outline-offset-2 focus:outline-[var(--brand-primary)]',
                        editando && 'p-0 outline-2 -outline-offset-2 outline-[var(--brand-primary)]',
                        !texto && 'text-muted-foreground',
                        !texto && editable && !editando && 'hover:after:text-xs hover:after:content-["Agregar"]',
                      )}
                    >
                      {editando ? (
                        <input
                          aria-label={`${c.etiqueta}, ${fechaCorta(fila.fecha)}`}
                          value={edicion.valor}
                          ref={(el) => {
                            if (!el || el === document.activeElement) return
                            el.focus()
                            if (edicion.seleccionar) el.select()
                            else el.setSelectionRange(el.value.length, el.value.length)
                          }}
                          onChange={(e) => {
                            if (!edicionRef.current) return
                            const siguiente = { ...edicionRef.current, valor: e.target.value }
                            edicionRef.current = siguiente
                            setEdicion(siguiente)
                          }}
                          onKeyDown={teclaEdicion}
                          onBlur={() => terminarEdicion(true)}
                          className="h-full w-full border-0 bg-background px-[9px] text-[length:inherit] shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--brand-primary)_20%,transparent)] outline-none"
                        />
                      ) : (
                        texto
                      )}
                    </td>
                  )
                })}
              </tr>
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
