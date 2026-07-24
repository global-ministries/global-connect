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
import {
  CaptureUXState,
  PASTORAL_CAPTURE_UX_SHAPE,
  PastoralCaptureContext,
  canTransitionUX,
  isTerminal,
  buildPastoralCaptureOutput,
} from '@/lib/platform/pastoral/capture-ux/pastoral-capture-ux'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
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
  in_progress: <Loader2 className="h-4 w-4 animate-spin" />,
  awaiting_resolution: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
  confirmed: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  overridden: <AlertTriangle className="h-4 w-4 text-orange-600" />,
  rejected: <XCircle className="h-4 w-4 text-red-600" />,
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
  const availableActions: { to: CaptureUXState; label: string; variant: 'default' | 'destructive' | 'outline' }[] = []
  if (state.captureState === 'in_progress' || state.captureState === 'awaiting_resolution') {
    availableActions.push({ to: 'confirmed', label: 'Confirmar', variant: 'default' })
    availableActions.push({ to: 'rejected', label: 'Rechazar', variant: 'destructive' })
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
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between"
          aria-label={state.isOpen ? 'Cerrar panel del mentor' : 'Abrir panel del mentor'}
        >
          <span className="flex items-center gap-2">
            Panel del Mentor
            {state.captureState !== 'idle' && (
              <Badge variant="secondary" className="text-xs">
                {STATE_LABELS[state.captureState]}
              </Badge>
            )}
          </span>
          {state.isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Captura Rápida 1:1</CardTitle>
              <Badge variant="outline" className="text-xs">
                {PASTORAL_CAPTURE_UX_SHAPE}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current state indicator */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              {STATE_ICON[state.captureState]}
              <span className="text-sm font-medium">
                {STATE_LABELS[state.captureState]}
              </span>
            </div>

            {/* Context info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>ID Sesión: <span className="font-mono">{oneOnOneId.slice(0, 8)}…</span></p>
              <p>Contexto: <span className="font-medium text-foreground">{captureContext.oneOnOneId ? 'pastoral_one_on_one' : '—'}</span></p>
            </div>

            {/* Feedback input when rejecting */}
            {state.captureState === 'in_progress' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Nota de retroalimentación (opcional)</label>
                <textarea
                  className="w-full min-h-[60px] px-3 py-2 text-sm border border-border rounded-lg bg-card"
                  placeholder="Observaciones de la sesión..."
                  onChange={(e) => dispatch({ type: 'TRANSITION', to: state.captureState, feedback: e.target.value })}
                  aria-label="Retroalimentación de la sesión"
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {availableActions.map(({ to, label, variant }) => (
                <Button
                  key={to}
                  variant={variant}
                  size="sm"
                  disabled={!canTransition(to) || state.isSubmitting}
                  onClick={() => transitionTo(to, state.feedback)}
                  aria-label={label}
                >
                  {state.isSubmitting && canTransition(to) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {label}
                </Button>
              ))}
              {state.captureState !== 'idle' && !isTerminal(state.captureState) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: 'CLOSE' })}
                  aria-label="Cancelar"
                >
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  )
}
