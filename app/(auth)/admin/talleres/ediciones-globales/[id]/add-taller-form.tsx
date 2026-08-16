'use client'

/**
 * PR29-D — Client form to associate a taller to the current edicion
 * global. Wraps the `add_taller_to_edicion_global` RPC.
 *
 * The dropdown only shows talleres that are NOT already associated
 * with this global (filtered server-side in `loadTalleresDisponibles`).
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

import { TextoSistema } from '@/components/ui/sistema-diseno'

import { addTallerToEdicionGlobalAction } from './actions'

interface TallerOption {
  readonly id: string
  readonly nombre: string
  readonly slug: string
}

interface Input {
  readonly edicionGlobalId: string
  readonly disponibles: ReadonlyArray<TallerOption>
}

export function AddTallerForm({ edicionGlobalId, disponibles }: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState('')

  function submit(): void {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      const result = await addTallerToEdicionGlobalAction({
        edicion_global_id: edicionGlobalId,
        taller_id: selected,
      })
      if (result.ok) {
        router.refresh()
        setSelected('')
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  if (disponibles.length === 0) {
    return (
      <TextoSistema variante="sutil" className="block text-sm">
        No hay grupos activos disponibles para agregar.
      </TextoSistema>
    )
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="block flex-1">
        <span className="mb-1 block text-sm font-medium">Agregar grupo a esta edición</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded border px-3 py-2"
        >
          <option value="">— Seleccioná un grupo —</option>
          {disponibles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre} ({t.slug})
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={!selected || pending}
        className="inline-flex items-center gap-1 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> {pending ? 'Agregando…' : 'Agregar'}
      </button>
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}