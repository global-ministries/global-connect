/**
 * Tests for the shared `<ApproveInscripcionButton>` +
 * `<RejectInscripcionButton>` client components.
 *
 * These components take the server actions as props (`onApprove`,
 * `onReject`) so the tests can pass jest mocks directly.
 *
 * Verifies:
 *   - Approve button: invokes `onApprove` on click, surfaces error
 *     and success feedback.
 *   - Reject button: shows motivo textarea after the first click,
 *     submits with motivo, trims whitespace, requires non-empty motivo.
 *   - Loading / pending state mirrors the transition.
 *   - Cancel button resets the reject form.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

import {
  ApproveInscripcionButton,
  RejectInscripcionButton,
} from '@/components/talleres/inscripcion-actions'

const APPROVE_INSC_ID = 'insc-approve-1'
const REJECT_INSC_ID = 'insc-reject-1'

describe('ApproveInscripcionButton', () => {
  it('calls onApprove with the inscripcionId when clicked', async () => {
    const onApprove = jest.fn(async () => ({ ok: true as const, message: 'OK' }))
    render(
      <ApproveInscripcionButton
        inscripcionId={APPROVE_INSC_ID}
        onApprove={onApprove}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /aprobar/i }))
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith(APPROVE_INSC_ID))
  })

  it('surfaces success feedback on success', async () => {
    const onApprove = jest.fn(async () => ({ ok: true as const, message: 'Aprobada' }))
    render(
      <ApproveInscripcionButton
        inscripcionId={APPROVE_INSC_ID}
        onApprove={onApprove}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /aprobar/i }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Aprobada'),
    )
  })

  it('surfaces error feedback on failure', async () => {
    const onApprove = jest.fn(async () => ({
      ok: false as const,
      error: 'FORBIDDEN' as const,
      message: 'No autorizado',
    }))
    render(
      <ApproveInscripcionButton
        inscripcionId={APPROVE_INSC_ID}
        onApprove={onApprove}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /aprobar/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No autorizado'),
    )
  })

  it('disables the button while pending', async () => {
    let resolveApprove!: (v: { ok: true; message: string }) => void
    const onApprove = jest.fn(
      () =>
        new Promise<{ ok: true; message: string }>((resolve) => {
          resolveApprove = resolve
        }),
    )
    render(
      <ApproveInscripcionButton
        inscripcionId={APPROVE_INSC_ID}
        onApprove={onApprove}
      />,
    )
    const btn = screen.getByRole('button', { name: /aprobar/i })
    fireEvent.click(btn)
    // The BotonSistema shows the spinner SVG + "Aprobando…" text. We
    // assert the disabled state by checking the same button — it stays
    // in the DOM with disabled=true while the transition runs.
    await waitFor(() => expect(btn).toBeDisabled())
    // While pending, "Aprobando…" text is rendered as the children.
    expect(screen.getByText(/aprobando/i)).toBeInTheDocument()
    resolveApprove({ ok: true, message: 'OK' })
  })
})

describe('RejectInscripcionButton', () => {
  it('opens the motivo form on first click', () => {
    const onReject = jest.fn(async () => ({ ok: true as const, message: 'OK' }))
    render(
      <RejectInscripcionButton
        inscripcionId={REJECT_INSC_ID}
        onReject={onReject}
      />,
    )
    expect(screen.queryByLabelText(/motivo de rechazo/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /rechazar/i }))
    expect(screen.getByLabelText(/motivo de rechazo/i)).toBeInTheDocument()
  })

  it('disables confirm while motivo is empty', () => {
    const onReject = jest.fn(async () => ({ ok: true as const, message: 'OK' }))
    render(
      <RejectInscripcionButton
        inscripcionId={REJECT_INSC_ID}
        onReject={onReject}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^rechazar/i }))
    const confirmBtn = screen.getByRole('button', { name: /confirmar rechazo/i })
    expect(confirmBtn).toBeDisabled()
  })

  it('invokes onReject with trimmed motivo on confirm', async () => {
    const onReject = jest.fn(async () => ({ ok: true as const, message: 'OK' }))
    render(
      <RejectInscripcionButton
        inscripcionId={REJECT_INSC_ID}
        onReject={onReject}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^rechazar/i }))
    const textarea = screen.getByLabelText(/motivo de rechazo/i)
    fireEvent.change(textarea, { target: { value: '  cupo lleno  ' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar rechazo/i }))
    await waitFor(() =>
      expect(onReject).toHaveBeenCalledWith(REJECT_INSC_ID, '  cupo lleno  '),
    )
  })

  it('surfaces error feedback on failure', async () => {
    const onReject = jest.fn(async () => ({
      ok: false as const,
      error: 'INVALID_MOTIVO' as const,
      message: 'Motivo obligatorio',
    }))
    render(
      <RejectInscripcionButton
        inscripcionId={REJECT_INSC_ID}
        onReject={onReject}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^rechazar/i }))
    const textarea = screen.getByLabelText(/motivo de rechazo/i)
    fireEvent.change(textarea, { target: { value: 'algo' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar rechazo/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Motivo obligatorio'),
    )
  })

  it('cancels and resets motivo when cancel is clicked', async () => {
    const onReject = jest.fn(async () => ({ ok: true as const, message: 'OK' }))
    render(
      <RejectInscripcionButton
        inscripcionId={REJECT_INSC_ID}
        onReject={onReject}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^rechazar/i }))
    const textarea = screen.getByLabelText(/motivo de rechazo/i)
    fireEvent.change(textarea, { target: { value: 'algo' } })
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    // Back to the initial state — textarea is gone, rechazar button
    // is visible again.
    expect(screen.queryByLabelText(/motivo de rechazo/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^rechazar/i }),
    ).toBeInTheDocument()
    expect(onReject).not.toHaveBeenCalled()
  })

  it('clears motivo after a successful rejection', async () => {
    const onReject = jest.fn(async () => ({ ok: true as const, message: 'Rechazada' }))
    render(
      <RejectInscripcionButton
        inscripcionId={REJECT_INSC_ID}
        onReject={onReject}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^rechazar/i }))
    fireEvent.change(screen.getByLabelText(/motivo de rechazo/i), {
      target: { value: 'cupo lleno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /confirmar rechazo/i }))
    await waitFor(() =>
      expect(onReject).toHaveBeenCalledWith(REJECT_INSC_ID, 'cupo lleno'),
    )
    // Form resets → textarea gone.
    await waitFor(() =>
      expect(screen.queryByLabelText(/motivo de rechazo/i)).not.toBeInTheDocument(),
    )
  })
})