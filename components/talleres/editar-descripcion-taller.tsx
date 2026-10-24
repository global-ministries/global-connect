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

import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { updateTallerDescripcion } from '@/app/(auth)/talleres/[taller]/actions'

interface Props {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly descripcion: string | null
}

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
        <BotonSistema
          type="button"
          variante="ghost"
          soloIcono
          icono={Pencil}
          aria-label="Editar descripción"
          onClick={() => {
            setValor(descripcionActual ?? '')
            setError(null)
            setEditing(true)
          }}
        />
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
        className="min-h-[44px] w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-foreground focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <BotonSistema
          type="button"
          variante="ghost"
          icono={Check}
          aria-label="Guardar descripción"
          disabled={pending}
          onClick={submit}
        >
          <span className="sr-only sm:not-sr-only">Guardar</span>
        </BotonSistema>
        <BotonSistema
          type="button"
          variante="ghost"
          icono={X}
          aria-label="Cancelar edición de la descripción"
          disabled={pending}
          onClick={() => {
            setEditing(false)
            setError(null)
          }}
        >
          <span className="sr-only sm:not-sr-only">Cancelar</span>
        </BotonSistema>
      </div>
      {error && (
        <span role="alert" className="block text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
