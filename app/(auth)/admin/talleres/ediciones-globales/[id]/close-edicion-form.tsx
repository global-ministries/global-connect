'use client'

/**
 * PR29-D — Client form to transition an edicion global from
 * 'abierto' to 'cerrado'. Wraps the `close_edicion_global` RPC.
 *
 * Offers a checkbox for `force_local=true` — admins that want to
 * close the locales regardless of active inscriptions.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'

import { TextoSistema } from '@/components/ui/sistema-diseno'

import { closeEdicionGlobalAction } from './actions'

interface Input {
  readonly edicionGlobalId: string
}

export function CloseEdicionGlobalForm({ edicionGlobalId }: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [forceLocal, setForceLocal] = useState(false)

  function submit(): void {
    setError(null)
    startTransition(async () => {
      const result = await closeEdicionGlobalAction({
        edicion_global_id: edicionGlobalId,
        force_local: forceLocal,
      })
      if (result.ok) {
        router.refresh()
        setConfirming(false)
        setForceLocal(false)
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
        className="inline-flex items-center gap-2 rounded border border-border bg-white px-4 py-2 text-sm font-medium"
      >
        <Lock className="h-4 w-4" /> Cerrar edición
      </button>
    )
  }

  return (
    <div className="rounded border border-yellow-300 bg-yellow-50 p-3">
      <TextoSistema className="text-sm">
        Por defecto, los talleres locales con inscripciones activas NO se
        cierran (respetamos el ciclo del taller — solo se bloquean nuevas
        inscripciones). Marcá la casilla si querés forzar el cierre de TODOS
        los locales, incluso con inscripciones activas.
      </TextoSistema>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={forceLocal}
          onChange={(e) => setForceLocal(e.target.checked)}
        />
        Forzar cierre de locales con inscripciones activas
      </label>
      {error && (
        <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
            setError(null)
            setForceLocal(false)
          }}
          className="rounded border px-3 py-1.5 text-sm"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Cerrando…' : 'Sí, cerrar'}
        </button>
      </div>
    </div>
  )
}