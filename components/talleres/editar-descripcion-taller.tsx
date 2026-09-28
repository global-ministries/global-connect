'use client'

/**
 * T3 correction (odd/tasks/talleres-configuracion-del-taller.md) — the
 * cabecera's inline "editar descripción" control. Same pattern as
 * EditarNombreTaller (components/talleres/editar-nombre-taller.tsx): the
 * page only renders this when permisos.editarTaller is granted, so it
 * has no `puedeEditar` prop of its own; it always shows the pencil
 * action, a 44px touch target.
 */

import { useEffect, useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, X } from 'lucide-react'

import { TextoSistema } from '@/components/ui/sistema-diseno'
import { updateTallerDescripcion } from '@/app/(auth)/talleres/[taller]/actions'

interface Props {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly descripcion: string | null
}

const BOTON_ICONO = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground'

export function EditarDescripcionTaller({ tallerId, tallerSlug, descripcion }: Props): ReactElement {
  const router = useRouter()
  const [descripcionActual, setDescripcionActual] = useState(descripcion)
  const [editing, setEditing] = useState(false)
  const [valor, setValor] = useState(descripcion ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setDescripcionActual(descripcion)
  }, [descripcion])

  if (!editing) {
    return (
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {descripcionActual ? (
          <TextoSistema className="block">{descripcionActual}</TextoSistema>
        ) : (
          <TextoSistema variante="sutil" className="block italic">
            Sin descripción.
          </TextoSistema>
        )}
        <button
          type="button"
          aria-label="Editar descripción"
          className={BOTON_ICONO}
          onClick={() => {
            setValor(descripcionActual ?? '')
            setError(null)
            setEditing(true)
          }}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    )
  }

  function submit(): void {
    setError(null)
    startTransition(async () => {
      const result = await updateTallerDescripcion({ tallerId, tallerSlug, descripcion: valor })
      if (result.ok) {
        setDescripcionActual(result.descripcion)
        setEditing(false)
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      <textarea
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        aria-label="Descripción del taller"
        rows={3}
        className="min-h-[44px] w-full rounded-lg border border-border bg-card/50 px-3 py-2 text-foreground"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Guardar descripción"
          className={BOTON_ICONO}
          disabled={pending}
          onClick={submit}
        >
          <Check className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1 sm:text-sm">Guardar</span>
        </button>
        <button
          type="button"
          aria-label="Cancelar edición de la descripción"
          className={BOTON_ICONO}
          disabled={pending}
          onClick={() => {
            setEditing(false)
            setError(null)
          }}
        >
          <X className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1 sm:text-sm">Cancelar</span>
        </button>
      </div>
      {error && (
        <span role="alert" className="block text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
