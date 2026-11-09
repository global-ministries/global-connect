'use client'

/**
 * DPS › Programación — the sheet (`table[role=grid]` of
 * prototipos/planificacion-dps/04-programacion-anual-hoja.html; planned
 * `HojaCalculo` of docs/design-system/components.md#planning-style-components,
 * local here until it moves to components/ui). One row per Sunday of the
 * year, the special days as hatched full rows with a tag (never edited
 * here; their date opens their plan; a day of a multi-day event reads
 * «Título · Día N de M»; whoever plans gets a row menu with «Mover fecha…»
 * and «Eliminar evento», S9), and a month separator row
 * ("NOVIEMBRE 2026 · 5 domingos") whose label sticks to the top and to the
 * left. Frozen Fecha (146px, the link to the plan, "Próximo") and Serie
 * (250px, the 4px `chart-*` stripe and "n/m") columns ending in a 2px
 * border; sticky 34px header. Every column has one fixed width in a
 * `<colgroup>` (`table-layout: fixed`), so the header, the month separators
 * and every row share it and each cell sits exactly under its header, also
 * while scrolling (S9.6). No text is cut (S9.5): cells wrap like Excel's
 * «Ajustar texto» and the row grows downward; the density only sets the
 * minimum row height (a table cell's `height` is a minimum: 36px, 30px
 * condensed, 48px on touch). 13px cells; past dates muted; empty cells read
 * "Agregar" on hover when editable.
 *
 * Keyboard (docs/design-system/patterns.md#spreadsheet-keyboard), roving
 * tabindex over the Sunday rows (the Fecha link is the first stop of a row):
 * arrows move; Tab / Shift+Tab move and wrap; Enter, F2 or a double click
 * edits with the text selected; any character replaces the cell and keeps
 * typing; Delete / Backspace clears it. While editing: Enter saves and moves
 * down, Tab saves and moves right (left with Shift), Escape cancels, leaving
 * the cell saves. The editor is a text area that grows with its text, so it
 * shows all of it (the cell grows with it; the brand outline marks it).
 * Read-only (aria-readonly): the same moves, no edits.
 * Productor, Host, Comunicador and Cantantes (T11c, T14b; S11, S12.3,
 * S12.4) hold several people: they edit in celda-persona.tsx, chips plus a
 * combobox that suggests only the column's list. Enter, F2 or a typed
 * character open it with the people already there (a typed character
 * starts a new name, it does not replace them); Enter or Tab add the person
 * highlighted, or the typed name «Sin cuenta», and save the whole cell;
 * Delete clears it. A linked person reads with a person mark and «(con
 * ficha)» for screen readers, a written name with a «Sin cuenta» tag, all
 * comma separated and wrapping like any cell.
 * The parent saves and decides what changed.
 *
 * Service notices (T15b; S13.2, S13.3; design/dps-avisos/03), for whoever
 * plans once the states are read (`avisos`, by plan): a person of those
 * cells reads with a 16px state mark (✓ confirmó, clock pendiente, ✕ no
 * puede, dot sin avisar) instead of the person mark, the state for screen
 * readers and a tooltip with the motivo; a written name keeps its neutral
 * «Sin cuenta» tag, without a mark. An «Avisos» column after Serie says per
 * row «N sin avisar», «N no puede», «N pendientes», «Todos confirmaron» or
 * «Ya pasó»; it is read-only and part of the arrow keys' path.
 */
import { Fragment, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { CalendarClock, Check, Clock, MoreHorizontal, Trash2, UserRound, X } from 'lucide-react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CLASE_ACCION_FILA } from '@/components/grupos-vida/planner/estilo-planner'
import { EtiquetaPlanner } from '@/components/grupos-vida/planner/etiqueta'
import type { PersonaEstadoAviso, PlanEstadoAvisos } from '@/lib/platform/dps/avisos'
import type { ListasDps } from '@/lib/platform/dps/listas'
import { LISTA_DE_COLUMNA, LISTAS_DPS } from '@/lib/platform/dps/listas'
import type { PersonaBuscada } from '@/lib/platform/dps/personas'
import { horariosTexto } from '@/lib/platform/dps/planilla'
import {
  esColumnaPersona,
  fechaCorta,
  MAX_PERSONAS,
  nombreEspecial,
  nombreMes,
  partesFecha,
  semanaSerie,
  type ColumnaHoja,
  type ColumnaPersona,
  type DefColumna,
  type EntradaPersona,
  type FilaHoja,
  type PlanHoja,
} from '@/lib/platform/dps/programacion'
import { cn } from '@/lib/utils'

import { ESTILO_ESTADO, MarcaEstadoAviso, textoEstadoPersona } from './avisos-estado'
import { CeldaPersona } from './celda-persona'
import { hrefPlan } from './encabezado-plan'

export type Densidad = 'normal' | 'condensado'
export type FilaDomingo = Extract<FilaHoja, { clase: 'domingo' }>

/** The Fecha link is the first stop of a row. */
const FECHA = 'fecha'
/** The read-only «Avisos» column of the notices (T15b). */
const AVISOS = 'avisos'
const ANCHO_AVISOS = 168
type Columna = ColumnaHoja | typeof FECHA | typeof AVISOS

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
  /** A cell of people: who is in it now (the typed text is the next one). */
  readonly entradas: readonly EntradaPersona[]
}

const RAYA: Readonly<Record<string, string>> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
}

/** The frozen columns: their widths are the `<col>`s and the `left` of Serie is Fecha's width. */
const ANCHO_F1 = 146
const ANCHO_F2 = 250
const CLASE_BORDE = 'border-r border-b border-border/70'
// Sticky, never relative (tailwind-merge keeps only the last `position`): a
// relative Serie cell kept its `left` and slid over Productor (L46). Sticky
// is already the containing block of the series stripe.
const CLASE_F1 = 'sticky left-0 w-[146px] min-w-[146px] max-w-[146px] overflow-hidden bg-card'
const CLASE_F2 = 'sticky left-[146px] w-[250px] min-w-[250px] max-w-[250px] overflow-hidden border-r-2 border-r-border bg-card pl-3.5'
/** Body text wraps and the row grows (S9.5). */
const CLASE_AJUSTE = 'whitespace-normal break-words align-top'
const CLASE_MENU = 'min-h-9 gap-2.5 text-sm pointer-coarse:min-h-11'
/** The hatch of the special days (`.sp`), shared with the matrix (matriz-domingos.tsx); opaque, so sticky cells may use it. */
export const CLASE_RAYADO =
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
  /** The people of a Productor / Host / Comunicador / Cantantes cell now (S12.4). */
  readonly personas: (fila: FilaDomingo, columna: ColumnaPersona) => readonly EntradaPersona[]
  /** A finished edit of a cell of people whose people changed. */
  readonly onGuardarPersonas: (fila: FilaDomingo, columna: ColumnaPersona, entradas: readonly EntradaPersona[]) => void
  /** The lists by position: each cell of people suggests its own (S12.3). */
  readonly listas: ListasDps
  /** «Mover fecha…» of a special row (editable only). */
  readonly onMover?: (plan: PlanHoja) => void
  /** «Eliminar evento» of a special row (editable only). */
  readonly onEliminar?: (plan: PlanHoja) => void
  /** The states of the notices by plan id (whoever plans, once read); null hides the marks and the «Avisos» column. */
  readonly avisos?: ReadonlyMap<string, PlanEstadoAvisos> | null
}

const CLASE_INDICADOR = 'inline-flex h-6 items-center gap-1.5 rounded-full text-xs font-medium whitespace-nowrap tabular-nums'

/** The «Avisos» cell of a row (`.ind` of design/dps-avisos/03). */
function IndicadorAvisos({ estado, pasado }: { readonly estado: PlanEstadoAvisos | null; readonly pasado: boolean }): ReactElement | null {
  if (pasado) return <span className={cn(CLASE_INDICADOR, 'text-muted-foreground')}>Ya pasó</span>
  if (!estado) return null
  const r = estado.resumen
  const sinAvisar = r.sinAvisar + r.quitado
  const partes: ReactElement[] = []
  if (sinAvisar > 0) {
    partes.push(
      <span
        key="sin"
        title={r.quitado > 0 ? `Incluye ${r.quitado} «Ya no estás programado»` : 'Listos para enviar'}
        className={cn(CLASE_INDICADOR, 'border border-dashed border-muted-foreground px-2 text-foreground')}
      >
        <MarcaEstadoAviso estado="sin_avisar" className="size-3 border-0" />
        {`${sinAvisar} sin avisar`}
      </span>,
    )
  }
  if (r.noPuede > 0) {
    partes.push(
      <span key="no" className={cn(CLASE_INDICADOR, 'px-0.5 text-danger-text')}>
        <X aria-hidden="true" className="size-3 stroke-[2.4]" />
        {`${r.noPuede} no puede`}
      </span>,
    )
  }
  if (partes.length === 0 && r.pendiente > 0) {
    partes.push(
      <span key="pen" className={cn(CLASE_INDICADOR, 'px-0.5 text-muted-foreground')}>
        <Clock aria-hidden="true" className="size-3 stroke-[2.4]" />
        {`${r.pendiente} ${r.pendiente === 1 ? 'pendiente' : 'pendientes'}`}
      </span>,
    )
  }
  if (partes.length === 0 && r.confirmo > 0) {
    partes.push(
      <span key="ok" className={cn(CLASE_INDICADOR, 'px-0.5 text-success-text')}>
        <Check aria-hidden="true" className="size-3 stroke-[2.4]" />
        Todos confirmaron
      </span>,
    )
  }
  return partes.length > 0 ? <span className="inline-flex flex-wrap gap-x-1.5">{partes}</span> : null
}

/** A person of a cell of people with their state (S13.2): mark, name, the state for screen readers, tooltip. */
function PersonaConEstado({ nombre, estado }: { readonly nombre: string; readonly estado: PersonaEstadoAviso }): ReactElement {
  return (
    <span title={textoEstadoPersona(nombre, estado)}>
      <MarcaEstadoAviso estado={estado.estado} className="mr-1" />
      {nombre}
      <span className="sr-only">, {ESTILO_ESTADO[estado.estado].minuscula}</span>
    </span>
  )
}

const clavePersonas = (entradas: readonly EntradaPersona[]): string => entradas.map((e) => e.personaId ?? `texto:${e.nombre}`).join('|')

/** The text area grows with its text: the whole value shows while editing. */
function ajustarAlto(el: HTMLTextAreaElement): void {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

export function HojaProgramacion({
  anio,
  filas,
  columnas,
  editable,
  densidad,
  hoy,
  proximo,
  valor,
  onGuardar,
  personas,
  onGuardarPersonas,
  listas,
  onMover,
  onEliminar,
  avisos = null,
}: HojaProgramacionProps): ReactElement {
  const tablaRef = useRef<HTMLTableElement>(null)
  const [foco, setFoco] = useState<Foco | null>(null)
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const edicionRef = useRef<Edicion | null>(null)
  const enfocarRef = useRef(false)

  const domingos = filas.filter((f): f is FilaDomingo => f.clase === 'domingo')
  const columnaAvisos: Columna[] = avisos ? [AVISOS] : []
  const ordenColumnas: Columna[] = [FECHA, ...columnaAvisos, ...columnas.map((c) => c.id)]
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
    // A cell of people opens with them as chips and the text for the next one.
    const entradas = esColumnaPersona(columna) ? personas(fila, columna) : []
    const original = esColumnaPersona(columna) ? clavePersonas(entradas) : valor(fila, columna)
    const texto = semilla ?? (esColumnaPersona(columna) ? '' : original)
    const nueva: Edicion = { fecha: fila.fecha, columna, valor: texto, original, seleccionar: semilla === null, entradas }
    edicionRef.current = nueva
    setFoco({ fecha: fila.fecha, columna })
    setEdicion(nueva)
  }

  function cambiarEdicion(cambio: Partial<Pick<Edicion, 'valor' | 'entradas'>>): void {
    if (!edicionRef.current) return
    const siguiente = { ...edicionRef.current, ...cambio }
    edicionRef.current = siguiente
    setEdicion(siguiente)
  }

  /**
   * Ends the edit once (Enter, Tab, Escape and leaving the cell may all
   * try). A cell of people adds the person highlighted, or the typed name
   * as written, and saves the whole cell when it changed.
   */
  function terminarEdicion(guardar: boolean, persona: PersonaBuscada | null = null): Edicion | null {
    const actual = edicionRef.current
    if (!actual) return null
    edicionRef.current = null
    setEdicion(null)
    const fila = domingos.find((f) => f.fecha === actual.fecha)
    if (!guardar || !fila) return actual
    if (esColumnaPersona(actual.columna)) {
      const escrito = actual.valor.trim()
      const nueva: EntradaPersona | null = persona ? { personaId: persona.personaId, nombre: persona.nombre } : escrito ? { personaId: null, nombre: escrito } : null
      const entradas = nueva ? [...actual.entradas, nueva] : actual.entradas
      if (clavePersonas(entradas) !== actual.original) onGuardarPersonas(fila, actual.columna, entradas)
    } else if (actual.valor !== actual.original) {
      onGuardar(fila, actual.columna, actual.valor)
    }
    return actual
  }

  /** Enter, Tab and Escape while editing; a cell of people hands the person highlighted in its list (null: its text). */
  function teclaEdicion(e: KeyboardEvent<HTMLElement>, persona: PersonaBuscada | null = null): void {
    const actual = edicionRef.current
    if (!actual) return
    const desde: Foco = { fecha: actual.fecha, columna: actual.columna }
    const terminar = () => terminarEdicion(true, persona)
    if (e.key === 'Enter') {
      e.preventDefault()
      terminar()
      mover(paso(desde, 1, 0, false))
    } else if (e.key === 'Tab') {
      e.preventDefault()
      terminar()
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
    if (columna === FECHA || columna === AVISOS || !editable) return
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      empezarEdicion(fila, columna, null)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (esColumnaPersona(columna)) {
        if (personas(fila, columna).length > 0) onGuardarPersonas(fila, columna, [])
      } else if (valor(fila, columna) !== '') onGuardar(fila, columna, '')
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

  // A table cell's height is its minimum: the row grows with wrapped text.
  const alto = densidad === 'condensado' ? 'h-[30px] py-[5px] leading-5' : 'h-9 py-2 leading-5'
  const totalColumnas = columnas.length + 2 + (avisos ? 1 : 0)
  const ancho = ANCHO_F1 + ANCHO_F2 + (avisos ? ANCHO_AVISOS : 0) + columnas.reduce((n, c) => n + c.ancho, 0)

  return (
    <table
      ref={tablaRef}
      role="grid"
      aria-label={`Programación ${anio}, un domingo por fila`}
      aria-readonly={editable ? undefined : true}
      aria-describedby="ayuda-hoja"
      data-densidad={densidad}
      onFocus={alEnfocar}
      style={{ width: ancho }}
      className={cn('table-fixed border-separate border-spacing-0', densidad === 'condensado' ? 'text-xs' : 'text-[13px]')}
    >
      <colgroup>
        <col style={{ width: ANCHO_F1 }} />
        <col style={{ width: ANCHO_F2 }} />
        {avisos && <col style={{ width: ANCHO_AVISOS }} />}
        {columnas.map((c) => (
          <col key={c.id} style={{ width: c.ancho }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={cn(CLASE_BORDE, CLASE_F1, 'top-0 z-[4] h-[34px] border-b-border px-2.5 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground')}>
            Fecha
          </th>
          <th scope="col" className={cn(CLASE_BORDE, CLASE_F2, 'top-0 z-[4] h-[34px] border-b-border text-left text-xs font-semibold whitespace-nowrap text-muted-foreground')}>
            Serie · semana
          </th>
          {avisos && (
            <th scope="col" className={cn(CLASE_BORDE, 'sticky top-0 z-[3] h-[34px] border-b-border bg-card px-2.5 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground')}>
              Avisos
            </th>
          )}
          {columnas.map((c) => (
            <th
              key={c.id}
              scope="col"
              className={cn(CLASE_BORDE, 'sticky top-0 z-[3] h-[34px] border-b-border bg-card px-2.5 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground')}
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
            const nombre = nombreEspecial(fila.plan)
            const plan = fila.plan
            return (
              <Fragment key={fila.clave}>
                {separador}
                <tr className="group/fila">
                  <th scope="row" className={cn(CLASE_BORDE, CLASE_F1, CLASE_RAYADO, alto, CLASE_AJUSTE, 'z-[2] px-2.5 text-left font-medium')}>
                    <Link href={hrefPlan(plan.id)} tabIndex={-1} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]">
                      {textoFecha}
                    </Link>
                  </th>
                  <td className={cn(CLASE_BORDE, CLASE_F2, CLASE_RAYADO, alto, CLASE_AJUSTE, 'z-[2] pr-1.5')}>
                    {/* Tag and name on one line: the tag is as tall as a text line. */}
                    <div className="flex items-start gap-2">
                      <span className="shrink-0">
                        <EtiquetaPlanner tono="info">{plan.tipo === 'libre' ? 'Libre' : 'Especial'}</EtiquetaPlanner>
                      </span>
                      <span className="min-w-0 flex-1 italic">{nombre}</span>
                      {editable && onMover && onEliminar && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" aria-label={`Acciones de ${nombre}`} className={cn(CLASE_ACCION_FILA, '-my-1 data-[state=open]:opacity-100')}>
                              <MoreHorizontal aria-hidden="true" className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" aria-label={`Acciones de ${nombre}`} className="min-w-52 bg-card shadow-sheet">
                            <DropdownMenuItem className={CLASE_MENU} onSelect={() => onMover(plan)}>
                              <CalendarClock aria-hidden="true" />
                              Mover fecha…
                            </DropdownMenuItem>
                            <DropdownMenuItem className={CLASE_MENU} onSelect={() => onEliminar(plan)}>
                              <Trash2 aria-hidden="true" />
                              Eliminar evento
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </td>
                  <td colSpan={totalColumnas - 2} className={cn(CLASE_BORDE, CLASE_RAYADO, alto, CLASE_AJUSTE, 'px-2.5 text-muted-foreground')}>
                    <span className="font-mono tabular-nums">{horariosTexto(fila.plan.horarios)}</span>
                  </td>
                </tr>
              </Fragment>
            )
          }

          const plan = fila.plan
          const semana = plan ? semanaSerie(plan) : ''
          const estadoPlan = plan ? (avisos?.get(plan.id) ?? null) : null
          const estadoDe = (personaId: string | null) => (personaId ? (estadoPlan?.personas.find((p) => p.personaId === personaId) ?? null) : null)
          const esParada = (columna: Columna) => parada?.fecha === fila.fecha && parada.columna === columna
          return (
            <Fragment key={fila.fecha}>
              {separador}
              <tr className="group/fila">
                <th scope="row" className={cn(CLASE_BORDE, CLASE_F1, alto, CLASE_AJUSTE, 'z-[2] px-2.5 text-left font-medium', editable && 'pointer-coarse:h-12', pasado && 'text-muted-foreground')}>
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
                <td className={cn(CLASE_BORDE, CLASE_F2, alto, CLASE_AJUSTE, 'z-[2]')}>
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
                {avisos && (
                  <td
                    role="gridcell"
                    aria-readonly="true"
                    data-fecha={fila.fecha}
                    data-columna={AVISOS}
                    tabIndex={esParada(AVISOS) ? 0 : -1}
                    onKeyDown={(e) => teclaCelda(e, fila, AVISOS)}
                    onClick={() => mover({ fecha: fila.fecha, columna: AVISOS })}
                    className={cn(CLASE_BORDE, alto, CLASE_AJUSTE, 'px-2.5 outline-none focus:outline-2 focus:-outline-offset-2 focus:outline-[var(--brand-primary)]')}
                  >
                    {plan && <IndicadorAvisos estado={avisos.get(plan.id) ?? null} pasado={pasado} />}
                  </td>
                )}
                {columnas.map((c) => {
                  const texto = valor(fila, c.id)
                  const editando = edicion?.fecha === fila.fecha && edicion.columna === c.id
                  const persona = esColumnaPersona(c.id) ? c.id : null
                  const lista = persona ? LISTAS_DPS.find((l) => l.id === LISTA_DE_COLUMNA[persona]) : null
                  return (
                    <td
                      key={c.id}
                      role="gridcell"
                      data-fecha={fila.fecha}
                      data-columna={c.id}
                      tabIndex={editando ? -1 : esParada(c.id) ? 0 : -1}
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
                        CLASE_AJUSTE,
                        'px-2.5 outline-none',
                        editable && 'cursor-cell pointer-coarse:h-12 hover:bg-accent',
                        // The selected cell always shows (a click selects it too), as `td:focus` of the artboard.
                        'focus:outline-2 focus:-outline-offset-2 focus:outline-[var(--brand-primary)]',
                        editando && 'p-0 outline-2 -outline-offset-2 outline-[var(--brand-primary)]',
                        !texto && 'text-muted-foreground',
                        !texto && editable && !editando && 'hover:after:text-xs hover:after:content-["Agregar"]',
                      )}
                    >
                      {editando && persona ? (
                        <CeldaPersona
                          etiqueta={`${c.etiqueta}, ${fechaCorta(fila.fecha)}`}
                          columna={c.etiqueta}
                          nombreLista={lista?.etiqueta ?? c.etiqueta}
                          entradas={edicion.entradas}
                          valor={edicion.valor}
                          maximo={MAX_PERSONAS[persona]}
                          sugeridas={listas[LISTA_DE_COLUMNA[persona]].personas}
                          condensado={densidad === 'condensado'}
                          onCambio={(v) => cambiarEdicion({ valor: v })}
                          onAgregar={(p) => {
                            const actual = edicionRef.current
                            if (actual) cambiarEdicion({ entradas: [...actual.entradas, { personaId: p.personaId, nombre: p.nombre }], valor: '' })
                          }}
                          onQuitar={(i) => {
                            const actual = edicionRef.current
                            if (actual) cambiarEdicion({ entradas: actual.entradas.filter((_, j) => j !== i) })
                          }}
                          onTecla={teclaEdicion}
                          onSalir={() => terminarEdicion(true)}
                        />
                      ) : editando ? (
                        <textarea
                          aria-label={`${c.etiqueta}, ${fechaCorta(fila.fecha)}`}
                          value={edicion.valor}
                          rows={1}
                          ref={(el) => {
                            if (!el) return
                            ajustarAlto(el)
                            if (el === document.activeElement) return
                            el.focus()
                            if (edicion.seleccionar) el.select()
                            else el.setSelectionRange(el.value.length, el.value.length)
                          }}
                          onChange={(e) => {
                            ajustarAlto(e.target)
                            cambiarEdicion({ valor: e.target.value })
                          }}
                          onKeyDown={teclaEdicion}
                          onBlur={() => terminarEdicion(true)}
                          className={cn(
                            'block min-h-full w-full resize-none overflow-hidden border-0 bg-background px-[9px] text-[length:inherit] shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--brand-primary)_20%,transparent)] outline-none',
                            densidad === 'condensado' ? 'py-[5px] leading-5' : 'py-2 leading-5',
                          )}
                        />
                      ) : persona ? (
                        personas(fila, persona).map((e, i) => (
                          <Fragment key={`${e.personaId ?? e.nombre}-${i}`}>
                            {i > 0 && ', '}
                            {estadoDe(e.personaId) ? (
                              <PersonaConEstado nombre={e.nombre} estado={estadoDe(e.personaId)!} />
                            ) : e.personaId ? (
                              <>
                                <UserRound aria-hidden="true" className="mr-1 inline size-3.5 -translate-y-px text-brand-text" />
                                {e.nombre}
                                <span className="sr-only"> (con ficha)</span>
                              </>
                            ) : (
                              <>
                                {e.nombre}{' '}
                                <span className="inline-block align-top">
                                  <EtiquetaPlanner tono="neutro">Sin cuenta</EtiquetaPlanner>
                                </span>
                              </>
                            )}
                          </Fragment>
                        ))
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
