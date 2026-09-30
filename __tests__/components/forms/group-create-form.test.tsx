import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import GroupCreateForm from '@/components/forms/GroupCreateForm'

const mockRouterPush = jest.fn()
const mockCreateGroup = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

jest.mock('@/lib/actions/group.actions', () => ({
  createGroup: (...args: unknown[]) => mockCreateGroup(...args),
}))

jest.mock('@/components/modals/SelectLeaderModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/components/ui/sistema-diseno', () => {
  const MockInputSistema = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { error?: string; label: string }>(
    ({ error, label, ...props }, ref) => (
      <label>
        {label}
        <input ref={ref} {...props} />
        {error && <span role="alert">{error}</span>}
      </label>
    )
  )
  MockInputSistema.displayName = 'MockInputSistema'

  return {
    BotonSistema: ({ cargando, children, disabled, onClick, type = 'button' }: React.ButtonHTMLAttributes<HTMLButtonElement> & { cargando?: boolean }) => (
      <button disabled={disabled || cargando} onClick={onClick} type={type}>
        {children}
      </button>
    ),
    InputSistema: MockInputSistema,
    SelectSistema: ({ disabled, error, id, label, onValueChange, opciones, placeholder, value }: { disabled?: boolean; error?: string; id?: string; label?: string; onValueChange?: (value: string) => void; opciones: Array<{ valor: string; etiqueta: string }>; placeholder?: string; value?: string }) => (
      <label>
        {label}
        <select id={id} aria-label={label} disabled={disabled} value={value ?? ''} onChange={(event) => onValueChange?.(event.target.value)}>
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {opciones.map((option) => <option key={option.valor} value={option.valor}>{option.etiqueta}</option>)}
        </select>
        {error && <span role="alert">{error}</span>}
      </label>
    ),
  }
})

const temporadaId = '22222222-2222-2222-2222-222222222222'
const segmentoId = '33333333-3333-3333-3333-333333333333'
const directorA = '44444444-4444-4444-4444-444444444444'
const directorB = '55555555-5555-5555-5555-555555555555'

const DIRECTOR_REQUIRED = 'Elige el director de etapa del grupo'

describe('GroupCreateForm director de etapa', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateGroup.mockResolvedValue({ success: true, newGroupId: 'g1', pendiente: false })
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/directores-etapa')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            directores: [
              { id: directorA, usuario_id: 'u1', nombre: 'Ana Pérez' },
              { id: directorB, usuario_id: 'u2', nombre: 'Luis Gómez' },
            ],
          }),
        })
      }
      if (url.includes('/sugerir-nombre')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ nombre: 'Grupo Norte 1' }) })
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch
  })

  it('requires a director: a missing one blocks the submit and shows a clear message', async () => {
    render(<GroupCreateForm {...baseProps()} userRoles={['admin']} />)
    await fillCommonFields()

    fireEvent.click(screen.getByRole('button', { name: /Crear Grupo/i }))

    expect(await screen.findByText(DIRECTOR_REQUIRED)).toBeInTheDocument()
    expect(mockCreateGroup).not.toHaveBeenCalled()
  })

  it('loads the directors of the segment once when directoresPropios is left out', async () => {
    render(<GroupCreateForm {...baseProps()} userRoles={['admin']} />)
    await fillCommonFields()

    await waitFor(() => expect(screen.getByRole('option', { name: 'Ana Pérez' })).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('Cargando...')).not.toBeInTheDocument())

    const directorLoads = (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes('/directores-etapa'))
    expect(directorLoads).toHaveLength(1)
  })

  it('offers the directors of the segment with no selectable empty option and submits the chosen one', async () => {
    render(<GroupCreateForm {...baseProps()} userRoles={['admin']} />)
    await fillCommonFields()

    const select = await screen.findByRole('combobox', { name: /Director de Etapa/i })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ana Pérez' })).toBeInTheDocument())
    expect(select).not.toBeDisabled()
    expect(screen.getByRole('option', { name: 'Selecciona un director' })).toBeDisabled()
    expect(screen.queryByText('Director de Etapa (opcional)')).not.toBeInTheDocument()

    fireEvent.change(select, { target: { value: directorB } })
    fireEvent.click(screen.getByRole('button', { name: /Crear Grupo/i }))

    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1))
    expect(mockCreateGroup).toHaveBeenCalledWith(expect.objectContaining({ director_etapa_segmento_lider_id: directorB }))
  })

  it('locks the director de etapa on their own entry and submits it', async () => {
    render(
      <GroupCreateForm
        {...baseProps()}
        userRoles={['director-etapa']}
        directoresPropios={[{ id: directorA, segmento_id: segmentoId, nombre: 'Ana Pérez' }]}
      />
    )
    await fillCommonFields()

    const select = await screen.findByRole('combobox', { name: /Director de Etapa/i })
    await waitFor(() => expect(select).toHaveValue(directorA))
    expect(select).toBeDisabled()
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/directores-etapa'), expect.anything())

    fireEvent.click(screen.getByRole('button', { name: /Crear Grupo/i }))

    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledTimes(1))
    expect(mockCreateGroup).toHaveBeenCalledWith(expect.objectContaining({ director_etapa_segmento_lider_id: directorA }))
  })

  it('does not lock the director for a director de etapa who is also admin', async () => {
    render(
      <GroupCreateForm
        {...baseProps()}
        userRoles={['director-etapa', 'admin']}
        directoresPropios={[{ id: directorA, segmento_id: segmentoId, nombre: 'Ana Pérez' }]}
      />
    )
    await fillCommonFields()

    const select = await screen.findByRole('combobox', { name: /Director de Etapa/i })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Luis Gómez' })).toBeInTheDocument())
    expect(select).not.toBeDisabled()
    expect(select).toHaveValue('')
  })
})

function baseProps() {
  return {
    temporadas: [{ id: temporadaId, nombre: 'Temporada 1' }],
    segmentos: [{ id: segmentoId, nombre: 'Hombres' }],
  }
}

async function fillCommonFields() {
  fireEvent.change(screen.getByRole('combobox', { name: 'Ubicación' }), { target: { value: 'Barquisimeto' } })
  await waitFor(() => expect(screen.getByLabelText('Nombre del Grupo')).toHaveValue('Grupo Norte 1'))
}
