'use client'

/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — cabecera's inline
 * "editar nombre" control. The page only renders this when
 * permisos.editarTaller is granted (same gating pattern as
 * OpenEdicionForm/AssignServicioForm) — this component never re-derives a
 * capability, it just is-or-isn't on the tree.
 */

import { useEffect, useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, X } from 'lucide-react'

import { TituloSistema } from '@/components/ui/sistema-diseno'
import { updateTallerNombre } from '@/app/(auth)/talleres/[taller]/actions'

interface Props {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly nombre: string
}

const BOTON_ICONO = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground'

export function EditarNombreTaller({ tallerId, tallerSlug, nombre }: Props): ReactElement {
  const router = useRouter()
  const [nombreActual, setNombreActual] = useState(nombre)
  const [editing, setEditing] = useState(false)
  const [valor, setValor] = useState(nombre)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setNombreActual(nombre)
  }, [nombre])

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <TituloSistema nivel={1}>{nombreActual}</TituloSistema>
        <button
          type="button"
          aria-label="Editar nombre"
          className={BOTON_ICONO}
          onClick={() => {
            setValor(nombreActual)
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
      const result = await updateTallerNombre({ tallerId, tallerSlug, nombre: valor.trim() })
      if (result.ok) {
        setNombreActual(result.nombre)
        setEditing(false)
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        aria-label="Nombre del taller"
        className="min-h-[44px] flex-1 min-w-[12rem] rounded-lg border border-border bg-card/50 px-3 py-2 text-foreground"
        autoFocus
      />
      <button
        type="button"
        aria-label="Guardar nombre"
        className={BOTON_ICONO}
        disabled={pending}
        onClick={submit}
      >
        <Check className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only sm:ml-1 sm:text-sm">Guardar</span>
      </button>
      <button
        type="button"
        aria-label="Cancelar edición del nombre"
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
      {error && (
        <span role="alert" className="block w-full text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
