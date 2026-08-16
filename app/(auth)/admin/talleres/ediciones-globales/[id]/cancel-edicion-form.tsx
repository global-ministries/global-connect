'use client'

/**
 * PR29-D — Client form to cancel an edicion global. Wraps the
 * `cancel_edicion_global` RPC. Always requires a motivo (the SQL
 * function enforces this).
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'

import { TextoSistema } from '@/components/ui/sistema-diseno'

import { cancelEdicionGlobalAction } from './actions'

interface Input {
  readonly edicionGlobalId: string
}

export function CancelEdicionGlobalForm({ edicionGlobalId }: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [motivo, setMotivo] = useState('')

  const canSubmit = motivo.trim().length > 0 && !pending

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await cancelEdicionGlobalAction({
        edicion_global_id: edicionGlobalId,
        motivo,
      })
      if (result.ok) {
        router.refresh()
        setConfirming(false)
        setMotivo('')
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
        className="inline-flex items-center gap-2 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
      >
        <Ban className="h-4 w-4" /> Cancelar edición
      </button>
    )
  }

  return (
    <div className="rounded border border-red-300 bg-red-50 p-3">
      <TextoSistema className="text-sm">
        La cancelación es <strong>terminal</strong>: la edición global no se
        puede volver a abrir. Los talleres asociados dejan de tener esta
        global asignada (pueden re-asociarse a otra después).
      </TextoSistema>
      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-medium">Motivo *</span>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="w-full rounded border px-3 py-2"
          rows={2}
          placeholder="¿Por qué se cancela esta edición?"
        />
      </label>
      {error && (
        <div className="mt-2 rounded border border-red-300 bg-red-100 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
            setError(null)
            setMotivo('')
          }}
          className="rounded border px-3 py-1.5 text-sm"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1 rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Cancelando…' : 'Sí, cancelar'}
        </button>
      </div>
    </div>
  )
}