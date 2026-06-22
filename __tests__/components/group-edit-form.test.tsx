import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import GroupEditForm from '@/components/forms/GroupEditForm'

const mockRouterPush = jest.fn()
const mockToastError = jest.fn()
const mockToastSuccess = jest.fn()
const mockUpdateGroup = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

jest.mock('@/lib/actions/group.actions', () => ({
  updateGroup: (...args: unknown[]) => mockUpdateGroup(...args),
}))

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: mockToastSuccess, error: mockToastError }),
}))

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, disabled, onCheckedChange }: { checked: boolean; disabled?: boolean; onCheckedChange?: (checked: boolean) => void }) => (
    <button
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      role="switch"
      type="button"
    >
      {checked ? 'Activo' : 'Inactivo'}
    </button>
  ),
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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

  const MockTextareaSistema = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string; label: string }>(
    ({ error, label, ...props }, ref) => (
      <label>
        {label}
        <textarea ref={ref} {...props} />
        {error && <span role="alert">{error}</span>}
      </label>
    )
  )
  MockTextareaSistema.displayName = 'MockTextareaSistema'

  return {
    BotonSistema: ({ cargando, children, disabled, onClick, type = 'button' }: React.ButtonHTMLAttributes<HTMLButtonElement> & { cargando?: boolean }) => (
      <button disabled={disabled || cargando} onClick={onClick} type={type}>
        {children}
      </button>
    ),
    InputSistema: MockInputSistema,
    SelectSistema: ({ disabled, label, onValueChange, opciones, placeholder, value }: { disabled?: boolean; label: string; onValueChange?: (value: string) => void; opciones: Array<{ valor: string; etiqueta: string }>; placeholder?: string; value?: string }) => (
      <label>
        {label}
        <select disabled={disabled} value={value ?? ''} onChange={(event) => onValueChange?.(event.target.value)}>
          {placeholder && <option value="">{placeholder}</option>}
          {opciones.map((option) => <option key={option.valor} value={option.valor}>{option.etiqueta}</option>)}
        </select>
      </label>
    ),
    TarjetaSistema: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
    TextareaSistema: MockTextareaSistema,
  }
})

const groupId = '11111111-1111-1111-1111-111111111111'
const temporadaId = '22222222-2222-2222-2222-222222222222'
const segmentoId = '33333333-3333-3333-3333-333333333333'
const casaId = '44444444-4444-4444-4444-444444444444'
const parroquiaId = '55555555-5555-5555-5555-555555555555'

describe('GroupEditForm host-home assignment guidance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdateGroup.mockResolvedValue({ success: true })
  })

  it('keeps manual addresses legacy-only and directs users to the guided Casa Anfitriona assignment flow', () => {
    render(<GroupEditForm {...createProps({ casasDisponibles: [] })} />)

    expect(screen.getByText(/Las direcciones manuales quedan solo como referencia interna/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Asignar Casa Anfitriona' })).toHaveAttribute(
      'href',
      '/grupos-vida/casas-anfitrionas/asignar'
    )
    expect(screen.getByText('Dirección manual de referencia')).toBeInTheDocument()
    expect(screen.getByText(/Conserva datos operativos legados/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Casa Anfitriona/i })).not.toBeInTheDocument()
  })

  it('does not submit Casa assignment from the generic edit form', async () => {
    const props = createProps()

    render(
      <GroupEditForm
        {...createProps({
          grupo: {
            ...props.grupo,
            casa_anfitriona_id: casaId,
          },
          casasDisponibles: [
            { id: casaId, nombre_lugar: 'Casa de Ana', anfitrion_nombre: 'Ana Pérez' },
          ],
        })}
      />
    )

    expect(screen.getByText('Casa Anfitriona asignada')).toBeInTheDocument()
    expect(screen.getByText(/El grupo usa la ubicación aprobada de la Casa Anfitriona asignada/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Casa Anfitriona/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Dirección manual de referencia')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))

    await waitFor(() => expect(mockUpdateGroup).toHaveBeenCalledWith(groupId, expect.any(Object)))
    const payload = mockUpdateGroup.mock.calls[0][1] as { casa_anfitriona_id?: string | null; direccion?: unknown }

    expect(payload.casa_anfitriona_id).toBeUndefined()
    expect(payload.direccion).toBeUndefined()
  })

  it('preserves legacy manual coordinates when saving a group without Casa Anfitriona', async () => {
    const props = createProps()

    render(
      <GroupEditForm
        {...createProps({
          grupo: {
            ...props.grupo,
            direccion: {
              calle: 'Av. Principal',
              barrio: 'Centro',
              codigo_postal: '3001',
              referencia: 'Frente a la plaza',
              parroquia: { id: parroquiaId, nombre: 'Catedral' },
              lat: 10.123,
              lng: -66.456,
            },
          },
        })}
      />
    )

    fireEvent.change(screen.getByLabelText('Nombre del Grupo'), { target: { value: 'Grupo Norte actualizado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))

    await waitFor(() => expect(mockUpdateGroup).toHaveBeenCalledWith(groupId, expect.any(Object)))
    const payload = mockUpdateGroup.mock.calls[0][1] as { direccion?: { lat?: number; lng?: number } }

    expect(payload.direccion?.lat).toBe(10.123)
    expect(payload.direccion?.lng).toBe(-66.456)
  })

  it('shows manual reference fields and recovery guidance when the selected Casa is stale or unavailable', () => {
    const props = createProps()

    render(
      <GroupEditForm
        {...createProps({
          grupo: {
            ...props.grupo,
            casa_anfitriona_id: casaId,
          },
          casasDisponibles: [],
        })}
      />
    )

    expect(screen.getByText(/ya no está disponible para edición desde este formulario/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Asignar Casa Anfitriona' })).toHaveAttribute(
      'href',
      '/grupos-vida/casas-anfitrionas/asignar'
    )
    expect(screen.getByText('Dirección manual de referencia')).toBeInTheDocument()
    expect(screen.getByLabelText('Calle')).toBeInTheDocument()
  })
})

function createProps(overrides: Partial<React.ComponentProps<typeof GroupEditForm>> = {}): React.ComponentProps<typeof GroupEditForm> {
  return {
    grupo: {
      id: groupId,
      nombre: 'Grupo Norte',
      temporada_id: temporadaId,
      segmento_id: segmentoId,
      dia_reunion: 'Lunes',
      hora_reunion: '07:00 PM',
      activo: true,
      notas_privadas: null,
      casa_anfitriona_id: null,
      direccion: {
        calle: 'Av. Principal',
        barrio: 'Centro',
        codigo_postal: '3001',
        referencia: 'Frente a la plaza',
        parroquia: { id: parroquiaId, nombre: 'Catedral' },
      },
    },
    temporadas: [{ id: temporadaId, nombre: '2026' }],
    segmentos: [{ id: segmentoId, nombre: 'Jóvenes' }],
    parroquias: [{ id: parroquiaId, nombre: 'Catedral' }],
    casasDisponibles: [],
    readOnly: false,
    ...overrides,
  }
}
