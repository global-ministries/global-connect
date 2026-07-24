/**
 * W15 — DT-077 — Tests for ValidateStepButton client component.
 *
 * Button for validating a spiritual step in a 1:1 session.
 * POSTs to /api/pastoral/one-on-one/[id]/validate-step.
 * Only visible to mentor official.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ValidateStepButton from '@/app/(pastoral)/lider/uno-auno/[id]/ValidateStepButton.client'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}))

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, 'aria-label': ariaLabel }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string; 'aria-label'?: string }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} aria-label={ariaLabel}>{children}</button>
  ),
}))

describe('ValidateStepButton', () => {
  const defaultProps = {
    oneOnOneId: '123e4567-e89b-12d3-a456-426614174000',
    stepId: 'primera_conexion',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  describe('Rendering', () => {
    it('renders the validate step button', () => {
      render(<ValidateStepButton {...defaultProps} />)
      expect(screen.getByRole('button', { name: /validar paso/i })).toBeInTheDocument()
    })

    it('renders with correct aria-label including stepId', () => {
      render(<ValidateStepButton {...defaultProps} />)
      const button = screen.getByRole('button', { name: /validar paso primera_conexion/i })
      expect(button).toBeInTheDocument()
    })
  })

  describe('User interaction', () => {
    it('button is enabled by default', () => {
      render(<ValidateStepButton {...defaultProps} />)
      const button = screen.getByRole('button', { name: /validar paso/i })
      expect(button).not.toBeDisabled()
    })
  })

  describe('API submission', () => {
    it('calls POST /api/pastoral/one-on-one/[id]/validate-step on click', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          oneOnOneId: defaultProps.oneOnOneId,
          stepId: defaultProps.stepId,
          validatedAt: new Date().toISOString(),
          validatedBy: 'mentor-id',
        }),
      })

      render(<ValidateStepButton {...defaultProps} />)
      const button = screen.getByRole('button', { name: /validar paso/i })

      await act(async () => {
        fireEvent.click(button)
      })

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/pastoral/one-on-one/${defaultProps.oneOnOneId}/validate-step`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId: defaultProps.stepId }),
        })
      )
    })

    it('shows loading state during submission', async () => {
      ;(global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 100))
      )

      render(<ValidateStepButton {...defaultProps} />)
      const button = screen.getByRole('button', { name: /validar paso/i })

      await act(async () => {
        fireEvent.click(button)
      })

      expect(screen.getByRole('button', { name: /validando/i })).toBeInTheDocument()
    })

    it('shows success message after successful validation', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          oneOnOneId: defaultProps.oneOnOneId,
          stepId: defaultProps.stepId,
          validatedAt: new Date().toISOString(),
        }),
      })

      render(<ValidateStepButton {...defaultProps} />)
      const button = screen.getByRole('button', { name: /validar paso/i })

      await act(async () => {
        fireEvent.click(button)
      })

      await waitFor(() => {
        expect(screen.getByText(/paso validado/i)).toBeInTheDocument()
      })
    })

    it('shows error message on API failure', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Error del servidor' }),
      })

      render(<ValidateStepButton {...defaultProps} />)
      const button = screen.getByRole('button', { name: /validar paso/i })

      await act(async () => {
        fireEvent.click(button)
      })

      await waitFor(() => {
        expect(screen.getByText(/error del servidor/i)).toBeInTheDocument()
      })
    })

    it('button is disabled while submitting', async () => {
      ;(global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 100))
      )

      render(<ValidateStepButton {...defaultProps} />)
      const button = screen.getByRole('button', { name: /validar paso/i })

      await act(async () => {
        fireEvent.click(button)
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /validando/i })).toBeDisabled()
      })
    })

    it('allows retry after error', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Error del servidor' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ oneOnOneId: defaultProps.oneOnOneId, stepId: defaultProps.stepId }),
        })

      render(<ValidateStepButton {...defaultProps} />)

      // First attempt fails
      const button = screen.getByRole('button', { name: /validar paso/i })

      await act(async () => {
        fireEvent.click(button)
      })

      await waitFor(() => {
        expect(screen.getByText(/error del servidor/i)).toBeInTheDocument()
      })

      // Retry - click Reintentar then click the button again
      const retryButton = screen.getByRole('button', { name: /reintentar/i })

      await act(async () => {
        fireEvent.click(retryButton)
      })

      // After reset, button should be visible again
      const buttonAgain = screen.getByRole('button', { name: /validar paso/i })

      await act(async () => {
        fireEvent.click(buttonAgain)
      })

      await waitFor(() => {
        expect(screen.getByText(/paso validado/i)).toBeInTheDocument()
      })
    })
  })
})
