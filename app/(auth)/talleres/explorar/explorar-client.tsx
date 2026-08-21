"use client"

/**
 * PR20 — Client wrapper for /talleres/explorar list + FAB.
 * PR38 — adds modality + period dates to the card, fixes the
 *        per-row cohorte_id lookup, and improves the no-cohorte
 *        error message.
 * PR38 — render the abstract taller name (talleres.nombre) as the
 *        card title (e.g. "Matrimonio sobre la Roca") and the
 *        edicion label (e.g. "Septiembre 2026") as the subtitle.
 *
 * Renders the selectable list of talleres. When the user selects one,
 * the FAB appears anchored to bottom-right. Clicking the FAB invokes
 * the `inscribirseATaller` server action with the selected taller's id
 * (and its cohorte id, surfaced per-row by the RSC page).
 *
 * This wrapper exists because the page itself is an RSC (data fetched
 * server-side). Splitting the interactive part into a client component
 * keeps the data layer server-side while isolating the interactivity.
 */

import { useState, useTransition, type ReactElement } from 'react'

import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { BookOpen } from 'lucide-react'

import { TallerExplorarFab } from '@/components/talleres/explorar-fab'
import SelectLeaderModal from '@/components/modals/SelectLeaderModal'
import { inscribirseATaller } from './actions'

interface TallerRow {
  readonly id: string
  /** Abstract taller name (talleres.nombre) — e.g. "Matrimonio sobre la Roca". */
  readonly nombre: string
  /** Stable URL-safe slug for the abstract taller (talleres.slug). */
  readonly slug: string
  readonly tipo: 'individual' | 'pareja'
  /**
   * PR G — couple link type for `tipo === 'pareja'` ediciones (null for
   * individual). Drives the cónyuge picker and is forwarded to
   * `inscribirseATaller` on self-enroll.
   */
  readonly link_type: 'matrimonio' | 'novios' | null
  readonly edicion: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly ya_inscrito: boolean
  /**
   * PR38 — cohorte_id is surfaced per-row by the RSC page
   * (joined server-side in `loadParticipanteExplorar`). This is the
   * PRIMARY source of cohorte_id for the inscribirme action; the
   * page-level `defaultCohorteId` is a back-compat fallback only.
   */
  readonly cohorte_id: string | null
  readonly modalidad: 'periodo_general' | 'permanente_custom' | null
  readonly descripcion: string | null
  readonly fecha_apertura: string | null
  readonly fecha_cierre: string | null
}

interface Input {
  readonly talleres: readonly TallerRow[]
  readonly defaultCohorteId: string
}

/**
 * Format a date (ISO string or Date) as a short locale string for
 * the card subtitle. Returns "—" for invalid/null input.
 */
function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Map a modality enum to a human label.
 */
function formatModalidad(
  modalidad: 'periodo_general' | 'permanente_custom' | null,
): string {
  if (modalidad === 'periodo_general') return 'Periodo general'
  if (modalidad === 'permanente_custom') return 'Permanente custom'
  return 'Sin modalidad'
}

export function ExplorarTalleresClient({ talleres, defaultCohorteId }: Input): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  // PR G — cónyuge picker visibility for `tipo === 'pareja'` talleres.
  const [pickerOpen, setPickerOpen] = useState(false)

  const selected = talleres.find((t) => t.id === selectedId) ?? null

  /**
   * Fires the enrollment. Individual talleres pass both couple fields as
   * null; pareja talleres receive the chosen `companeroId` from the
   * cónyuge picker and the row's `linkType` (matrimonio | novios).
   */
  async function enroll(
    companeroId: string | null,
    linkType: 'matrimonio' | 'novios' | null,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!selected) return { ok: false, error: 'no-selection' }
    const cohorteId = selected.cohorte_id ?? defaultCohorteId
    if (!cohorteId) {
      setFeedback(
        'Esta edición aún no tiene cohorte asociada. Contactá al admin.',
      )
      return { ok: false, error: 'no-cohorte' }
    }
    const result = await inscribirseATaller({
      tallerId: selected.id,
      cohorteId,
      companeroId,
      linkType,
    })
    if (result.ok) {
      setFeedback('¡Inscripción enviada! Pendiente de aprobación.')
      setSelectedId(null)
      return { ok: true }
    }
    setFeedback(`Error: ${result.error}`)
    return { ok: false, error: result.error }
  }

  /**
   * FAB handler. Pareja talleres open the cónyuge picker first — the
   * actual enrollment fires from `handleConyugeSelected`. Individual
   * talleres enroll immediately.
   */
  async function handleInscribirse(): Promise<{ ok: boolean; error?: string }> {
    if (!selected) return { ok: false, error: 'no-selection' }
    if (selected.tipo === 'pareja') {
      setPickerOpen(true)
      return { ok: true }
    }
    return enroll(null, null)
  }

  /**
   * Cónyuge chosen from the picker → close it and enroll with the
   * couple fields (the selected row supplies `link_type`).
   */
  function handleConyugeSelected(usuario: { id: string }): void {
    setPickerOpen(false)
    void enroll(usuario.id, selected?.link_type ?? null)
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
                      Edición {t.edicion} ·{' '}
                      {t.tipo === 'pareja' ? 'Pareja' : 'Individual'}
                    </TextoSistema>
                    <TextoSistema
                      variante="sutil"
                      className="mt-1 block text-xs"
                    >
                      Modalidad: {formatModalidad(t.modalidad)}
                    </TextoSistema>
                    {t.fecha_apertura && t.fecha_cierre && (
                      <TextoSistema
                        variante="sutil"
                        className="mt-1 block text-xs"
                      >
                        Inscripciones: {formatDate(t.fecha_apertura)} —{' '}
                        {formatDate(t.fecha_cierre)}
                      </TextoSistema>
                    )}
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
      <SelectLeaderModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleConyugeSelected}
        title="Seleccionar cónyuge"
        description="Buscá y seleccioná a tu cónyuge para inscribirse juntos en este taller de pareja."
      />
      {pending && (
        <div aria-live="polite" className="sr-only">Cargando</div>
      )}
    </>
  )
}
