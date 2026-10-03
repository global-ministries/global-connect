/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the taller
 * page's "Configuración" section: tipo, vínculo (only tipo=pareja),
 * régimen, cierre de inscripción (relative sentence), intervalo entre
 * ediciones (only régimen=cadencia), plus cadencia/duración moved here
 * from the old Clases section. Edit controls only render when puedeEditar.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const updateTallerConfiguracionMock = jest.fn()
const updateCadenciaYDuracionMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/actions', () => ({
  updateTallerConfiguracion: (...args: unknown[]) => updateTallerConfiguracionMock(...args),
  updateCadenciaYDuracion: (...args: unknown[]) => updateCadenciaYDuracionMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { ConfiguracionTaller } from '@/components/talleres/configuracion-taller'

function baseProps(overrides: Partial<Parameters<typeof ConfiguracionTaller>[0]> = {}) {
  return {
    tallerId: 't-1',
    tallerSlug: 'proximo-paso',
    tipo: 'individual' as const,
    vinculo: null,
    regimen: 'temporada' as const,
    cierreInscripcionOffsetDias: 0,
    intervaloEdicionesDias: null,
    clasesMinimasParaCompletar: null,
    cadenciaDias: 7,
    duracionMinutos: 90,
    puedeEditar: false,
    ...overrides,
  }
}

beforeEach(() => {
  updateTallerConfiguracionMock.mockReset()
  updateCadenciaYDuracionMock.mockReset()
  refreshMock.mockReset()
})

describe('ConfiguracionTaller — read-only viewer', () => {
  it('shows tipo, régimen, cierre and cadencia as plain text, no controls', () => {
    render(<ConfiguracionTaller {...baseProps({ tipo: 'pareja', vinculo: 'matrimonio', cierreInscripcionOffsetDias: -3 })} />)
    expect(screen.getByText('Parejas')).toBeInTheDocument()
    expect(screen.getByText('Matrimonios')).toBeInTheDocument()
    expect(screen.getByText('Por temporada de la dirección')).toBeInTheDocument()
    expect(screen.getByText('Cierra 3 días antes de la primera clase')).toBeInTheDocument()
    expect(screen.getByText(/Cada 7 días · Duración 90 min/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument()
  })

  it('never shows Vínculo for a tipo=individual taller', () => {
    render(<ConfiguracionTaller {...baseProps({ tipo: 'individual' })} />)
    expect(screen.queryByText(/vínculo/i)).not.toBeInTheDocument()
  })

  it('shows the intervalo only for régimen=cadencia with one set', () => {
    render(
      <ConfiguracionTaller
        {...baseProps({ regimen: 'cadencia', intervaloEdicionesDias: 28 })}
      />,
    )
    expect(screen.getByText('Cada 28 días')).toBeInTheDocument()
  })

  it('never shows an intervalo row for régimen=temporada', () => {
    render(<ConfiguracionTaller {...baseProps({ regimen: 'temporada', intervaloEdicionesDias: null })} />)
    expect(screen.queryByText(/intervalo entre ediciones/i)).not.toBeInTheDocument()
  })
})

describe('ConfiguracionTaller — editor: tipo/vinculo/regimen/cierre/intervalo', () => {
  it('shows Vínculo only when Tipo is set to Parejas', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, tipo: 'individual' })} />)
    expect(screen.queryByLabelText(/^vínculo$/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^tipo$/i), { target: { value: 'pareja' } })
    expect(screen.getByLabelText(/^vínculo$/i)).toBeInTheDocument()
  })

  it('shows the intervalo field only when régimen is cadencia', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, regimen: 'temporada' })} />)
    expect(screen.queryByLabelText(/intervalo entre ediciones/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^régimen$/i), { target: { value: 'cadencia' } })
    expect(screen.getByLabelText(/intervalo entre ediciones/i)).toBeInTheDocument()
  })

  it('explains the régimen choice under the control, and updates live as it changes', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, regimen: 'temporada' })} />)
    expect(screen.getByText(/se agrupan en las temporadas de tu dirección/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^régimen$/i), { target: { value: 'cadencia' } })
    expect(screen.getByText(/se crean por su propia cadencia/i)).toBeInTheDocument()
  })

  it('shows the cierre relativo sentence live as the offset changes', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, cierreInscripcionOffsetDias: 0 })} />)
    expect(screen.getByText('Cierra al empezar')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/cierre de inscripción/i), { target: { value: '7' } })
    expect(screen.getByText('Permite entrar hasta 7 días después')).toBeInTheDocument()
  })

  it('saves tipo/vinculo/regimen/cierre/intervalo through updateTallerConfiguracion', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, tipo: 'individual', regimen: 'temporada' })} />)

    fireEvent.change(screen.getByLabelText(/^tipo$/i), { target: { value: 'pareja' } })
    fireEvent.change(screen.getByLabelText(/^vínculo$/i), { target: { value: 'novios' } })
    fireEvent.change(screen.getByLabelText(/^régimen$/i), { target: { value: 'cadencia' } })
    fireEvent.change(screen.getByLabelText(/cierre de inscripción/i), { target: { value: '-5' } })
    fireEvent.change(screen.getByLabelText(/intervalo entre ediciones/i), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))

    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith({
        tallerId: 't-1',
        tallerSlug: 'proximo-paso',
        tipo: 'pareja',
        vinculo: 'novios',
        regimen: 'cadencia',
        cierreInscripcionOffsetDias: -5,
        intervaloEdicionesDias: 28,
        clasesMinimasParaCompletar: null,
      }),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('sends intervaloEdicionesDias: null when the field is left empty', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, regimen: 'cadencia', intervaloEdicionesDias: 28 })} />)
    fireEvent.change(screen.getByLabelText(/intervalo entre ediciones/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ intervaloEdicionesDias: null }),
      ),
    )
  })

  it('shows the error message from a failed save', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      message: 'El cierre de inscripción debe ser un entero entre -60 y 60 días.',
    })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/-60 y 60/)
  })
})

// Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — the
// completion rule talleres_cerrar_edicion applies: empty = every clase dictada.
describe('ConfiguracionTaller — clases mínimas para completar', () => {
  it('read-only: says "Todas las clases dictadas" when no minimum is set', () => {
    render(<ConfiguracionTaller {...baseProps({ clasesMinimasParaCompletar: null })} />)
    expect(screen.getByText('Clases mínimas para completar')).toBeInTheDocument()
    expect(screen.getByText('Todas las clases dictadas')).toBeInTheDocument()
  })

  it('read-only: shows the configured minimum', () => {
    render(<ConfiguracionTaller {...baseProps({ clasesMinimasParaCompletar: 6 })} />)
    expect(screen.getByText('6 clases')).toBeInTheDocument()
  })

  it('editor: shows the current value and a one-line hint that empty means all clases', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, clasesMinimasParaCompletar: 6 })} />)
    const input = screen.getByLabelText(/clases mínimas para completar/i)
    expect(input).toHaveValue(6)
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '50')
    expect(screen.getByText(/vacío = todas las clases dictadas/i)).toBeInTheDocument()
  })

  it('editor: saves the typed minimum through updateTallerConfiguracion', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    fireEvent.change(screen.getByLabelText(/clases mínimas para completar/i), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ clasesMinimasParaCompletar: 7 }),
      ),
    )
  })

  it('editor: sends null when the field is cleared', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, clasesMinimasParaCompletar: 6 })} />)
    fireEvent.change(screen.getByLabelText(/clases mínimas para completar/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ clasesMinimasParaCompletar: null }),
      ),
    )
  })
})

describe('ConfiguracionTaller — editor: cadencia y duración (moved from Clases)', () => {
  it('shows the current values as editable fields and saves them through updateCadenciaYDuracion', async () => {
    updateCadenciaYDuracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    const cadenciaInput = screen.getByLabelText(/cada n días/i)
    expect(cadenciaInput).toHaveValue(7)
    fireEvent.change(cadenciaInput, { target: { value: '14' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cadencia/i }))
    expect(updateCadenciaYDuracionMock).toHaveBeenCalledWith({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      cadenciaDias: 14,
      duracionMinutos: 90,
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})
