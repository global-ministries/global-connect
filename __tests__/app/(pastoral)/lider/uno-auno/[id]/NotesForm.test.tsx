/**
 * W15 — DT-076 — Tests for NotesForm client component.
 *
 * Client component for adding private notes to a 1:1 session.
 * POSTs to /api/pastoral/one-on-one/[id]/notes.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NotesForm from '@/app/(pastoral)/lider/uno-auno/[id]/NotesForm.client'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}))

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, 'aria-label': ariaLabel }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; 'aria-label'?: string }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>{children}</button>
  ),
}))

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, 'aria-label': ariaLabel, disabled }: { value: string; onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string; 'aria-label'?: string; disabled?: boolean }) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} aria-label={ariaLabel} disabled={disabled} />
  ),
}))

describe('NotesForm', () => {
  const defaultProps = {
    oneOnOneId: '123e4567-e89b-12d3-a456-426614174000',
    mentorPersonaId: '22222222-2222-2222-2222-222222222222',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  describe('Rendering', () => {
    it('renders the form with textarea and submit button', () => {
      render(<NotesForm {...defaultProps} />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /agregar nota/i })).toBeInTheDocument()
    })

    it('renders placeholder text', () => {
      render(<NotesForm {...defaultProps} />)
      expect(screen.getByPlaceholderText(/nota privada/i)).toBeInTheDocument()
    })
  })

  describe('User interaction', () => {
    it('allows typing in textarea', () => {
      render(<NotesForm {...defaultProps} />)
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Esta es una nota de prueba' } })
      expect(textarea).toHaveValue('Esta es una nota de prueba')
    })

    it('button is disabled when textarea is empty', () => {
      render(<NotesForm {...defaultProps} />)
      const button = screen.getByRole('button', { name: /agregar nota/i })
      expect(button).toBeDisabled()
    })

    it('button is enabled when textarea has content', () => {
      render(<NotesForm {...defaultProps} />)
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Nota con contenido' } })
      const button = screen.getByRole('button', { name: /agregar nota/i })
      expect(button).not.toBeDisabled()
    })
  })

  describe('API submission', () => {
    it('calls POST /api/pastoral/one-on-one/[id]/notes on submit', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'nota-id', contenido: 'Nota de prueba' }),
      })

      render(<NotesForm {...defaultProps} />)
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Nota de prueba' } })

      const button = screen.getByRole('button', { name: /agregar nota/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/pastoral/one-on-one/${defaultProps.oneOnOneId}/notes`,
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contenido: 'Nota de prueba' }),
          })
        )
      })
    })

    it('shows loading state during submission', async () => {
      ;(global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 100))
      )

      render(<NotesForm {...defaultProps} />)
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Nota de prueba' } })

      const button = screen.getByRole('button', { name: /agregar nota/i })
      fireEvent.click(button)

      expect(screen.getByRole('button', { name: /agregando/i })).toBeInTheDocument()
    })

    it('shows success message after successful submission', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'nota-id', contenido: 'Nota de prueba' }),
      })

      render(<NotesForm {...defaultProps} />)
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Nota de prueba' } })

      const button = screen.getByRole('button', { name: /agregar nota/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText(/nota agregada/i)).toBeInTheDocument()
      })
    })

    it('shows error message on API failure', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Error del servidor' }),
      })

      render(<NotesForm {...defaultProps} />)
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Nota de prueba' } })

      const button = screen.getByRole('button', { name: /agregar nota/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/error del servidor/i)
      })
    })

    it('resets form and hides success message on dismiss', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'nota-id' }),
      })

      render(<NotesForm {...defaultProps} />)
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Nota de prueba' } })

      const button = screen.getByRole('button', { name: /agregar nota/i })
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText(/nota agregada/i)).toBeInTheDocument()
      })

      const dismissButton = screen.getByRole('button', { name: /agregar otra nota/i })
      fireEvent.click(dismissButton)

      expect(screen.queryByText(/nota agregada/i)).not.toBeInTheDocument()
      const textareaAfterDismiss = screen.getByRole('textbox')
      expect(textareaAfterDismiss).toHaveValue('')
    })
  })
})
