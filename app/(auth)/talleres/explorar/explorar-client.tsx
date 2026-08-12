"use client"

/**
 * PR20 — Client wrapper for /talleres/explorar list + FAB.
 *
 * Renders the selectable list of talleres. When the user selects one,
 * the FAB appears anchored to bottom-right. Clicking the FAB invokes
 * the `inscribirseATaller` server action with the selected taller's id
 * (and its cohorte id, looked up from the metadata).
 *
 * This wrapper exists because the page itself is an RSC (data fetched
 * server-side). Splitting the interactive part into a client component
 * keeps the data layer server-side while isolating the interactivity.
 */

import { useState, useTransition, type ReactElement } from 'react'

import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { BookOpen } from 'lucide-react'

import { TallerExplorarFab } from '@/components/talleres/explorar-fab'
import { inscribirseATaller } from './actions'

interface TallerRow {
  readonly id: string
  readonly nombre: string
  readonly tipo: 'individual' | 'pareja'
  readonly edicion: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly ya_inscrito: boolean
  readonly cohorte_id?: string
}

interface Input {
  readonly talleres: readonly TallerRow[]
  readonly defaultCohorteId: string
}

export function ExplorarTalleresClient({ talleres, defaultCohorteId }: Input): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const selected = talleres.find((t) => t.id === selectedId) ?? null

  async function handleInscribirse(): Promise<{ ok: boolean; error?: string }> {
    if (!selected) return { ok: false, error: 'no-selection' }
    const cohorteId = selected.cohorte_id ?? defaultCohorteId
    if (!cohorteId) {
      setFeedback('No se encontró cohorte para este taller.')
      return { ok: false, error: 'no-cohorte' }
    }
    const result = await inscribirseATaller({
      tallerId: selected.id,
      cohorteId,
    })
    if (result.ok) {
      setFeedback('¡Inscripción enviada! Pendiente de aprobación.')
      setSelectedId(null)
      return { ok: true }
    }
    setFeedback(`Error: ${result.error}`)
    return { ok: false, error: result.error }
  }

  if (talleres.length === 0) {
    return (
      <TarjetaSistema variante="outlined" className="p-6 text-center">
        <TextoSistema variante="sutil">
          No hay talleres abiertos en este momento.
        </TextoSistema>
      </TarjetaSistema>
    )
  }

  return (
    <>
      {feedback && (
        <TarjetaSistema variante="outlined" className="p-3 text-sm">
          <TextoSistema>{feedback}</TextoSistema>
        </TarjetaSistema>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {talleres.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => {
                if (t.ya_inscrito) return
                startTransition(() => setSelectedId(t.id))
              }}
              disabled={t.ya_inscrito}
              aria-pressed={selectedId === t.id}
              aria-label={`Seleccionar ${t.nombre} para inscripción`}
              className={`w-full text-left transition ${
                selectedId === t.id
                  ? 'ring-2 ring-[var(--brand-primary)] rounded-md'
                  : ''
              } ${t.ya_inscrito ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <TarjetaSistema variante="elevated" className="p-4">
                <div className="flex items-start gap-3">
                  <BookOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <TextoSistema className="font-medium">{t.nombre}</TextoSistema>
                    <TextoSistema variante="sutil" className="mt-1 block text-sm">
                      Edición {t.edicion} · {t.tipo === 'pareja' ? 'Pareja' : 'Individual'}
                    </TextoSistema>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <BadgeSistema>{t.estado}</BadgeSistema>
                      {t.ya_inscrito && (
                        <BadgeSistema variante="success">Ya inscripto</BadgeSistema>
                      )}
                    </div>
                  </div>
                </div>
              </TarjetaSistema>
            </button>
          </li>
        ))}
      </ul>
      {selected && !selected.ya_inscrito && (
        <TallerExplorarFab
          tallerId={selected.id}
          onInscribirse={handleInscribirse}
        />
      )}
      {pending && (
        <div aria-live="polite" className="sr-only">Cargando</div>
      )}
    </>
  )
}
