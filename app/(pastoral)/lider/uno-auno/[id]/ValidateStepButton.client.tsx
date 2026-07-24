"use client"

/**
 * W15 — DT-077 — ValidateStepButton client component.
 *
 * Button for validating a spiritual step in a 1:1 session.
 * POSTs to /api/pastoral/one-on-one/[id]/validate-step.
 * Only visible to mentor official.
 */

'use client'

import React, { useReducer, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface ValidateStepButtonProps {
  readonly oneOnOneId: string
  readonly stepId: string
  readonly onSuccess?: () => void
  readonly onError?: (error: string) => void
}

// ─── State ────────────────────────────────────────────────────────────────────

type ButtonState = {
  readonly isSubmitting: boolean
  readonly isSuccess: boolean
  readonly error?: string
}

type ButtonAction =
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS' }
  | { type: 'SUBMIT_ERROR'; error: string }
  | { type: 'RESET' }

function buttonReducer(state: ButtonState, action: ButtonAction): ButtonState {
  switch (action.type) {
    case 'SUBMIT_START':
      return { isSubmitting: true, isSuccess: false, error: undefined }
    case 'SUBMIT_SUCCESS':
      return { isSubmitting: false, isSuccess: true, error: undefined }
    case 'SUBMIT_ERROR':
      return { isSubmitting: false, isSuccess: false, error: action.error }
    case 'RESET':
      return { isSubmitting: false, isSuccess: false, error: undefined }
    default:
      return state
  }
}

const initialState: ButtonState = {
  isSubmitting: false,
  isSuccess: false,
  error: undefined,
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ValidateStepButton({
  oneOnOneId,
  stepId,
  onSuccess,
  onError,
}: ValidateStepButtonProps) {
  const [state, dispatch] = useReducer(buttonReducer, initialState)
  const router = useRouter()

  const handleValidate = useCallback(async () => {
    dispatch({ type: 'SUBMIT_START' })
    try {
      const res = await fetch(`/api/pastoral/one-on-one/${oneOnOneId}/validate-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error' }))
        dispatch({ type: 'SUBMIT_ERROR', error: err.error ?? 'Error' })
        onError?.(err.error ?? 'Error')
        return
      }

      dispatch({ type: 'SUBMIT_SUCCESS' })
      onSuccess?.()
      router.refresh()
    } catch {
      dispatch({ type: 'SUBMIT_ERROR', error: 'Error de red' })
      onError?.('Error de red')
    }
  }, [oneOnOneId, stepId, onSuccess, onError, router])

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  if (state.isSuccess) {
    return (
      <div className="flex items-center gap-2 p-3 border border-green-200 rounded-lg bg-green-50">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <span className="text-sm font-medium text-green-700">Paso validado exitosamente</span>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 border border-red-200 rounded-lg bg-red-50">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-700">{state.error}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="default"
      onClick={handleValidate}
      disabled={state.isSubmitting}
      aria-label={state.isSubmitting ? 'Validando paso...' : `Validar paso ${stepId}`}
    >
      {state.isSubmitting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : null}
      {state.isSubmitting ? 'Validando...' : `Validar paso`}
    </Button>
  )
}
