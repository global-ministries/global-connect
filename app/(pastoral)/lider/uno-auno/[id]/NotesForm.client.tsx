"use client"

/**
 * W15 — DT-076 — NotesForm client component.
 *
 * Client component for adding private notes to a 1:1 session.
 * POSTs to /api/pastoral/one-on-one/[id]/notes.
 * Only visible to mentor official.
 */

'use client'

import React, { useReducer, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, CheckCircle2 } from 'lucide-react'

interface NotesFormProps {
  readonly oneOnOneId: string
  readonly mentorPersonaId: string
}

// ─── State ────────────────────────────────────────────────────────────────────

type FormState = {
  readonly contenido: string
  readonly isSubmitting: boolean
  readonly submitted: boolean
  readonly error?: string
}

type FormAction =
  | { type: 'SET_CONTENIDO'; contenido: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS' }
  | { type: 'SUBMIT_ERROR'; error: string }
  | { type: 'DISMISS_SUCCESS' }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_CONTENIDO':
      return { ...state, contenido: action.contenido }
    case 'SUBMIT_START':
      return { ...state, isSubmitting: true, error: undefined }
    case 'SUBMIT_SUCCESS':
      return { ...state, isSubmitting: false, submitted: true, contenido: '' }
    case 'SUBMIT_ERROR':
      return { ...state, isSubmitting: false, error: action.error }
    case 'DISMISS_SUCCESS':
      return { ...state, submitted: false }
    default:
      return state
  }
}

const initialState: FormState = {
  contenido: '',
  isSubmitting: false,
  submitted: false,
  error: undefined,
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NotesForm({ oneOnOneId }: NotesFormProps) {
  const [state, dispatch] = useReducer(formReducer, initialState)
  const router = useRouter()

  const handleSubmit = useCallback(async () => {
    if (!state.contenido.trim()) return

    dispatch({ type: 'SUBMIT_START' })
    try {
      const res = await fetch(`/api/pastoral/one-on-one/${oneOnOneId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido: state.contenido }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error' }))
        dispatch({ type: 'SUBMIT_ERROR', error: err.error ?? 'Error' })
        return
      }

      dispatch({ type: 'SUBMIT_SUCCESS' })
      router.refresh()
    } catch {
      dispatch({ type: 'SUBMIT_ERROR', error: 'Error de red' })
    }
  }, [oneOnOneId, state.contenido, router])

  const handleDismiss = useCallback(() => {
    dispatch({ type: 'DISMISS_SUCCESS' })
  }, [])

  if (state.submitted) {
    return (
      <div className="space-y-3 p-4 border border-green-200 rounded-lg bg-green-50">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm font-medium">Nota agregada exitosamente</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleDismiss}>
          Agregar otra nota
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={state.contenido}
        onChange={(e) => dispatch({ type: 'SET_CONTENIDO', contenido: e.target.value })}
        placeholder="Nota privada para esta sesión..."
        aria-label="Nota privada"
        rows={3}
        disabled={state.isSubmitting}
      />

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!state.contenido.trim() || state.isSubmitting}
        aria-label={state.isSubmitting ? 'Agregando nota...' : 'Agregar nota'}
      >
        {state.isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        {state.isSubmitting ? 'Agregando...' : 'Agregar nota'}
      </Button>
    </div>
  )
}
