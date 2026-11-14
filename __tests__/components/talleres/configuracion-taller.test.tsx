/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the taller
 * page's "Configuración" section: tipo, vínculo (only tipo=pareja),
 * régimen, cierre de inscripción (relative sentence), intervalo entre
 * ediciones (only régimen=cadencia), plus cadencia/duración moved here
 * from the old Clases section. Edit controls only render when puedeEditar.
 *
 * R3k (odd/tasks/talleres-rediseno.md, L10) — the configuration is its own
 * view (/talleres/[taller]/configuracion): section cards and ONE «Guardar
 * configuración» that also saves cadencia/duración when they changed.
 *
 * R3l (odd/tasks/talleres-rediseno.md, L11) — Temporadas is hidden from
 * Talleres: no régimen selector; every taller runs on its own cadencia. A
 * taller still on régimen=temporada shows a short note and keeps it on save.
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
    regimen: 'cadencia' as 'temporada' | 'cadencia',
    cierreInscripcionOffsetDias: 0,
    intervaloEdicionesDias: null,
    clasesMinimasParaCompletar: null,
    minimoInscritos: null,
    permiteRecuperarClases: true,
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
  it('shows tipo, cierre and cadencia as plain text, no controls and no régimen (R3l)', () => {
    render(<ConfiguracionTaller {...baseProps({ tipo: 'pareja', vinculo: 'matrimonio', cierreInscripcionOffsetDias: -3 })} />)
    expect(screen.getByText('Parejas')).toBeInTheDocument()
    expect(screen.getByText('Matrimonios')).toBeInTheDocument()
    expect(screen.queryByText('Régimen')).not.toBeInTheDocument()
    expect(screen.queryByText(/temporada/i)).not.toBeInTheDocument()
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

  it('R3l — a taller still on régimen=temporada shows the short note', () => {
    render(<ConfiguracionTaller {...baseProps({ regimen: 'temporada' })} />)
    expect(screen.getByText('Este taller está en régimen por temporada.')).toBeInTheDocument()
  })
})

describe('ConfiguracionTaller — editor: tipo/vinculo/regimen/cierre/intervalo', () => {
  it('shows Vínculo only when Tipo is set to Parejas', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, tipo: 'individual' })} />)
    expect(screen.queryByLabelText(/^vínculo$/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^tipo$/i), { target: { value: 'pareja' } })
    expect(screen.getByLabelText(/^vínculo$/i)).toBeInTheDocument()
  })

  it('R3l — offers no régimen selector and never mentions temporadas for a cadencia taller', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, regimen: 'cadencia' })} />)
    expect(screen.queryByLabelText(/^régimen$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/temporada/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/inicio de cada edición/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/intervalo entre ediciones/i)).toBeInTheDocument()
  })

  it('R3l — a régimen=temporada taller shows the note, no selector and no cadencia fields', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, regimen: 'temporada' })} />)
    expect(screen.getByText('Este taller está en régimen por temporada.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^régimen$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/inicio de cada edición/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/intervalo entre ediciones/i)).not.toBeInTheDocument()
  })

  it('shows the cierre relativo sentence live as the offset changes', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, cierreInscripcionOffsetDias: 0 })} />)
    expect(screen.getByText('Cierra al empezar')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/cierre de inscripción/i), { target: { value: '7' } })
    expect(screen.getByText('Permite entrar hasta 7 días después')).toBeInTheDocument()
  })

  it('saves tipo/vinculo/regimen/cierre/intervalo through updateTallerConfiguracion', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, tipo: 'individual', regimen: 'cadencia' })} />)

    fireEvent.change(screen.getByLabelText(/^tipo$/i), { target: { value: 'pareja' } })
    fireEvent.change(screen.getByLabelText(/^vínculo$/i), { target: { value: 'novios' } })
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
        anclaEdiciones: null,
        clasesMinimasParaCompletar: null,
        minimoInscritos: null,
        permiteRecuperarClases: true,
        momentoEnvioAcceso: 'al_aprobar',
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

// T1 (odd/tasks/proximo-paso.md, S1) — a cadencia taller chooses how its
// ediciones start: on the first Sunday of each month, or every N días.
describe('ConfiguracionTaller — inicio de cada edición', () => {
  it('editor: offers the choice only for régimen=cadencia', () => {
    const { unmount } = render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, regimen: 'temporada' })} />)
    expect(screen.queryByLabelText(/inicio de cada edición/i)).not.toBeInTheDocument()
    unmount()
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, regimen: 'cadencia' })} />)
    expect(screen.getByLabelText(/inicio de cada edición/i)).toHaveValue('cada_n_dias')
  })

  it('editor: "Primer domingo de cada mes" hides the intervalo and saves the anchor', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, regimen: 'cadencia', intervaloEdicionesDias: 28 })} />)

    fireEvent.change(screen.getByLabelText(/inicio de cada edición/i), { target: { value: 'primer_domingo_mes' } })
    expect(screen.queryByLabelText(/intervalo entre ediciones/i)).not.toBeInTheDocument()
    expect(screen.getByText('Cada edición empieza el primer domingo de su mes, una por mes.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))

    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          regimen: 'cadencia',
          anclaEdiciones: 'primer_domingo_mes',
          intervaloEdicionesDias: null,
        }),
      ),
    )
  })

  it('editor: an anchored taller opens on "Primer domingo de cada mes" and can go back to Cada N días', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(
      <ConfiguracionTaller
        {...baseProps({ puedeEditar: true, regimen: 'cadencia', anclaEdiciones: 'primer_domingo_mes' })}
      />,
    )
    expect(screen.getByLabelText(/inicio de cada edición/i)).toHaveValue('primer_domingo_mes')
    expect(screen.queryByLabelText(/intervalo entre ediciones/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/inicio de cada edición/i), { target: { value: 'cada_n_dias' } })
    fireEvent.change(screen.getByLabelText(/intervalo entre ediciones/i), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))

    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ anclaEdiciones: null, intervaloEdicionesDias: 28 }),
      ),
    )
  })

  it('R3l — editor: a régimen=temporada taller keeps its régimen on save and sends no anchor', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(
      <ConfiguracionTaller
        {...baseProps({ puedeEditar: true, regimen: 'temporada', anclaEdiciones: 'primer_domingo_mes' })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ regimen: 'temporada', anclaEdiciones: null }),
      ),
    )
  })

  it('read-only: shows "Primer domingo de cada mes" for an anchored taller, no intervalo', () => {
    render(<ConfiguracionTaller {...baseProps({ regimen: 'cadencia', anclaEdiciones: 'primer_domingo_mes' })} />)
    expect(screen.getByText('Inicio de cada edición')).toBeInTheDocument()
    expect(screen.getByText('Primer domingo de cada mes')).toBeInTheDocument()
    expect(screen.queryByText(/intervalo entre ediciones/i)).not.toBeInTheDocument()
  })
})

// Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — the
// completion rule talleres_cerrar_edicion applies: empty = every clase dictada.
describe('ConfiguracionTaller — clases mínimas para completar', () => {
  it('read-only: says "Todas las clases dictadas" when no minimum is set', () => {
    render(<ConfiguracionTaller {...baseProps({ clasesMinimasParaCompletar: null })} />)
    expect(screen.getByText('Clases mínimas para el certificado')).toBeInTheDocument()
    expect(screen.getByText('Todas las clases dictadas')).toBeInTheDocument()
  })

  it('read-only: shows the configured minimum', () => {
    render(<ConfiguracionTaller {...baseProps({ clasesMinimasParaCompletar: 6 })} />)
    expect(screen.getByText('6 clases')).toBeInTheDocument()
  })

  it('editor: shows the current value and a one-line hint that empty means all clases', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, clasesMinimasParaCompletar: 6 })} />)
    const input = screen.getByLabelText(/clases mínimas para el certificado/i)
    expect(input).toHaveValue(6)
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '50')
    expect(screen.getByText(/vacío = todas las clases dictadas/i)).toBeInTheDocument()
  })

  it('editor: saves the typed minimum through updateTallerConfiguracion', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    fireEvent.change(screen.getByLabelText(/clases mínimas para el certificado/i), { target: { value: '7' } })
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
    fireEvent.change(screen.getByLabelText(/clases mínimas para el certificado/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ clasesMinimasParaCompletar: null }),
      ),
    )
  })
})

// R3k (odd/tasks/talleres-rediseno.md, S1, S4, L10) — one «Guardar
// configuración» for the whole view: it also saves cadencia/duración through
// the existing updateCadenciaYDuracion, only when those fields changed, and
// reports each action's error on its own.
describe('ConfiguracionTaller — un solo guardar con cadencia y duración (R3k)', () => {
  it('shows the current values and saves a changed cadencia with «Guardar configuración»', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    updateCadenciaYDuracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    const cadenciaInput = screen.getByLabelText(/cada n días/i)
    expect(cadenciaInput).toHaveValue(7)
    fireEvent.change(cadenciaInput, { target: { value: '14' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateCadenciaYDuracionMock).toHaveBeenCalledWith({
        tallerId: 't-1',
        tallerSlug: 'proximo-paso',
        cadenciaDias: 14,
        duracionMinutos: 90,
      }),
    )
    expect(updateTallerConfiguracionMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('sends an emptied duración as null', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    updateCadenciaYDuracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    fireEvent.change(screen.getByLabelText(/duración \(min\)/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateCadenciaYDuracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ cadenciaDias: 7, duracionMinutos: null }),
      ),
    )
  })

  it('does not call updateCadenciaYDuracion when cadencia and duración did not change', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() => expect(updateTallerConfiguracionMock).toHaveBeenCalled())
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(updateCadenciaYDuracionMock).not.toHaveBeenCalled()
  })

  it('has no separate «Guardar cadencia» button', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    expect(screen.queryByRole('button', { name: /guardar cadencia/i })).not.toBeInTheDocument()
  })

  it('reports only the cadencia error when the configuration saved', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    updateCadenciaYDuracionMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'La cadencia debe ser un entero positivo.' })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    fireEvent.change(screen.getByLabelText(/cada n días/i), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    const alertas = await screen.findAllByRole('alert')
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toHaveTextContent('No se guardaron la cadencia y la duración: La cadencia debe ser un entero positivo.')
    // The configuration did save, so the page still refreshes.
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('reports each failed action on its own', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'Cierre inválido.' })
    updateCadenciaYDuracionMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'Cadencia inválida.' })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    fireEvent.change(screen.getByLabelText(/cada n días/i), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    const textos = screen.getAllByRole('alert').map((a) => a.textContent)
    expect(textos).toEqual([
      'No se guardó la configuración: Cierre inválido.',
      'No se guardaron la cadencia y la duración: Cadencia inválida.',
    ])
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

// R3k — artboard 14: the editor's sections are cards; the numeric fields use
// the normal font and the full field width, so «Sin mínimo» is never cut.
describe('ConfiguracionTaller — secciones y campos (R3k)', () => {
  it('groups the editor in four sections: Inscripción, Ediciones, Clases y certificado, Cadencia y duración', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Inscripción',
      'Ediciones',
      'Clases y certificado',
      'Cadencia y duración',
    ])
  })

  it('numeric fields use the normal font and are not narrowed', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, regimen: 'cadencia' })} />)
    const minimo = screen.getByLabelText(/mínimo de inscritos para abrir/i)
    expect(minimo).toHaveAttribute('placeholder', 'Sin mínimo')
    for (const input of [
      minimo,
      screen.getByLabelText(/cierre de inscripción/i),
      screen.getByLabelText(/intervalo entre ediciones/i),
      screen.getByLabelText(/clases mínimas para el certificado/i),
      screen.getByLabelText(/cada n días/i),
      screen.getByLabelText(/duración \(min\)/i),
    ]) {
      expect(input.className).not.toMatch(/font-mono|\bw-32\b/)
    }
  })
})

describe('ConfiguracionTaller — envío del acceso al cónyuge nuevo', () => {
  it('editor: offers the field only for a couple taller and saves it', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, tipo: 'pareja', momentoEnvioAcceso: 'al_aprobar' })} />)

    fireEvent.change(screen.getByLabelText(/envío del acceso al cónyuge nuevo/i), {
      target: { value: 'al_inscribirse' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))

    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ momentoEnvioAcceso: 'al_inscribirse' }),
      ),
    )
  })

  it('editor: hides the field for an individual taller', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, tipo: 'individual' })} />)
    expect(screen.queryByLabelText(/envío del acceso al cónyuge nuevo/i)).not.toBeInTheDocument()
  })

  it('read-only: shows the setting for a couple taller', () => {
    render(<ConfiguracionTaller {...baseProps({ tipo: 'pareja', momentoEnvioAcceso: 'al_inscribirse' })} />)
    expect(screen.getByText('Envío del acceso al cónyuge nuevo')).toBeInTheDocument()
    expect(screen.getByText('Al inscribirse')).toBeInTheDocument()
  })
})

// T8b (odd/tasks/talleres-reserva-publica.md, S17) — artboard 14: the
// minimum is «para el certificado» and the recovery switch sits with it.
// T9 (same doc, S8, L16) — the switch and «Mínimo de inscritos para abrir»
// save with «Guardar configuración»; neither has its own save any more.
describe('ConfiguracionTaller — recuperar clases y mínimo de inscritos (un solo guardar)', () => {
  it('editor: shows both saved values and no separate save', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, minimoInscritos: 10, permiteRecuperarClases: false })} />)
    expect(screen.getByRole('switch', { name: 'Recuperar clases aparte' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('Mínimo de inscritos para abrir (personas)')).toHaveValue(10)
    expect(screen.queryByRole('button', { name: 'Guardar mínimo' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /guardar/i }).map((b) => b.textContent)).toEqual([
      'Guardar configuración',
    ])
  })

  it('editor: saves the switch and the mínimo with the rest of the configuration', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, minimoInscritos: 10, permiteRecuperarClases: true })} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Recuperar clases aparte' }))
    fireEvent.change(screen.getByLabelText(/mínimo de inscritos para abrir/i), { target: { value: '6' } })
    expect(updateTallerConfiguracionMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ minimoInscritos: 6, permiteRecuperarClases: false }),
      ),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('editor: an emptied mínimo is sent as null', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, minimoInscritos: 10 })} />)
    fireEvent.change(screen.getByLabelText(/mínimo de inscritos para abrir/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(expect.objectContaining({ minimoInscritos: null })),
    )
  })

  it('editor: a refused mínimo shows the server message', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      message: 'El mínimo de inscritos debe ser un entero entre 1 y 500, o vacío para no tener mínimo.',
    })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    fireEvent.change(screen.getByLabelText(/mínimo de inscritos para abrir/i), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/entre 1 y 500/)
  })

  it('read-only: shows Sí / No and the mínimo', () => {
    render(<ConfiguracionTaller {...baseProps({ permiteRecuperarClases: true, minimoInscritos: 8 })} />)
    expect(screen.getByText('Recuperar clases aparte')).toBeInTheDocument()
    expect(screen.getByText('Sí')).toBeInTheDocument()
    expect(screen.getByText('8 personas')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

// T2b (odd/tasks/proximo-paso.md, L6.2) — "Inscripción automática si hay
// cupo": individual talleres only; saved with the rest of the configuration.
describe('ConfiguracionTaller — inscripción automática', () => {
  it('editor: shows the switch with its current value and saves the change', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, inscripcionAutomatica: false })} />)

    const interruptor = screen.getByRole('switch', { name: 'Inscripción automática si hay cupo' })
    expect(interruptor).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/Con cupo, la inscripción queda aprobada al momento/)).toBeInTheDocument()

    fireEvent.click(interruptor)
    expect(interruptor).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))

    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'individual', inscripcionAutomatica: true }),
      ),
    )
  })

  it('editor: an enabled taller opens with the switch on and keeps it when saving', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, inscripcionAutomatica: true })} />)

    expect(screen.getByRole('switch', { name: 'Inscripción automática si hay cupo' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() =>
      expect(updateTallerConfiguracionMock).toHaveBeenCalledWith(expect.objectContaining({ inscripcionAutomatica: true })),
    )
  })

  it('editor: hides the switch and sends nothing for a couple taller', async () => {
    updateTallerConfiguracionMock.mockResolvedValue({ ok: true })
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true, tipo: 'pareja', inscripcionAutomatica: true })} />)

    expect(screen.queryByRole('switch', { name: 'Inscripción automática si hay cupo' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /guardar configuración/i }))
    await waitFor(() => expect(updateTallerConfiguracionMock).toHaveBeenCalled())
    expect(updateTallerConfiguracionMock.mock.calls[0][0]).not.toHaveProperty('inscripcionAutomatica')
  })

  it('read-only: says whether it is on, only for an individual taller', () => {
    // permiteRecuperarClases false so «Recuperar clases aparte» reads «No» and the only «Sí» is this row.
    const { unmount } = render(
      <ConfiguracionTaller {...baseProps({ inscripcionAutomatica: true, permiteRecuperarClases: false })} />,
    )
    expect(screen.getByText('Inscripción automática si hay cupo')).toBeInTheDocument()
    expect(screen.getByText('Sí')).toBeInTheDocument()
    unmount()
    render(<ConfiguracionTaller {...baseProps({ tipo: 'pareja', inscripcionAutomatica: true })} />)
    expect(screen.queryByText('Inscripción automática si hay cupo')).not.toBeInTheDocument()
  })
})

// R3k (L10) — the Próximo Paso «Enlace de inscripción» left the configuration:
// it lives in the taller page's «Página pública» card now.
describe('ConfiguracionTaller — sin enlace de inscripción (R3k)', () => {
  it('never shows the Próximo Paso registration link, not even to whoever edits it', () => {
    render(<ConfiguracionTaller {...baseProps({ puedeEditar: true })} />)
    expect(screen.queryByRole('heading', { name: 'Enlace de inscripción' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).not.toBeInTheDocument()
  })
})
