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
import {
  BadgeSistema,
  BotonSistema,
  PieAccionesSistema,
  TarjetaSistema,
  TextareaSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { CLASE_BOTON_PELIGRO } from '@/components/pastoral/estilos'
import { CheckCircle2, XCircle } from 'lucide-react'
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
      <TarjetaSistema className="space-y-3 text-center" role="status">
        {state.captureState === 'confirmed' ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden="true" />
        ) : (
          <XCircle className="mx-auto h-12 w-12 text-danger" aria-hidden="true" />
        )}
        <TituloSistema nivel={2}>
          Sesión {state.captureState === 'confirmed' ? 'confirmada' : 'rechazada'}
        </TituloSistema>
        <p className="text-sm text-muted-foreground">
          La sesión ha sido {state.captureState === 'confirmed' ? 'completada' : 'cancelada'} exitosamente.
        </p>
        <BotonSistema onClick={() => router.push('/lider/uno-auno')}>
          Volver al listado
        </BotonSistema>
      </TarjetaSistema>
    )
  }

  return (
    <TarjetaSistema className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TituloSistema nivel={2}>Captura Rápida Post-1:1</TituloSistema>
        <BadgeSistema tamaño="sm" className="font-mono">
          pastoral_one_on_one
        </BadgeSistema>
      </div>

      {/* Note input */}
      <div className="space-y-2">
        <TextareaSistema
          id="captura-nota"
          label="Nota de retroalimentación (opcional)"
          value={state.nota}
          onChange={(e) => dispatch({ type: 'SET_NOTA', nota: e.target.value })}
          placeholder="Observaciones sobre la sesión..."
          filas={4}
          aria-describedby="captura-nota-ayuda"
        />
        <p id="captura-nota-ayuda" className="text-xs text-muted-foreground">
          Máx. 500 caracteres. Esta nota es privada del mentor.
        </p>
      </div>

      {/* Error */}
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      {/* Actions: secondary first, primary last */}
      <PieAccionesSistema fijo={false} className="bg-transparent">
        <BotonSistema
          className={CLASE_BOTON_PELIGRO}
          icono={XCircle}
          cargando={state.isSubmitting}
          onClick={() => handleSubmit('rejected')}
          aria-label="Rechazar sesión"
        >
          Rechazar
        </BotonSistema>
        <BotonSistema
          icono={CheckCircle2}
          cargando={state.isSubmitting}
          onClick={() => handleSubmit('confirmed')}
          aria-label="Confirmar sesión"
        >
          Confirmar sesión
        </BotonSistema>
      </PieAccionesSistema>
    </TarjetaSistema>
  )
}
