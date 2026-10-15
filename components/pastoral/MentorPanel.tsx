"use client"

/**
 * W13 — DT-078 — MentorPanel component.
 *
 * Hidden mentor panel for quick-capture post-1:1.
 * Reuses CAPTURE_UX_STATES (6 states from operating-core) with
 * CAPTURE_UX_SHAPE = 'pastoral_one_on_one' (D22).
 *
 * Byte-identity: does NOT edit capture-ux-types.ts or capture-ux-state.ts.
 * Uses the sibling pastoral-capture-ux.ts which re-exports from protected modules.
 *
 * States:
 * - idle: panel closed
 * - in_progress: mentor is capturing
 * - awaiting_resolution: waiting for assisted confirmation
 * - confirmed: capture confirmed by mentor
 * - overridden: mentor overrode default
 * - rejected: mentor rejected the capture
 */

'use client'

import React, { useReducer, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CaptureUXState, PASTORAL_CAPTURE_UX_SHAPE, PastoralCaptureContext, canTransitionUX, isTerminal } from '@/lib/platform/pastoral/capture-ux/pastoral-capture-ux'
import { BadgeSistema, BotonSistema, TarjetaSistema, TextareaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CLASE_BOTON_PELIGRO } from './estilos'
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react'

// ─── Props ────────────────────────────────────────────────────────────────────

interface MentorPanelProps {
  readonly oneOnOneId: string
  readonly mentorPersonaId: string
  readonly assistedPersonaId: string
  readonly sessionAtIso?: string
  readonly onCaptureComplete?: (output: { state: CaptureUXState }) => void
  readonly className?: string
}

// ─── State ────────────────────────────────────────────────────────────────────

interface PanelState {
  readonly captureState: CaptureUXState
  readonly isOpen: boolean
  readonly feedback?: string
  readonly isSubmitting: boolean
}

type PanelAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'TRANSITION'; to: CaptureUXState; feedback?: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_DONE' }

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, isOpen: true, captureState: 'in_progress' }
    case 'CLOSE':
      return { ...state, isOpen: false, captureState: 'idle', feedback: undefined }
    case 'TRANSITION':
      return {
        ...state,
        captureState: action.to,
        feedback: action.feedback,
        isSubmitting: false,
      }
    case 'SUBMIT_START':
      return { ...state, isSubmitting: true }
    case 'SUBMIT_DONE':
      return { ...state, isSubmitting: false }
    default:
      return state
  }
}

const initialState: PanelState = {
  captureState: 'idle',
  isOpen: false,
  feedback: undefined,
  isSubmitting: false,
}

// ─── State labels ────────────────────────────────────────────────────────────

const STATE_LABELS: Record<CaptureUXState, string> = {
  idle: 'Cerrado',
  in_progress: 'Capturando',
  awaiting_resolution: 'Esperando confirmación',
  confirmed: 'Confirmado',
  overridden: 'Anulado',
  rejected: 'Rechazado',
}

const STATE_ICON: Record<CaptureUXState, React.ReactNode> = {
  idle: null,
  in_progress: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />,
  awaiting_resolution: <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />,
  confirmed: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />,
  overridden: <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />,
  rejected: <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />,
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MentorPanel({
  oneOnOneId,
  mentorPersonaId,
  assistedPersonaId,
  sessionAtIso,
  onCaptureComplete,
  className,
}: MentorPanelProps) {
  const [state, dispatch] = useReducer(panelReducer, initialState)
  const router = useRouter()

  // Build the pastoral capture context
  const captureContext: PastoralCaptureContext = {
    oneOnOneId,
    mentorPersonaId,
    assistedPersonaId,
    sessionAtIso,
  }

  // Check if a transition is valid
  const canTransition = useCallback(
    (to: CaptureUXState) => canTransitionUX(state.captureState, to),
    [state.captureState]
  )

  // Handle transition
  const transitionTo = useCallback(
    async (to: CaptureUXState, feedback?: string) => {
      if (!canTransition(to)) return

      dispatch({ type: 'SUBMIT_START' })

      // POST to the complete endpoint with the capture state
      try {
        const res = await fetch(`/api/pastoral/one-on-one/${oneOnOneId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ capture_state: to, feedback }),
        })
        if (!res.ok) throw new Error('Failed to transition')
        dispatch({ type: 'TRANSITION', to, feedback })
        if (isTerminal(to)) {
          onCaptureComplete?.({ state: to })
        }
      } catch {
        dispatch({ type: 'SUBMIT_DONE' })
      }
    },
    [canTransition, oneOnOneId, onCaptureComplete]
  )

  // Available actions based on current state
  const availableActions: { to: CaptureUXState; label: string; variant: 'primario' | 'peligro' | 'outline' }[] = []
  if (state.captureState === 'in_progress' || state.captureState === 'awaiting_resolution') {
    availableActions.push({ to: 'confirmed', label: 'Confirmar', variant: 'primario' })
    availableActions.push({ to: 'rejected', label: 'Rechazar', variant: 'peligro' })
  }
  if (state.captureState === 'confirmed') {
    availableActions.push({ to: 'overridden', label: 'Anular', variant: 'outline' })
  }

  return (
    <Collapsible
      open={state.isOpen}
      onOpenChange={(open) => dispatch({ type: open ? 'OPEN' : 'CLOSE' })}
      className={className}
    >
      <CollapsibleTrigger asChild>
        <BotonSistema
          variante="outline"
          className="w-full justify-between"
          aria-label={state.isOpen ? 'Cerrar panel del mentor' : 'Abrir panel del mentor'}
        >
          <span className="flex min-w-0 items-center gap-2">
            Panel del Mentor
            {state.captureState !== 'idle' && (
              <BadgeSistema tamaño="sm">
                {STATE_LABELS[state.captureState]}
              </BadgeSistema>
            )}
          </span>
          {state.isOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </BotonSistema>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        <TarjetaSistema className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <TituloSistema nivel={3}>Captura Rápida 1:1</TituloSistema>
            <BadgeSistema tamaño="sm" className="font-mono">
              {PASTORAL_CAPTURE_UX_SHAPE}
            </BadgeSistema>
          </div>

          {/* Current state indicator */}
          <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3">
            {STATE_ICON[state.captureState]}
            <span className="text-sm font-medium">
              {STATE_LABELS[state.captureState]}
            </span>
          </div>

          {/* Context info */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>ID Sesión: <span className="font-mono">{oneOnOneId.slice(0, 8)}…</span></p>
            <p>Contexto: <span className="font-medium text-foreground">{captureContext.oneOnOneId ? 'pastoral_one_on_one' : '—'}</span></p>
          </div>

          {/* Feedback input when rejecting */}
          {state.captureState === 'in_progress' && (
            <TextareaSistema
              label="Nota de retroalimentación (opcional)"
              placeholder="Observaciones de la sesión..."
              onChange={(e) => dispatch({ type: 'TRANSITION', to: state.captureState, feedback: e.target.value })}
            />
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {availableActions.map(({ to, label, variant }) => (
              <BotonSistema
                key={to}
                variante={variant === 'peligro' ? 'primario' : variant}
                className={variant === 'peligro' ? CLASE_BOTON_PELIGRO : undefined}
                disabled={!canTransition(to) || state.isSubmitting}
                cargando={state.isSubmitting && canTransition(to)}
                onClick={() => transitionTo(to, state.feedback)}
              >
                {label}
              </BotonSistema>
            ))}
            {state.captureState !== 'idle' && !isTerminal(state.captureState) && (
              <BotonSistema
                variante="ghost"
                onClick={() => dispatch({ type: 'CLOSE' })}
              >
                Cancelar
              </BotonSistema>
            )}
          </div>
        </TarjetaSistema>
      </CollapsibleContent>
    </Collapsible>
  )
}
