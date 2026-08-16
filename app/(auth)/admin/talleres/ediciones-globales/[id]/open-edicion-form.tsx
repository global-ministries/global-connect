'use client'

/**
 * PR29-D — Client form to transition an edicion global from
 * 'borrador' to 'abierto'. Wraps the `open_edicion_global` RPC.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Play } from 'lucide-react'

import { TextoSistema } from '@/components/ui/sistema-diseno'

import { openEdicionGlobalAction } from './actions'

interface Input {
  readonly edicionGlobalId: string
}

export function OpenEdicionGlobalForm({ edicionGlobalId }: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function submit(): void {
    setError(null)
    startTransition(async () => {
      const result = await openEdicionGlobalAction({ edicion_global_id: edicionGlobalId })
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
        className="inline-flex items-center gap-2 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
      >
        <Play className="h-4 w-4" /> Abrir edición
      </button>
    )
  }

  return (
    <div className="rounded border border-yellow-300 bg-yellow-50 p-3">
      <TextoSistema className="text-sm">
        ¿Abrir la edición global? Los talleres asociados pasarán de{' '}
        <code>borrador</code> a <code>abierto</code> en la misma transacción.
        Después no vas a poder cambiar la composición de talleres sin
        cancelar y crear una nueva edición.
      </TextoSistema>
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
          }}
          className="rounded border px-3 py-1.5 text-sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Abriendo…' : 'Sí, abrir'}
        </button>
      </div>
    </div>
  )
}