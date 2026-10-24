'use client'

/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — cabecera's inline
 * "editar nombre" control. The page only renders this when
 * permisos.editarTaller is granted (same gating pattern as
 * OpenEdicionForm) — this component never re-derives a capability, it
 * just is-or-isn't on the tree.
 *
 * T10 (design audit) — the read display used to be a `TituloSistema
 * nivel={1}`, a second `<h1>` on top of the page's own (ContenedorDashboard
 * → DesktopHeader). It is now nivel 2, so the page keeps exactly one h1.
 */

import { useEffect, useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, X } from 'lucide-react'

import { BotonSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { updateTallerNombre } from '@/app/(auth)/talleres/[taller]/actions'

interface Props {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly nombre: string
}

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
        <TituloSistema nivel={2}>{nombreActual}</TituloSistema>
        <BotonSistema
          type="button"
          variante="ghost"
          soloIcono
          icono={Pencil}
          aria-label="Editar nombre"
          onClick={() => {
            setValor(nombreActual)
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
        className="h-11 min-w-[12rem] flex-1 rounded-xl border border-border bg-card/50 px-3 py-2 text-foreground focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
        autoFocus
      />
      <BotonSistema
        type="button"
        variante="ghost"
        icono={Check}
        aria-label="Guardar nombre"
        disabled={pending}
        onClick={submit}
      >
        <span className="sr-only sm:not-sr-only">Guardar</span>
      </BotonSistema>
      <BotonSistema
        type="button"
        variante="ghost"
        icono={X}
        aria-label="Cancelar edición del nombre"
        disabled={pending}
        onClick={() => {
          setEditing(false)
          setError(null)
        }}
      >
        <span className="sr-only sm:not-sr-only">Cancelar</span>
      </BotonSistema>
      {error && (
        <span role="alert" className="block w-full text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
