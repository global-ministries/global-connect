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
 * the FAB appears anchored to bottom-right. Clicking the FAB enrolls an
 * individual edición right away (`inscribirseATaller`) or opens the
 * partner picker for a couple one.
 *
 * This wrapper exists because the page itself is an RSC (data fetched
 * server-side). Splitting the interactive part into a client component
 * keeps the data layer server-side while isolating the interactivity.
 *
 * Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) —
 * the action now goes through `talleres_inscribirme`, which resolves the
 * cohorte server-side, so no cohorte id travels from the browser any more.
 * Couple ediciones open the partner picker (components/talleres/selector-
 * pareja.tsx: registered spouse first, then cédula) instead of the
 * leaders-only SelectLeaderModal.
 */

import { useState, useTransition, type ReactElement } from 'react'

import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { BookOpen } from 'lucide-react'

import { TallerExplorarFab } from '@/components/talleres/explorar-fab'
import { SelectorPareja } from '@/components/talleres/selector-pareja'
import { edicionEstadoBadgeVariante, edicionEstadoLabel } from '@/components/talleres/labels'
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
   * individual). Drives the partner picker: matrimonio offers the
   * registered spouse first; null makes the member choose the vínculo.
   */
  readonly link_type: 'matrimonio' | 'novios' | null
  /** When a new partner's access email goes out; only changes the picker copy. */
  readonly momento_envio_acceso?: 'al_aprobar' | 'al_inscribirse'
  readonly edicion: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly ya_inscrito: boolean
  readonly modalidad: 'periodo_general' | 'permanente_custom' | null
  readonly descripcion: string | null
  readonly fecha_apertura: string | null
  readonly fecha_cierre: string | null
  /**
   * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the
   * edición's own cierre_inscripcion, shown as "Inscripción hasta
   * {fecha}" when present (never the deprecated periodo dates above).
   */
  readonly cierre_inscripcion: string | null
  /**
   * T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — this
   * edición's cupo (if defined) is already full. The card + FAB disable
   * self-enroll with "Cupo completo" instead of letting the DB gate raise
   * CUPO_LLENO after the fact.
   */
  readonly cupo_completo: boolean
}

interface Input {
  readonly talleres: readonly TallerRow[]
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

export function ExplorarTalleresClient({ talleres }: Input): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  // Partner picker visibility for `tipo === 'pareja'` ediciones.
  const [pickerOpen, setPickerOpen] = useState(false)

  const selected = talleres.find((t) => t.id === selectedId) ?? null

  /** Shared success path for individual and couple enrollments. */
  function confirmarInscripcion(): void {
    setFeedback('¡Inscripción enviada! Pendiente de aprobación.')
    setPickerOpen(false)
    setSelectedId(null)
  }

  /**
   * FAB handler. Couple ediciones open the partner picker, which enrolls
   * by itself; individual ones enroll right away with no pareja.
   */
  async function handleInscribirse(): Promise<{ ok: boolean; error?: string }> {
    if (!selected) return { ok: false, error: 'no-selection' }
    setFeedback(null)
    if (selected.tipo === 'pareja') {
      setPickerOpen(true)
      return { ok: true }
    }
    const result = await inscribirseATaller({ edicionId: selected.id, pareja: null })
    if (result.ok) {
      confirmarInscripcion()
      return { ok: true }
    }
    setFeedback(result.message)
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
                if (t.ya_inscrito || t.cupo_completo) return
                startTransition(() => setSelectedId(t.id))
              }}
              disabled={t.ya_inscrito || t.cupo_completo}
              aria-pressed={selectedId === t.id}
              aria-label={`Seleccionar ${t.nombre} para inscripción`}
              className={`w-full text-left transition ${
                selectedId === t.id
                  ? 'ring-2 ring-[var(--brand-primary)] rounded-md'
                  : ''
              } ${t.ya_inscrito || t.cupo_completo ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                    {t.cierre_inscripcion && (
                      <TextoSistema
                        variante="sutil"
                        className="mt-1 block text-xs"
                      >
                        Inscripción hasta {formatDate(t.cierre_inscripcion)}
                      </TextoSistema>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <BadgeSistema variante={edicionEstadoBadgeVariante(t.estado)}>
                        {edicionEstadoLabel(t.estado)}
                      </BadgeSistema>
                      {t.ya_inscrito && (
                        <BadgeSistema variante="success">Ya inscripto</BadgeSistema>
                      )}
                      {!t.ya_inscrito && t.cupo_completo && (
                        <BadgeSistema variante="warning">Cupo completo</BadgeSistema>
                      )}
                    </div>
                  </div>
                </div>
              </TarjetaSistema>
            </button>
          </li>
        ))}
      </ul>
      {selected && !selected.ya_inscrito && !selected.cupo_completo && (
        <TallerExplorarFab
          tallerId={selected.id}
          onInscribirse={handleInscribirse}
        />
      )}
      {pickerOpen && selected?.tipo === 'pareja' && (
        <SelectorPareja
          key={selected.id}
          edicionId={selected.id}
          vinculoEdicion={selected.link_type}
          momentoEnvioAcceso={selected.momento_envio_acceso}
          onCerrar={() => setPickerOpen(false)}
          onInscrito={confirmarInscripcion}
        />
      )}
      {pending && (
        <div aria-live="polite" className="sr-only">Cargando</div>
      )}
    </>
  )
}
