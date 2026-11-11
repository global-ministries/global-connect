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
 *
 * T9 (odd/tasks/proximo-paso.md, L21–L23) — the confirmation and the badge
 * follow the real estado of the viewer's inscripción (`estado_inscripcion`,
 * loaded by the page): an edición with inscripción automática approves it
 * right away. The action only returns the inscripción id, but it revalidates
 * this path, so the rows arrive again with the new estado and the message is
 * derived from them. Neutral Spanish (tú) and no modality jargon.
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
  /** Estado of the viewer's own active inscripción in this edición, if any. */
  readonly estado_inscripcion?: 'pendiente' | 'aprobado' | null
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
 * Format a date as "3 de enero de 2027". A date-only value ("2027-01-03")
 * is that calendar day, never shifted by the UTC parse. "—" when invalid.
 */
function formatDate(value: string | null): string {
  if (!value) return '—'
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const d = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}

const MENSAJE_INSCRITO = '¡Listo, ya estás inscrito!'
const MENSAJE_PENDIENTE = 'Recibimos tu inscripción. La coordinación la confirmará.'
/** While the revalidated rows have not arrived yet. */
const MENSAJE_RECIBIDA = 'Recibimos tu inscripción.'

function mensajeInscripcion(fila: TallerRow | undefined): string {
  if (fila?.estado_inscripcion === 'aprobado') return MENSAJE_INSCRITO
  if (fila?.estado_inscripcion === 'pendiente') return MENSAJE_PENDIENTE
  return MENSAJE_RECIBIDA
}

export function ExplorarTalleresClient({ talleres }: Input): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  // The edición just enrolled in; its confirmation follows the row's estado.
  const [inscritaId, setInscritaId] = useState<string | null>(null)
  // Partner picker visibility for `tipo === 'pareja'` ediciones.
  const [pickerOpen, setPickerOpen] = useState(false)

  const selected = talleres.find((t) => t.id === selectedId) ?? null

  /** Shared success path for individual and couple enrollments. */
  function confirmarInscripcion(): void {
    setFeedback(null)
    setInscritaId(selected?.id ?? null)
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
    setInscritaId(null)
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

  const aviso =
    feedback ?? (inscritaId ? mensajeInscripcion(talleres.find((t) => t.id === inscritaId)) : null)

  return (
    <>
      {aviso && (
        <TarjetaSistema variante="outlined" className="p-3 text-sm" role="status">
          <TextoSistema>{aviso}</TextoSistema>
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
              className={`w-full rounded-2xl text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selectedId === t.id ? 'ring-2 ring-[var(--brand-primary)]' : ''
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
                        Inscripción hasta el {formatDate(t.cierre_inscripcion)}
                      </TextoSistema>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <BadgeSistema variante={edicionEstadoBadgeVariante(t.estado)}>
                        {edicionEstadoLabel(t.estado)}
                      </BadgeSistema>
                      {t.ya_inscrito &&
                        (t.estado_inscripcion === 'pendiente' ? (
                          <BadgeSistema variante="warning">Pendiente</BadgeSistema>
                        ) : (
                          <BadgeSistema variante="success">Ya inscrito</BadgeSistema>
                        ))}
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
