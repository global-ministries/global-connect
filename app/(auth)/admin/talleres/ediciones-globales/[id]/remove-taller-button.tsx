'use client'

/**
 * PR29-D / PR31 — Inline button to remove a taller from the current
 * edicion global.
 *
 * PR31: the action now nullifies `taller_ediciones.edicion_global_id`
 * on a SPECIFIC taller_ediciones row (the one created via add).
 * The button therefore takes the local edicion's id (not just the
 * taller id) so we never touch other rows belonging to the same
 * taller (e.g. the older Legacy edicion that may still exist).
 *
 * Only available while the global is in 'borrador' (the parent page
 * does NOT render this otherwise — see `[id]/page.tsx`). Uses an
 * inline confirm to avoid a modal dep.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

import { removeTallerFromEdicionGlobalAction } from './actions'

interface Input {
  readonly edicionGlobalId: string
  /**
   * The taller_ediciones row that was created when this taller was
   * added to the current global. Removing it clears the FK on this
   * specific row (we do not blanket-update all rows for the taller).
   */
  readonly edicionLocalId: string
  readonly tallerNombre: string
}

export function RemoveTallerButton({
  edicionGlobalId,
  edicionLocalId,
  tallerNombre,
}: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function submit(): void {
    setError(null)
    startTransition(async () => {
      const result = await removeTallerFromEdicionGlobalAction({
        edicion_global_id: edicionGlobalId,
        edicion_local_id: edicionLocalId,
      })
      if (result.ok) {
        router.refresh()
        setConfirming(false)
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
      >
        <X className="mr-1 inline-block h-3 w-3" /> Quitar
      </button>
    )
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
            setError(null)
          }}
          className="rounded border px-2 py-1 text-xs"
        >
          No
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Quitando…' : `Quitar ${tallerNombre}?`}
        </button>
      </div>
      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}