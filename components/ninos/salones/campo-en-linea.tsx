'use client'

/**
 * Niños › Salones — an inline field of the salón panel (docs/design-system/
 * patterns.md, "Inline edit and autosave"; the `.ce` of the artboard, the same
 * look as the minutes fields of Eventos): saves on Enter or on leaving it,
 * restores on Escape, and an invalid value keeps the focus with
 * `aria-invalid` and its sentence in the live region (once: leaving the same
 * invalid text again lets the focus go). `validar` returns the sentence of
 * what to fix, or null.
 */
import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react'

import { cn } from '@/lib/utils'

const CAMPO =
  'h-8 rounded-md border border-border bg-transparent px-2 text-[13px] text-foreground transition-colors hover:border-foreground/30 focus:border-brand focus:bg-background focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20 pointer-coarse:h-11'

export function CampoEnLinea({
  id,
  etiqueta,
  valor,
  validar,
  onGuardar,
  onInvalido,
  numerico = false,
  placeholder,
  className,
}: {
  readonly id?: string
  /** Accessible name when there is no visible label pointing at `id`. */
  readonly etiqueta?: string
  readonly valor: string
  readonly validar: (texto: string) => string | null
  readonly onGuardar: (texto: string) => Promise<boolean>
  readonly onInvalido: (mensaje: string) => void
  readonly numerico?: boolean
  readonly placeholder?: string
  readonly className?: string
}): ReactElement {
  const [texto, setTexto] = useState(valor)
  const [invalido, setInvalido] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  // The invalid text already announced: leaving it again does not take the
  // focus back (two invalid fields would pull the focus from each other).
  const rechazado = useRef<string | null>(null)

  const confirmar = async () => {
    const limpio = texto.trim()
    if (limpio === valor.trim()) {
      setInvalido(false)
      return
    }
    if (limpio === rechazado.current) return
    const mensaje = validar(limpio)
    if (mensaje) {
      rechazado.current = limpio
      setInvalido(true)
      onInvalido(mensaje)
      // Keep the focus on the value to fix.
      setTimeout(() => ref.current?.focus())
      return
    }
    rechazado.current = null
    setInvalido(false)
    const ok = await onGuardar(limpio)
    if (!ok) setInvalido(true)
  }

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setTexto(valor)
      rechazado.current = null
      setInvalido(false)
    }
  }

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode={numerico ? 'numeric' : undefined}
      aria-label={etiqueta}
      aria-invalid={invalido || undefined}
      value={texto}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => void confirmar()}
      onKeyDown={teclas}
      className={cn(CAMPO, numerico && 'text-center font-mono tabular-nums tracking-[-0.02em]', className)}
    />
  )
}
