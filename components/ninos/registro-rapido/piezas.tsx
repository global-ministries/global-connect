'use client'

/**
 * Building blocks of the one-screen registration (prototypes 01 / 04 of
 * docs/design-system/prototipos/ninos/): the big answer pair, a section that
 * folds to one line, the error summary and the sticky "qué falta" bar.
 */
import type { FocusEvent, ReactNode } from 'react'
import { Check, Pencil } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { textoBarra, type EstadoBarra, type Faltante } from '@/lib/platform/ninos/registro-rapido'

/** Focuses a field (or the wrapper of an answer pair) by its DOM id. */
export function enfocar(id: string | null | undefined) {
  if (id) document.getElementById(id)?.focus()
}

type EleccionProps<T extends string> = {
  /** On the wrapper, so validation can focus it. */
  id: string
  /** Visible question. */
  pregunta: string
  /** Accessible name of the group (unique on the page). */
  nombre: string
  opciones: readonly { valor: T; etiqueta: string }[]
  /** '' = not answered. */
  valor: T | ''
  onCambio: (v: T) => void
  error?: string
}

/** Two big answers as one `ControlSegmentado` (aria-pressed buttons, 44px). */
export function Eleccion<T extends string>({ id, pregunta, nombre, opciones, valor, onCambio, error }: EleccionProps<T>) {
  return (
    <div id={id} tabIndex={-1} className="grid min-w-0 gap-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
      <p aria-hidden="true" className="text-sm font-medium text-foreground">
        {pregunta}
      </p>
      <ControlSegmentado<T | ''>
        etiqueta={nombre}
        opciones={opciones}
        valor={valor}
        onCambio={(v) => v !== '' && onCambio(v)}
        className="flex w-full [&>button]:min-h-11 [&>button]:flex-1"
      />
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}

export const SI_NO = [
  { valor: 'no', etiqueta: 'No' },
  { valor: 'si', etiqueta: 'Sí' },
] as const

export const siNoValor = (v: boolean | null): 'si' | 'no' | '' => (v === null ? '' : v ? 'si' : 'no')

type SeccionProps = {
  id: string
  numero: number
  titulo: string
  /** One line under the title (open section). */
  ayuda?: string
  completa: boolean
  plegada: boolean
  resumen?: { texto: string; numero?: string }
  /** Accessible name of "Editar", e.g. "Editar tus datos". */
  editar: string
  onEditar: () => void
  /** Focus left the section (it may fold). */
  onSalir: () => void
  children: ReactNode
}

/** A numbered section card; once complete and left it folds to one line with «Editar». */
export function SeccionRapida({ id, numero, titulo, ayuda, completa, plegada, resumen, editar, onEditar, onSalir, children }: SeccionProps) {
  const salir = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onSalir()
  }
  return (
    <TarjetaSistema className="min-w-0 p-4 sm:p-5">
      <section aria-labelledby={`${id}-titulo`} onBlur={salir} className="grid min-w-0 gap-4">
        <div className="flex min-h-11 min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={
              completa
                ? 'flex size-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-success-text'
                : 'flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-tint font-mono text-sm font-semibold tabular-nums text-brand-text'
            }
          >
            {completa ? <Check className="size-4" strokeWidth={2.6} /> : numero}
          </span>
          <h2 id={`${id}-titulo`} className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">
            {titulo}
          </h2>
          {plegada && (
            <BotonSistema type="button" variante="ghost" icono={Pencil} aria-label={editar} onClick={onEditar}>
              Editar
            </BotonSistema>
          )}
        </div>
        {plegada ? (
          resumen && (
            <p className="flex min-w-0 flex-wrap gap-x-2 text-[15px] text-muted-foreground">
              <b className="min-w-0 truncate font-semibold text-foreground">{resumen.texto}</b>
              {resumen.numero && <span className="font-mono tabular-nums">{resumen.numero}</span>}
            </p>
          )
        ) : (
          <>
            {ayuda && <p className="-mt-2 text-sm text-muted-foreground">{ayuda}</p>}
            {children}
          </>
        )}
      </section>
    </TarjetaSistema>
  )
}

/** "Revisa N datos antes de enviar" with a link to each field (prototype 01, state B). */
export function ResumenFaltantes({ faltan, sufijo = '' }: { faltan: readonly Faltante[]; sufijo?: string }) {
  if (faltan.length === 0) return null
  return (
    <AvisoFormulario tono="error" className="grid gap-2">
      <b>
        Revisa <span className="font-mono tabular-nums">{faltan.length}</span> {faltan.length === 1 ? 'dato' : 'datos'}
        {sufijo}
      </b>
      <ul className="grid gap-1 font-normal">
        {faltan.map((f) => (
          <li key={f.id}>
            <a
              href={`#${f.id}`}
              className="inline-flex min-h-11 items-center underline underline-offset-4 focus-ring rounded-md"
              onClick={(e) => {
                e.preventDefault()
                enfocar(f.id)
              }}
            >
              {f.etiqueta}
            </a>
          </li>
        ))}
      </ul>
    </AvisoFormulario>
  )
}

/** Status line of the send bar: what is missing, or "Todo listo" with the counts (numbers in mono). */
export function EstadoEnvio({ estado }: { estado: EstadoBarra }) {
  const listo = estado.faltan === 0
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm">
      <span aria-live="polite" className="sr-only">
        {textoBarra(estado)}
      </span>
      <PuntoEstado tono={listo ? 'success' : 'warning'} />
      <span aria-hidden="true" className="min-w-0 truncate text-muted-foreground">
        {listo ? (
          <>
            Todo listo: <b className="font-mono font-semibold tabular-nums text-foreground">{estado.ninos}</b>{' '}
            {estado.ninos === 1 ? 'niño' : 'niños'} · <b className="font-mono font-semibold tabular-nums text-foreground">{estado.retiran}</b>{' '}
            {estado.retiran === 1 ? 'persona retira' : 'personas retiran'}
          </>
        ) : (
          <>
            {estado.faltan === 1 ? 'Falta' : 'Faltan'} <b className="font-mono font-semibold tabular-nums text-foreground">{estado.faltan}</b>{' '}
            {estado.faltan === 1 ? 'dato' : 'datos'}: {estado.primero}
          </>
        )}
      </span>
    </p>
  )
}
