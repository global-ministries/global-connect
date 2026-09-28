'use client'

/**
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — the grupo screen's
 * clase-in-place edit: tema and fecha_programada, calling
 * talleres_editar_clase through the server action. The page decides
 * whether to render this control at all (permisos.editarEdicion AND
 * clase.estado !== 'cerrada' — hidden, never disabled, same house rule as
 * CerrarClase/EnviarReporte); this component never re-derives either
 * check, it only surfaces whatever error the action already translated
 * (e.g. CLASE_CERRADA via errores-api.ts).
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, X } from 'lucide-react'

import { editarClaseInstanciada } from '@/app/(auth)/talleres/[taller]/[edicion]/[grupo]/actions'

interface Props {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly grupoId: string
  readonly sesionId: string
  readonly tema: string | null
  readonly fechaProgramada: string
}

const BOTON_ICONO =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground'

export function EditarClaseInstanciada({
  tallerSlug,
  edicionId,
  grupoId,
  sesionId,
  tema,
  fechaProgramada,
}: Props): ReactElement {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [temaEditado, setTemaEditado] = useState(tema ?? '')
  const [fechaEditada, setFechaEditada] = useState(fechaProgramada)
  const [error, setError] = useState<string | null>(null)

  function abrir(): void {
    setTemaEditado(tema ?? '')
    setFechaEditada(fechaProgramada)
    setError(null)
    setEditando(true)
  }

  function guardar(): void {
    setError(null)
    startTransition(async () => {
      const result = await editarClaseInstanciada({
        tallerSlug,
        edicionId,
        grupoId,
        sesionId,
        tema: temaEditado,
        fechaProgramada: fechaEditada,
      })
      if (result.ok) {
        setEditando(false)
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  if (!editando) {
    return (
      <button type="button" aria-label="Editar clase" className={BOTON_ICONO} onClick={abrir}>
        <Pencil className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="mt-2 flex w-full flex-wrap items-center gap-2">
      <input
        aria-label="Tema de la clase"
        value={temaEditado}
        onChange={(e) => setTemaEditado(e.target.value)}
        placeholder="Ej. Intimidad con Dios"
        className="min-h-[44px] flex-1 min-w-[10rem] rounded-lg border border-border bg-card/50 px-3 py-2"
        autoFocus
      />
      <input
        type="date"
        aria-label="Fecha programada"
        value={fechaEditada}
        onChange={(e) => setFechaEditada(e.target.value)}
        className="min-h-[44px] rounded-lg border border-border bg-card/50 px-3 py-2"
      />
      <button type="button" aria-label="Guardar clase" className={BOTON_ICONO} onClick={guardar}>
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Cancelar edición de la clase"
        className={BOTON_ICONO}
        onClick={() => setEditando(false)}
      >
        <X className="h-4 w-4" />
      </button>
      {error && (
        <span role="alert" className="block w-full text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
