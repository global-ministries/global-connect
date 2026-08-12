"use client"

/**
 * PR20 — Floating Action Button for /talleres/explorar.
 *
 * Follows the Grupos de Vida precedent (mention in tasks.md §12): an
 * FAB that anchors to the bottom-right corner, with a "+" icon and the
 * label "Inscribirme". On click it triggers the `inscribirseATaller`
 * server action with the currently-selected taller id.
 *
 * The taller id is passed as a prop from the parent RSC page; the
 * action is imported from the page's co-located actions.ts.
 */

import { useTransition } from 'react'
import type { ReactElement } from 'react'
import { Plus } from 'lucide-react'

interface Input {
  readonly tallerId: string
  readonly onInscribirse: () => Promise<{ ok: boolean; error?: string }>
  /** When true, the FAB is hidden (already inscribed). */
  readonly hidden?: boolean
}

export function TallerExplorarFab({
  tallerId,
  onInscribirse,
  hidden,
}: Input): ReactElement | null {
  const [pending, startTransition] = useTransition()

  if (hidden) return null

  return (
    <button
      type="button"
      aria-label={`Inscribirme en el taller ${tallerId}`}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await onInscribirse()
        })
      }}
      className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--brand-primary)] px-5 py-3 font-medium text-white shadow-lg transition hover:scale-105 disabled:opacity-50"
    >
      <Plus className="h-5 w-5" />
      <span>{pending ? 'Inscribiendo…' : 'Inscribirme'}</span>
    </button>
  )
}
