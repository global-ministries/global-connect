'use client'

/**
 * DPS › Plan · Orden del servicio (T13 of odd/tasks/dps-asistencia-pco.md;
 * S10; the `table.ord` of prototipos/planificacion-dps/02-plan-domingo-orden.html,
 * docs/design-system/patterns.md › Inline edit and autosave). The sections
 * of the PDF of the plan (L9: Pre servicio, Ensayo general, Ambiente,
 * Opener, Bienvenida, Banda, Dar, Versintro, Mensaje, Recap, Post
 * servicio) are header rows with their total; under them, 36px item rows
 * (48px on touch) with one time column per horario of the plan, the
 * duración (m:ss, mono), the título with its notas below and the
 * responsable. The times recalculate at once (lib/platform/dps/orden.ts):
 * pre servicio from the llegada and only in the first column, the service
 * at each start, post servicio after each one; overlaps are warned above.
 *
 * Whoever plans edits in place (planned `CampoEnLinea`): Enter or leaving
 * the field saves, Escape restores, an invalid duración keeps the focus with
 * `aria-invalid` and the format in the live region; a header chooses when
 * it happens (antes / en / después del servicio). Rows move by dragging the
 * handle (planned `AsaArrastre`) or with ↑ ↓ on it, and are removed with
 * «Quitar …»; «+ Elemento» and «+ Encabezado» insert before Post servicio
 * and focus the new título. Each change applies at once and is saved by a
 * server action (lib/actions/dps-orden.actions.ts); a failure says why and
 * reloads the order. An empty order starts from the template of the PDF.
 * Everyone else reads the same order without controls. On a phone the
 * order is a read-only list (editing needs the wide table).
 */
import { useEffect, useRef, useState, type Dispatch, type DragEvent, type KeyboardEvent, type ReactElement, type SetStateAction } from 'react'
import { GripVertical, ListOrdered, Plus, X } from 'lucide-react'

import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { CLASE_ACCION_FILA } from '@/components/grupos-vida/planner/estilo-planner'
import {
  agregarFilaOrdenDps,
  cargarOrdenDps,
  guardarFilaOrdenDps,
  moverFilaOrdenDps,
  plantillaOrdenDps,
  quitarFilaOrdenDps,
} from '@/lib/actions/dps-orden.actions'
import {
  ETIQUETA_FASE,
  FASES,
  MENSAJE_DURACION,
  encabezadoDe,
  formatearDuracion,
  insertarFila,
  moverFila,
  parsearDuracion,
  posicionNueva,
  quitarFila,
  reemplazarFila,
  textoPosicion,
  type CalculoOrden,
  type FaseOrden,
  type FilaCalculada,
  type FilaOrden,
  type OrdenPlan,
  type TipoFilaOrden,
} from '@/lib/platform/dps/orden'
import { fechaHablada, type PlanCabecera } from '@/lib/platform/dps/plan'
import { cn } from '@/lib/utils'

/** How the island reports a change: the toolbar's EstadoGuardado and the live sentence. */
export interface SeguimientoGuardado {
  readonly empezar: (frase: string) => void
  readonly terminar: (ok: boolean, mensaje?: string) => void
  readonly anunciar: (frase: string) => void
}

export interface OrdenServicioProps {
  readonly plan: PlanCabecera
  /** dps_orden_leer; null when it could not be read (`error`). */
  readonly orden: OrdenPlan | null
  readonly error: string | null
  readonly calculo: CalculoOrden
  readonly onOrden: Dispatch<SetStateAction<OrdenPlan | null>>
  readonly seguimiento: SeguimientoGuardado
}

/** The inline field (`.ed`): reads as text; the border shows on hover; brand border and ring on focus; danger when invalid. */
const CLASE_CAMPO =
  'block w-full min-h-6 -ml-[7px] rounded-md border border-transparent bg-transparent px-1.5 text-[13px] text-foreground transition-colors placeholder:text-muted-foreground hover:border-border focus:border-brand focus:bg-background focus:ring-2 focus:ring-brand/20 focus:outline-none aria-[invalid=true]:border-danger'

const CLASE_TIEMPO = 'w-[72px] px-2.5 font-mono tabular-nums tracking-[-0.02em]'

const NUEVO: Record<TipoFilaOrden, { titulo: string; duracionSeg: number }> = {
  item: { titulo: 'Nuevo elemento', duracionSeg: 120 },
  encabezado: { titulo: 'Nuevo encabezado', duracionSeg: 0 },
}

interface CampoEnLineaProps {
  readonly valor: string
  readonly etiqueta: string
  /** Normalizes the typed text; a string is the error to announce (the value stays, marked invalid). */
  readonly normalizar?: (texto: string) => { valor: string } | { error: string }
  readonly onGuardar: (valor: string) => void
  readonly onInvalido?: (mensaje: string) => void
  readonly className?: string
  readonly placeholder?: string
  readonly inputMode?: 'numeric' | 'text'
  readonly datos?: Record<string, string>
}

function CampoEnLinea({ valor, etiqueta, normalizar, onGuardar, onInvalido, className, placeholder, inputMode, datos }: CampoEnLineaProps): ReactElement {
  const [borrador, setBorrador] = useState(valor)
  const [invalido, setInvalido] = useState(false)
  const [guardado, setGuardado] = useState(valor)

  // A save, a rollback or a reload shows the stored value (adjusted while rendering, not in an effect).
  if (valor !== guardado) {
    setGuardado(valor)
    setBorrador(valor)
    setInvalido(false)
  }

  function confirmar(): void {
    const r = normalizar ? normalizar(borrador) : { valor: borrador.trim() }
    if ('error' in r) {
      setInvalido(true)
      onInvalido?.(r.error)
      return
    }
    setInvalido(false)
    if (r.valor === valor) {
      setBorrador(valor)
      return
    }
    onGuardar(r.valor)
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmar()
    } else if (e.key === 'Escape') {
      setBorrador(valor)
      setInvalido(false)
    }
  }

  return (
    <input
      type="text"
      value={borrador}
      aria-label={etiqueta}
      aria-invalid={invalido ? true : undefined}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => setBorrador(e.target.value)}
      onKeyDown={alTeclear}
      onBlur={() => borrador !== valor && confirmar()}
      className={cn(CLASE_CAMPO, className)}
      {...datos}
    />
  )
}

const normalizarDuracion = (texto: string): { valor: string } | { error: string } => {
  const segundos = parsearDuracion(texto)
  return segundos === null ? { error: MENSAJE_DURACION } : { valor: formatearDuracion(segundos) }
}
const normalizarTitulo = (texto: string): { valor: string } | { error: string } =>
  texto.trim() === '' ? { error: 'Escribe un título.' } : texto.trim().length > 120 ? { error: 'El título va hasta 120 caracteres.' } : { valor: texto.trim() }

export function OrdenServicio({ plan, orden, error, calculo, onOrden, seguimiento }: OrdenServicioProps): ReactElement {
  const [enviando, setEnviando] = useState(false)
  const arrastreRef = useRef<string | null>(null)
  const focoRef = useRef<{ id: string; campo: 'asa' | 'titulo' } | null>(null)
  const tablaRef = useRef<HTMLTableElement>(null)

  const filas = orden?.filas ?? []
  const editable = orden?.puedeEditar === true
  const planId = plan.id

  // After a move or an add, the focus goes to the same row's handle or to the new título.
  useEffect(() => {
    const foco = focoRef.current
    if (!foco || !tablaRef.current) return
    const el = tablaRef.current.querySelector<HTMLElement>(`[data-${foco.campo}="${foco.id}"]`)
    if (!el) return
    focoRef.current = null
    el.focus()
    if (el instanceof HTMLInputElement && foco.campo === 'titulo') el.select()
  }, [orden])

  if (!orden) {
    return <EstadoVacioSistema icono={ListOrdered} titulo="No se pudo cargar el orden" subtitulo={error ?? 'Actualiza la página.'} />
  }

  const cambiarFilas = (f: (filas: readonly FilaOrden[]) => readonly FilaOrden[]): void => onOrden((o) => (o ? { ...o, filas: f(o.filas) } : o))

  async function recargar(): Promise<void> {
    const r = await cargarOrdenDps({ planId })
    if (r.ok) onOrden(r.data)
  }

  async function fallar(mensaje: string, anteriores: readonly FilaOrden[]): Promise<void> {
    cambiarFilas(() => anteriores)
    seguimiento.terminar(false, mensaje)
    await recargar()
  }

  async function guardar(fila: FilaOrden, cambios: Partial<FilaOrden>, frase: string): Promise<void> {
    const anteriores = filas
    const nueva = { ...fila, ...cambios }
    cambiarFilas((fs) => reemplazarFila(fs, nueva))
    seguimiento.empezar(frase)
    const r = await guardarFilaOrdenDps({
      itemId: nueva.id,
      titulo: nueva.titulo,
      duracionSeg: nueva.duracionSeg,
      notas: nueva.notas,
      responsable: nueva.responsable,
      fase: nueva.tipo === 'encabezado' ? nueva.fase : null,
    })
    if (!r.ok) return fallar(r.message, anteriores)
    seguimiento.terminar(true)
  }

  async function mover(id: string, destino: number): Promise<void> {
    const desde = filas.findIndex((f) => f.id === id)
    if (desde === -1) return
    if (destino < 0 || destino >= filas.length) {
      seguimiento.anunciar(destino < 0 ? 'Ya está primero en el orden.' : 'Ya está último en el orden.')
      return
    }
    if (destino === desde) return
    const anteriores = filas
    const movidas = moverFila(filas, id, destino)
    focoRef.current = { id, campo: 'asa' }
    cambiarFilas(() => movidas)
    seguimiento.empezar(textoPosicion(movidas, id))
    const r = await moverFilaOrdenDps({ itemId: id, posicion: destino })
    if (!r.ok) return fallar(r.message, anteriores)
    seguimiento.terminar(true)
  }

  async function agregar(tipo: TipoFilaOrden): Promise<void> {
    const posicion = posicionNueva(filas)
    const post = filas[posicion]
    const arriba = encabezadoDe(filas, posicion - 1)
    const frase =
      tipo === 'item'
        ? arriba
          ? `Agregaste un elemento al final de ${arriba.titulo}.`
          : 'Agregaste un elemento al final del orden.'
        : post
          ? `Agregaste un encabezado antes de ${post.titulo}.`
          : 'Agregaste un encabezado al final del orden.'
    setEnviando(true)
    seguimiento.empezar(frase)
    const r = await agregarFilaOrdenDps({ planId, tipo, ...NUEVO[tipo], posicion, fase: tipo === 'encabezado' ? 'servicio' : null })
    setEnviando(false)
    if (!r.ok) {
      seguimiento.terminar(false, r.message)
      return
    }
    focoRef.current = { id: r.data.id, campo: 'titulo' }
    cambiarFilas((fs) => insertarFila(fs, r.data, r.data.posicion))
    seguimiento.terminar(true)
  }

  async function quitar(fila: FilaOrden): Promise<void> {
    const anteriores = filas
    cambiarFilas((fs) => quitarFila(fs, fila.id))
    seguimiento.empezar(`Quitaste ${fila.titulo}.`)
    const r = await quitarFilaOrdenDps({ itemId: fila.id })
    if (!r.ok) return fallar(r.message, anteriores)
    seguimiento.terminar(true)
  }

  async function usarPlantilla(): Promise<void> {
    setEnviando(true)
    seguimiento.empezar('Empezaste el orden con la plantilla.')
    const r = await plantillaOrdenDps({ planId })
    setEnviando(false)
    if (!r.ok) {
      seguimiento.terminar(false, r.message)
      return
    }
    onOrden(r.data)
    seguimiento.terminar(true)
  }

  if (filas.length === 0) {
    return (
      <EstadoVacioSistema
        icono={ListOrdered}
        titulo="Este plan todavía no tiene orden"
        subtitulo={
          editable
            ? 'Empieza con la plantilla del plan del domingo (pre servicio, banda, mensaje…) o copia el orden del domingo anterior desde «Acciones».'
            : 'Quienes arman el plan lo preparan aquí.'
        }
        accion={
          editable && (
            <div className="flex flex-wrap justify-center gap-2">
              <BotonSistema tamaño="sm" cargando={enviando} disabled={enviando} onClick={() => void usarPlantilla()}>
                Empezar con la plantilla
              </BotonSistema>
              <BotonSistema variante="outline" tamaño="sm" icono={Plus} disabled={enviando} onClick={() => void agregar('item')}>
                Elemento
              </BotonSistema>
            </div>
          )
        }
      />
    )
  }

  const columnas = calculo.comienzos.length

  function asa(fila: FilaOrden, indice: number): ReactElement {
    return (
      <button
        type="button"
        draggable
        data-asa={fila.id}
        aria-label={`Mover ${fila.titulo}. Usa flechas arriba y abajo`}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          e.preventDefault()
          void mover(fila.id, indice + (e.key === 'ArrowUp' ? -1 : 1))
        }}
        onDragStart={(e) => {
          arrastreRef.current = fila.id
          e.dataTransfer.effectAllowed = 'move'
          const tr = e.currentTarget.closest('tr')
          if (tr) e.dataTransfer.setDragImage(tr, 16, 16)
        }}
        onDragEnd={() => (arrastreRef.current = null)}
        className="focus-ring grid size-7 cursor-grab place-items-center rounded-md text-muted-foreground opacity-35 transition-[opacity,background-color] group-hover/fila:opacity-100 hover:bg-accent focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100"
      >
        <GripVertical aria-hidden="true" className="size-3.5" />
      </button>
    )
  }

  const destino = (indice: number) => ({
    onDragOver: (e: DragEvent) => {
      if (arrastreRef.current) e.preventDefault()
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      const id = arrastreRef.current
      arrastreRef.current = null
      if (id) void mover(id, indice)
    },
  })

  function filaEncabezado({ fila, totalSeg }: FilaCalculada, indice: number): ReactElement {
    return (
      <tr key={fila.id} className="group/fila [&:focus-within>*]:bg-brand-tint" {...destino(indice)}>
        {editable && <td className="w-8 border-b border-border bg-muted py-0 pr-0 pl-1">{asa(fila, indice)}</td>}
        <th scope="rowgroup" colSpan={columnas + 3} className="h-7 border-b border-border bg-muted px-2.5 text-left text-xs font-[650] tracking-[0.02em]">
          <div className="flex min-w-0 items-center gap-2">
            {editable ? (
              <>
                <CampoEnLinea
                  valor={fila.titulo}
                  etiqueta={`Título de ${fila.titulo}`}
                  normalizar={normalizarTitulo}
                  onInvalido={seguimiento.anunciar}
                  onGuardar={(titulo) => void guardar(fila, { titulo }, `Encabezado: ${titulo}.`)}
                  className="max-w-xs text-xs font-[650]"
                  datos={{ 'data-titulo': fila.id }}
                />
                <SelectSistema
                  aria-label={`Momento de ${fila.titulo}`}
                  value={fila.fase ?? 'servicio'}
                  opciones={FASES.map((f) => ({ valor: f, etiqueta: ETIQUETA_FASE[f] }))}
                  onValueChange={(v) => void guardar(fila, { fase: v as FaseOrden }, `${fila.titulo}: ${ETIQUETA_FASE[v as FaseOrden].toLowerCase()}. Horas recalculadas.`)}
                  className="h-7 w-auto rounded-md border-transparent bg-transparent py-0 pr-8 pl-2 text-xs font-medium text-muted-foreground hover:border-border pointer-coarse:h-11"
                />
              </>
            ) : (
              <span className="min-w-0 break-words">{fila.titulo}</span>
            )}
            <span className="ml-auto shrink-0 font-mono font-medium tabular-nums text-muted-foreground">{formatearDuracion(totalSeg)}</span>
            {editable && (
              <button type="button" aria-label={`Quitar ${fila.titulo}`} onClick={() => void quitar(fila)} className={CLASE_ACCION_FILA}>
                <X aria-hidden="true" className="size-3.5" />
              </button>
            )}
          </div>
        </th>
      </tr>
    )
  }

  function filaItem({ fila, horas }: FilaCalculada, indice: number): ReactElement {
    const borde = 'border-b border-border/60'
    return (
      <tr key={fila.id} className="group/fila [&:focus-within>*]:bg-brand-tint" {...destino(indice)}>
        {editable && <td className={cn('w-8 py-0 pr-0 pl-1', borde)}>{asa(fila, indice)}</td>}
        {horas.map((hora, k) => (
          <td key={k} className={cn('h-9 py-[3px] pointer-coarse:h-12', CLASE_TIEMPO, borde, k === horas.length - 1 && 'border-r border-r-border', !hora && 'text-muted-foreground')}>
            {hora ?? '—'}
          </td>
        ))}
        <td className={cn('w-[76px] px-2.5 py-[3px]', borde)}>
          {editable ? (
            <CampoEnLinea
              valor={formatearDuracion(fila.duracionSeg)}
              etiqueta={`Duración de ${fila.titulo}`}
              normalizar={normalizarDuracion}
              onInvalido={seguimiento.anunciar}
              onGuardar={(texto) => {
                const duracionSeg = parsearDuracion(texto) ?? fila.duracionSeg
                void guardar(fila, { duracionSeg }, `Duración de ${fila.titulo}: ${texto}. Horas recalculadas.`)
              }}
              inputMode="numeric"
              className="ml-0 min-h-7 w-[62px] font-mono tabular-nums"
            />
          ) : (
            <span className="font-mono tabular-nums">{formatearDuracion(fila.duracionSeg)}</span>
          )}
        </td>
        <td className={cn('min-w-48 px-2.5 py-[3px]', borde)}>
          {editable ? (
            <>
              <CampoEnLinea
                valor={fila.titulo}
                etiqueta={`Título de ${fila.titulo}`}
                normalizar={normalizarTitulo}
                onInvalido={seguimiento.anunciar}
                onGuardar={(titulo) => void guardar(fila, { titulo }, `Título: ${titulo}.`)}
                className="font-semibold"
                datos={{ 'data-titulo': fila.id }}
              />
              <CampoEnLinea
                valor={fila.notas ?? ''}
                etiqueta={`Notas de ${fila.titulo}`}
                placeholder="Agregar nota"
                onGuardar={(notas) => void guardar(fila, { notas: notas || null }, notas ? `Notas de ${fila.titulo} guardadas.` : `Quitaste las notas de ${fila.titulo}.`)}
                className="min-h-5 text-xs text-muted-foreground"
              />
            </>
          ) : (
            <>
              <p className="break-words font-semibold">{fila.titulo}</p>
              {fila.notas && <p className="break-words text-xs text-muted-foreground">{fila.notas}</p>}
            </>
          )}
        </td>
        <td className={cn('w-[200px] px-2.5 py-[3px] text-muted-foreground', borde)}>
          <div className="flex items-center gap-1">
            {editable ? (
              <CampoEnLinea
                valor={fila.responsable ?? ''}
                etiqueta={`Responsable de ${fila.titulo}`}
                placeholder="—"
                onGuardar={(responsable) => void guardar(fila, { responsable: responsable || null }, `Responsable de ${fila.titulo}: ${responsable || 'nadie'}.`)}
                className="text-muted-foreground"
              />
            ) : (
              <span className="break-words">{fila.responsable ?? '—'}</span>
            )}
            {editable && (
              <button type="button" aria-label={`Quitar ${fila.titulo}`} onClick={() => void quitar(fila)} className={CLASE_ACCION_FILA}>
                <X aria-hidden="true" className="size-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  const encabezadoCelda = 'sticky top-0 z-[2] h-[34px] border-b border-border bg-card px-2.5 text-left text-xs font-semibold text-muted-foreground'

  return (
    <div className="space-y-2.5">
      {calculo.avisos.map((a) => (
        <p key={a} className="text-[13px] font-medium text-warning-text">
          {a}
        </p>
      ))}

      <div className="hidden overflow-auto rounded-md border border-border bg-card md:block">
        <table ref={tablaRef} aria-label={`Orden del servicio, ${fechaHablada(plan.fecha)}`} className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {editable && (
                <th className={cn(encabezadoCelda, 'w-8 px-1')}>
                  <span className="sr-only">Mover</span>
                </th>
              )}
              {calculo.comienzos.map((hora, k) => (
                <th key={k} scope="col" className={cn(encabezadoCelda, CLASE_TIEMPO, 'text-foreground', k === columnas - 1 && 'border-r')}>
                  {hora}
                </th>
              ))}
              <th scope="col" className={encabezadoCelda}>
                Duración
              </th>
              <th scope="col" className={encabezadoCelda}>
                Elemento y notas
              </th>
              <th scope="col" className={encabezadoCelda}>
                Responsable
              </th>
            </tr>
          </thead>
          <tbody>{calculo.filas.map((f, i) => (f.fila.tipo === 'encabezado' ? filaEncabezado(f, i) : filaItem(f, i)))}</tbody>
        </table>
      </div>

      {editable && (
        <div className="hidden space-y-2.5 md:block">
          <div className="flex gap-2">
            <BotonSistema variante="outline" tamaño="sm" icono={Plus} disabled={enviando} onClick={() => void agregar('item')}>
              Elemento
            </BotonSistema>
            <BotonSistema variante="outline" tamaño="sm" icono={Plus} disabled={enviando} onClick={() => void agregar('encabezado')}>
              Encabezado
            </BotonSistema>
          </div>
          <p className="text-xs text-muted-foreground">
            Haz clic en la duración o el título para editar. <Tecla>Enter</Tecla> guarda · <Tecla>Esc</Tecla> deshace · arrastra el asa o, con el asa
            enfocada, usa <Tecla>↑</Tecla> <Tecla>↓</Tecla> para mover. Las horas se recalculan solas.
          </p>
        </div>
      )}

      {/* Phones: the same order as a read-only list. */}
      <ol aria-label="Orden del servicio" className="overflow-hidden rounded-2xl border border-border bg-card md:hidden">
        {calculo.filas.map(({ fila, horas, totalSeg }) =>
          fila.tipo === 'encabezado' ? (
            <li key={fila.id} className="flex justify-between gap-3 border-t border-border bg-muted px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] first:border-t-0">
              <span className="min-w-0 break-words">{fila.titulo}</span>
              <span className="shrink-0 font-mono tabular-nums">{formatearDuracion(totalSeg)}</span>
            </li>
          ) : (
            <li key={fila.id} className="border-t border-border/60 px-4 py-2.5 first:border-t-0">
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {[...horas.filter((h): h is string => h !== null), formatearDuracion(fila.duracionSeg)].join(' · ')}
              </p>
              <p className="break-words text-[15px] font-medium">{fila.titulo}</p>
              {(fila.notas || fila.responsable) && (
                <p className="break-words text-[13px] text-muted-foreground">{[fila.notas, fila.responsable].filter(Boolean).join(' · ')}</p>
              )}
            </li>
          ),
        )}
      </ol>
      {editable && <p className="text-xs text-muted-foreground md:hidden">Para editar el orden, usa una pantalla más ancha.</p>}
    </div>
  )
}

function Tecla({ children }: { readonly children: string }): ReactElement {
  return <kbd className="rounded-md border border-border bg-card px-[5px] py-px font-mono text-[11px]">{children}</kbd>
}
