'use client'

/**
 * PR C (Fase 5 GdV-parity) — Season detail client.
 *
 * Two write surfaces, both gated behind `canWrite` (server-resolved) and
 * re-checked by the server actions + RLS:
 *   1. Estado transitions (borrador → abierto → cerrado / cancelado).
 *   2. Per-taller membership toggles (the "which talleres open" control),
 *      editable only while the season is borrador/abierto.
 *
 * Toggles are optimistic: the checkbox flips immediately and reverts on error.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { toggleTallerInTemporada, transitionTemporada } from '../actions'

type TemporadaEstado = 'borrador' | 'abierto' | 'cerrado' | 'cancelado'
type NextEstado = 'abierto' | 'cerrado' | 'cancelado'

interface TallerOption {
  id: string
  nombre: string
  slug: string
}

interface Props {
  readonly temporadaId: string
  readonly estado: TemporadaEstado
  readonly canWrite: boolean
  readonly talleres: ReadonlyArray<TallerOption>
  readonly selectedTallerIds: ReadonlyArray<string>
}

const TRANSITIONS: Record<TemporadaEstado, ReadonlyArray<{ next: NextEstado; label: string }>> = {
  borrador: [
    { next: 'abierto', label: 'Abrir temporada' },
    { next: 'cancelado', label: 'Cancelar' },
  ],
  abierto: [
    { next: 'cerrado', label: 'Cerrar temporada' },
    { next: 'cancelado', label: 'Cancelar' },
  ],
  cerrado: [],
  cancelado: [],
}

export function TemporadaDetailClient({
  temporadaId,
  estado,
  canWrite,
  talleres,
  selectedTallerIds,
}: Props): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pendingTallerId, setPendingTallerId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedTallerIds))

  const membershipEditable = canWrite && (estado === 'borrador' || estado === 'abierto')
  const transitions = TRANSITIONS[estado]

  function runTransition(next: NextEstado): void {
    setError(null)
    startTransition(async () => {
      const result = await transitionTemporada({ temporadaId, next })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  function toggle(tallerId: string, on: boolean): void {
    setError(null)
    setPendingTallerId(tallerId)
    // Optimistic flip.
    setSelected((prev) => {
      const nextSet = new Set(prev)
      if (on) nextSet.add(tallerId)
      else nextSet.delete(tallerId)
      return nextSet
    })
    startTransition(async () => {
      const result = await toggleTallerInTemporada({ temporadaId, tallerId, on })
      if (result.ok) {
        router.refresh()
      } else {
        // Revert on failure.
        setSelected((prev) => {
          const nextSet = new Set(prev)
          if (on) nextSet.delete(tallerId)
          else nextSet.add(tallerId)
          return nextSet
        })
        setError(result.message ?? result.error)
      }
      setPendingTallerId(null)
    })
  }

  return (
    <div className="grid gap-4">
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {canWrite && transitions.length > 0 && (
        <TarjetaSistema variante="outlined" className="p-4">
          <TextoSistema className="mb-2 block font-medium">Estado</TextoSistema>
          <div className="flex flex-wrap gap-2">
            {transitions.map((t) => (
              <button
                key={t.next}
                type="button"
                disabled={pending}
                onClick={() => runTransition(t.next)}
                className={
                  t.next === 'cancelado'
                    ? 'rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50'
                    : 'rounded bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50'
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </TarjetaSistema>
      )}

      <TarjetaSistema variante="elevated" className="p-4">
        <TextoSistema className="mb-1 block font-medium">
          Talleres que abren en esta temporada
        </TextoSistema>
        <TextoSistema variante="sutil" className="mb-3 block text-sm">
          {membershipEditable
            ? 'Marcá los talleres que abren inscripción cuando esta temporada esté abierta.'
            : 'La membresía no es editable en el estado actual.'}
        </TextoSistema>

        {talleres.length === 0 ? (
          <TextoSistema variante="sutil" className="block text-sm">
            No hay talleres activos disponibles.
          </TextoSistema>
        ) : (
          <ul className="grid gap-2">
            {talleres.map((taller) => {
              const checked = selected.has(taller.id)
              const isPending = pendingTallerId === taller.id
              return (
                <li key={taller.id}>
                  <label className="flex items-center gap-3 rounded border p-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!membershipEditable || isPending}
                      onChange={(e) => toggle(taller.id, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{taller.nombre}</span>
                      <span className="block text-xs text-muted-foreground">
                        <code>{taller.slug}</code>
                      </span>
                    </span>
                    {isPending && (
                      <span className="text-xs text-muted-foreground">Guardando…</span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </TarjetaSistema>
    </div>
  )
}
