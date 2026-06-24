import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectorPropietarioCasa } from '@/components/grupos-vida/selector-propietario-casa'

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div data-testid="selector-dialog-content" className={className}>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

jest.mock('@/components/ui/UserAvatar', () => ({
  UserAvatar: ({ nombre }: { nombre: string }) => <span data-testid="avatar">{nombre}</span>,
}))

jest.mock('@/components/ui/sistema-diseno', () => ({
  BadgeSistema: ({ children, variante }: { children: React.ReactNode; variante?: string }) => <span data-variant={variante}>{children}</span>,
  BotonSistema: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  InputSistema: ({ icono: _icono, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icono?: unknown; label: string }) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
}))

describe('SelectorPropietarioCasa', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usuarios: [
          {
            value: 'user-unavailable',
            label: 'Demo Ocupado',
            email: 'ocupado.con.un.correo.excesivamente.largo@example.com',
            cedula: 'V-12345678901234567890',
            yaTieneCasa: true,
            puedeSeleccionar: false,
            razonNoSeleccionable: 'Ya tiene casa asignada',
          },
          {
            value: 'user-available',
            label: 'Demo Disponible',
            email: 'disponible.con.un.correo.excesivamente.largo@example.com',
            cedula: 'V-98765432109876543210',
            yaTieneCasa: false,
            puedeSeleccionar: true,
          },
        ],
      }),
      } as unknown as Response),
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('keeps the owner search modal viewport-bound and prioritizes selectable people', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onChange = jest.fn()

    render(<SelectorPropietarioCasa onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Buscar propietario' }))
    await user.type(screen.getByLabelText('Buscar persona'), 'demo')
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300)
    })

    await waitFor(() => expect(screen.getByText('Demo Disponible')).toBeInTheDocument())

    const dialogContent = screen.getByTestId('selector-dialog-content')
    expect(dialogContent).toHaveClass('max-h-[calc(100dvh-2rem)]', 'overflow-hidden')

    const dialog = screen.getByRole('dialog')
    const resultRows = within(dialog).getAllByRole('button').filter((button) => button.textContent?.includes('Demo'))
    const resultListScrollRegion = resultRows[0]?.parentElement
    if (!resultListScrollRegion) throw new Error('Expected owner result list scroll region')
    expect(resultListScrollRegion).toHaveClass('max-h-[min(52dvh,24rem)]', 'overflow-y-auto')
    expect(resultRows).toHaveLength(2)
    expect(resultRows[0]).toHaveTextContent('Demo Disponible')
    expect(resultRows[0]).toHaveTextContent('Disponible')
    expect(resultRows[0]).not.toBeDisabled()
    expect(resultRows[1]).toHaveTextContent('Demo Ocupado')
    expect(resultRows[1]).toHaveTextContent('Ya tiene casa')
    expect(resultRows[1]).toBeDisabled()
    expect(resultRows[1]).toHaveClass('opacity-60')

    expect(screen.getByText(/disponible\.con\.un\.correo/)).toHaveClass('truncate')
  })

  it('keeps displaying the selected remote owner after closing and clearing search results', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    render(<ControlledSelector />)

    await user.click(screen.getByRole('button', { name: 'Buscar propietario' }))
    await user.type(screen.getByLabelText('Buscar persona'), 'demo')
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300)
    })

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Demo Disponible/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Demo Disponible')).toBeInTheDocument()
    expect(screen.getByText(/disponible\.con\.un\.correo/)).toBeInTheDocument()
    expect(screen.queryByText('Sin propietario seleccionado')).not.toBeInTheDocument()
  })

  it('honors external clear and value changes after selecting a remote owner', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    render(<ControlledSelector />)

    await user.click(screen.getByRole('button', { name: 'Buscar propietario' }))
    await user.type(screen.getByLabelText('Buscar persona'), 'demo')
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300)
    })

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Demo Disponible/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Demo Disponible')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'External clear' }))
    expect(screen.getByText('Sin propietario seleccionado')).toBeInTheDocument()
    expect(screen.queryByText('Demo Disponible')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'External change' }))
    expect(screen.getByText('Inicial Disponible')).toBeInTheDocument()
    expect(screen.queryByText('Demo Disponible')).not.toBeInTheDocument()
  })
})

function ControlledSelector() {
  const [value, setValue] = React.useState<string | undefined>()

  return (
    <>
      <SelectorPropietarioCasa
        value={value}
        onChange={setValue}
        usuariosIniciales={[
          {
            value: 'initial-user',
            label: 'Inicial Disponible',
            email: 'inicial@example.com',
            cedula: 'V-111',
          },
        ]}
      />
      <button type="button" onClick={() => setValue(undefined)}>External clear</button>
      <button type="button" onClick={() => setValue('initial-user')}>External change</button>
    </>
  )
}
