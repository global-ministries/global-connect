'use client'

/** Small building blocks of the public registration wizard. */
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

import { PASOS, type Paso } from './logica'

/** "Paso X de N" plus one segment per step; the titles are for screen readers. */
export function IndicadorPasos({ actual }: { readonly actual: Paso }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Paso {actual} de {PASOS.length}
      </p>
      <ol aria-label="Pasos" className="flex gap-1.5">
        {PASOS.map(({ paso, titulo }) => (
          <li
            key={paso}
            aria-current={paso === actual ? 'step' : undefined}
            className={cn(
              'h-2 flex-1 rounded-full transition-colors duration-300',
              paso < actual && 'bg-orange-500/60',
              paso === actual && 'bg-orange-500',
              paso > actual && 'bg-border',
            )}
          >
            <span className="sr-only">
              {titulo}
              {paso < actual && ' (completado)'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

type Opcion<T> = { valor: T; etiqueta: string }

type OpcionesGrandesProps<T> = {
  /** On the group, so validation can focus it. */
  id: string
  /** Visible question. */
  pregunta: string
  /** Accessible name when the visible question is not unique on the page. */
  nombreAccesible?: string
  opciones: readonly Opcion<T>[]
  valor: T | null
  onChange: (v: T) => void
  error?: string
}

/** Two or three big toggle buttons instead of a select (easier on a phone). */
export function OpcionesGrandes<T extends string | boolean>({
  id,
  pregunta,
  nombreAccesible,
  opciones,
  valor,
  onChange,
  error,
}: OpcionesGrandesProps<T>) {
  const idError = `${id}-error`
  return (
    <div className="space-y-2">
      <p id={`${id}-pregunta`} className="text-sm font-medium text-foreground">
        {pregunta}
      </p>
      <div
        id={id}
        role="group"
        tabIndex={-1}
        aria-label={nombreAccesible}
        aria-labelledby={nombreAccesible ? undefined : `${id}-pregunta`}
        aria-describedby={error ? idError : undefined}
        className="grid grid-cols-2 gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
      >
        {opciones.map((o) => {
          const activo = valor === o.valor
          return (
            <button
              key={String(o.valor)}
              type="button"
              aria-pressed={activo}
              onClick={() => onChange(o.valor)}
              className={cn(
                'flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 px-4 text-base font-semibold',
                'touch-manipulation transition-[background-color,border-color,color] duration-200',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                activo
                  ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300'
                  : 'border-border bg-card/50 text-foreground hover:border-orange-300',
                error && !activo && 'border-danger/50',
              )}
            >
              {activo && <Check className="h-5 w-5" aria-hidden />}
              {o.etiqueta}
            </button>
          )
        })}
      </div>
      {error && (
        <p id={idError} role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}

export const SI_NO: readonly Opcion<boolean>[] = [
  { valor: true, etiqueta: 'Sí' },
  { valor: false, etiqueta: 'No' },
]

/** A bordered block for one child or one pickup person. */
export function Bloque({ titulo, accion, children }: { titulo: ReactNode; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/60 p-4 shadow-sm sm:p-5">
      <div className="flex min-h-[44px] items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  )
}
