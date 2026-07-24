"use client"

/**
 * W13 — DT-078 — Quick capture form post-1:1.
 *
 * Client component for the capture form.
 * POSTs to the complete endpoint with capture state + notes.
 */

'use client'

import React, { useReducer, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { CaptureUXState } from '@/lib/platform/pastoral/capture-ux/pastoral-capture-ux'

interface CapturaFormProps {
  readonly oneOnOneId: string
  readonly mentorPersonaId: string
  readonly assistedPersonaId: string
}

// ─── State ────────────────────────────────────────────────────────────────────

type FormState = {
  readonly captureState: CaptureUXState
  readonly nota: string
  readonly isSubmitting: boolean
  readonly submitted: boolean
  readonly error?: string
}

type FormAction =
  | { type: 'SET_NOTA'; nota: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; state: CaptureUXState }
  | { type: 'SUBMIT_ERROR'; error: string }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_NOTA':
      return { ...state, nota: action.nota }
    case 'SUBMIT_START':
      return { ...state, isSubmitting: true, error: undefined }
    case 'SUBMIT_SUCCESS':
      return { ...state, isSubmitting: false, submitted: true, captureState: action.state }
    case 'SUBMIT_ERROR':
      return { ...state, isSubmitting: false, error: action.error }
    default:
      return state
  }
}

const initialState: FormState = {
  captureState: 'idle',
  nota: '',
  isSubmitting: false,
  submitted: false,
  error: undefined,
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<CaptureUXState, string> = {
  idle: 'Iniciar captura',
  in_progress: 'En captura',
  awaiting_resolution: 'Esperando confirmación',
  confirmed: 'Confirmado',
  overridden: 'Anulado',
  rejected: 'Rechazado',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CapturaForm({ oneOnOneId, mentorPersonaId, assistedPersonaId }: CapturaFormProps) {
  const [state, dispatch] = useReducer(formReducer, initialState)
  const router = useRouter()

  const handleSubmit = useCallback(
    async (targetState: 'confirmed' | 'rejected') => {
      dispatch({ type: 'SUBMIT_START' })
      try {
        const res = await fetch(`/api/pastoral/one-on-one/${oneOnOneId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            capture_state: targetState,
            feedback: state.nota || undefined,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Error' }))
          dispatch({ type: 'SUBMIT_ERROR', error: err.error ?? 'Error' })
          return
        }
        dispatch({ type: 'SUBMIT_SUCCESS', state: targetState })
      } catch {
        dispatch({ type: 'SUBMIT_ERROR', error: 'Error de red' })
      }
    },
    [oneOnOneId, state.nota]
  )

  if (state.submitted) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          {state.captureState === 'confirmed' ? (
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
          ) : (
            <XCircle className="h-12 w-12 text-red-600 mx-auto" />
          )}
          <CardTitle>
            Sesión {state.captureState === 'confirmed' ? 'confirmada' : 'rechazada'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            La sesión ha sido {state.captureState === 'confirmed' ? 'completada' : 'cancelada'} exitosamente.
          </p>
          <Button onClick={() => router.push('/lider/uno-auno')}>
            Volver al listado
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Captura Rápida Post-1:1</CardTitle>
          <Badge variant="outline" className="text-xs">
            pastoral_one_on_one
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Note input */}
        <div className="space-y-2">
          <label htmlFor="captura-nota" className="text-sm font-medium">
            Nota de retroalimentación (opcional)
          </label>
          <Textarea
            id="captura-nota"
            value={state.nota}
            onChange={(e) => dispatch({ type: 'SET_NOTA', nota: e.target.value })}
            placeholder="Observaciones sobre la sesión..."
            rows={4}
            aria-label="Nota de retroalimentación"
          />
          <p className="text-xs text-muted-foreground">
            Máx. 500 caracteres. Esta nota es privada del mentor.
          </p>
        </div>

        {/* Error */}
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="default"
            disabled={state.isSubmitting}
            onClick={() => handleSubmit('confirmed')}
            aria-label="Confirmar sesión"
          >
            {state.isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Confirmar sesión
          </Button>
          <Button
            variant="destructive"
            disabled={state.isSubmitting}
            onClick={() => handleSubmit('rejected')}
            aria-label="Rechazar sesión"
          >
            {state.isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Rechazar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
