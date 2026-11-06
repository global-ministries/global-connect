/**
 * app/(auth)/error.tsx — the error boundary of the authenticated area: a
 * dropped connection (ERR_HTTP2_PING_FAILED → "TypeError: network error")
 * shows a retry notice inside the app shell instead of Next.js' black
 * "Application error" screen.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import ErrorAutenticado from '@/app/(auth)/error'

const refresh = jest.fn()
const captureException = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, replace: jest.fn(), push: jest.fn() }),
}))

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

const recargar = jest.fn()

jest.mock('@/lib/navegador/recargar', () => ({
  recargarPagina: () => recargar(),
}))

beforeEach(() => {
  refresh.mockClear()
  captureException.mockClear()
  recargar.mockClear()
})

function errorDeRed(digest?: string): Error & { digest?: string } {
  const error: Error & { digest?: string } = new TypeError('network error')
  if (digest) error.digest = digest
  return error
}

describe('app/(auth)/error.tsx', () => {
  it('explains the problem and reports the error to Sentry once', () => {
    const error = errorDeRed()
    render(<ErrorAutenticado error={error} reset={jest.fn()} />)
    expect(screen.getByText('No pudimos cargar esta pantalla')).toBeInTheDocument()
    expect(
      screen.getByText('Puede ser un problema de conexión. Revisa tu internet e inténtalo de nuevo.'),
    ).toBeInTheDocument()
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(error)
  })

  it('"Reintentar" resets the boundary and asks the server for fresh data', () => {
    const reset = jest.fn()
    render(<ErrorAutenticado error={errorDeRed()} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(recargar).not.toHaveBeenCalled()
  })

  it('"Recargar página" reloads the whole page', () => {
    render(<ErrorAutenticado error={errorDeRed()} reset={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recargar página' }))
    expect(recargar).toHaveBeenCalledTimes(1)
  })

  it('shows the error code only when Next.js gives one', () => {
    const { rerender } = render(<ErrorAutenticado error={errorDeRed()} reset={jest.fn()} />)
    expect(screen.queryByText(/^Código:/)).not.toBeInTheDocument()
    rerender(<ErrorAutenticado error={errorDeRed('abc123')} reset={jest.fn()} />)
    expect(screen.getByText('Código: abc123')).toBeInTheDocument()
  })
})
