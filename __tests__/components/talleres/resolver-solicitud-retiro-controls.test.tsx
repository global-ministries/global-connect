/**
 * Tests for the `<ResolverSolicitudRetiroControls>` client component.
 *
 * The component takes both server actions as props (`onAprobar`,
 * `onRechazar`) so the tests pass jest mocks directly. Both actions are
 * consequential (aprobar executes a REAL withdrawal; rechazar closes the
 * request), so each is behind a confirm gate — a single click never
 * resolves a solicitud.
 *
 * Verifies:
 *   - Initial state renders "Aprobar" + "Rechazar", no confirm controls.
 *   - Clicking "Aprobar" reveals the aprobar confirm gate WITHOUT calling
 *     the action; confirming then calls onAprobar(solicitudId).
 *   - Clicking "Rechazar" reveals the rechazar confirm gate WITHOUT
 *     calling the action; confirming then calls onRechazar(solicitudId).
 *   - Success → role="status"; failure → role="alert".
 *   - Cancel resets to the initial state and calls no action.
 *   - The confirm button is disabled while the transition is pending.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

import { ResolverSolicitudRetiroControls } from '@/components/talleres/resolver-solicitud-retiro-controls'

const SOLICITUD_ID = 'sol-1'

function okAction(message = 'OK') {
  return jest.fn(async () => ({ ok: true as const, message }))
}

describe('ResolverSolicitudRetiroControls — initial state', () => {
  it('renders Aprobar + Rechazar and no confirm controls', () => {
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={okAction()}
        onRechazar={okAction()}
      />,
    )
    expect(screen.getByRole('button', { name: /^aprobar$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^rechazar$/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /confirmar/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /cancelar/i }),
    ).not.toBeInTheDocument()
  })
})

describe('ResolverSolicitudRetiroControls — aprobar', () => {
  it('reveals the confirm gate on first click without calling the action', () => {
    const onAprobar = okAction()
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={onAprobar}
        onRechazar={okAction()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^aprobar$/i }))
    expect(
      screen.getByRole('button', { name: /confirmar aprobaci/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    expect(onAprobar).not.toHaveBeenCalled()
  })

  it('calls onAprobar with the solicitudId when confirmed', async () => {
    const onAprobar = okAction('Solicitud aprobada.')
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={onAprobar}
        onRechazar={okAction()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^aprobar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar aprobaci/i }))
    await waitFor(() =>
      expect(onAprobar).toHaveBeenCalledWith(SOLICITUD_ID),
    )
  })

  it('surfaces success feedback via role=status', async () => {
    const onAprobar = okAction('Solicitud aprobada.')
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={onAprobar}
        onRechazar={okAction()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^aprobar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar aprobaci/i }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Solicitud aprobada.'),
    )
  })

  it('surfaces error feedback via role=alert', async () => {
    const onAprobar = jest.fn(async () => ({
      ok: false as const,
      error: 'FORBIDDEN' as const,
      message: 'No autorizado',
    }))
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={onAprobar}
        onRechazar={okAction()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^aprobar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar aprobaci/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No autorizado'),
    )
  })

  it('disables the confirm button while pending', async () => {
    let resolveAprobar!: (v: { ok: true; message: string }) => void
    const onAprobar = jest.fn(
      () =>
        new Promise<{ ok: true; message: string }>((resolve) => {
          resolveAprobar = resolve
        }),
    )
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={onAprobar}
        onRechazar={okAction()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^aprobar$/i }))
    const confirmBtn = screen.getByRole('button', { name: /confirmar aprobaci/i })
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(confirmBtn).toBeDisabled())
    resolveAprobar({ ok: true, message: 'OK' })
  })

  it('cancels the aprobar gate without calling the action', () => {
    const onAprobar = okAction()
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={onAprobar}
        onRechazar={okAction()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^aprobar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.getByRole('button', { name: /^aprobar$/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /confirmar aprobaci/i }),
    ).not.toBeInTheDocument()
    expect(onAprobar).not.toHaveBeenCalled()
  })
})

describe('ResolverSolicitudRetiroControls — rechazar', () => {
  it('reveals the confirm gate on first click without calling the action', () => {
    const onRechazar = okAction()
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={okAction()}
        onRechazar={onRechazar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^rechazar$/i }))
    expect(
      screen.getByRole('button', { name: /confirmar rechazo/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    expect(onRechazar).not.toHaveBeenCalled()
  })

  it('calls onRechazar with the solicitudId when confirmed', async () => {
    const onRechazar = okAction('Solicitud rechazada.')
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={okAction()}
        onRechazar={onRechazar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^rechazar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar rechazo/i }))
    await waitFor(() =>
      expect(onRechazar).toHaveBeenCalledWith(SOLICITUD_ID),
    )
  })

  it('surfaces success feedback via role=status', async () => {
    const onRechazar = okAction('Solicitud rechazada.')
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={okAction()}
        onRechazar={onRechazar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^rechazar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar rechazo/i }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Solicitud rechazada.'),
    )
  })

  it('cancels the rechazar gate without calling the action', () => {
    const onRechazar = okAction()
    render(
      <ResolverSolicitudRetiroControls
        solicitudId={SOLICITUD_ID}
        onAprobar={okAction()}
        onRechazar={onRechazar}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^rechazar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.getByRole('button', { name: /^rechazar$/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /confirmar rechazo/i }),
    ).not.toBeInTheDocument()
    expect(onRechazar).not.toHaveBeenCalled()
  })
})
