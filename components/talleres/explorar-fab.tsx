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
      // Above the mobile bottom bar (z-50, ~80px + safe area) and in the
      // desktop corner; 48px tall like every primary mobile call to action.
      className="fixed bottom-24 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-5 font-medium text-brand-foreground shadow-lg transition-[background-color,box-shadow,transform] duration-200 ease-expo press-scale touch-manipulation hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 md:bottom-6 md:right-6"
    >
      <Plus className="h-5 w-5" aria-hidden="true" />
      <span>{pending ? 'Inscribiendo…' : 'Inscribirme'}</span>
    </button>
  )
}
