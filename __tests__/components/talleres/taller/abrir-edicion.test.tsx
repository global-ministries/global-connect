/**
 * @jest-environment jsdom
 *
 * R3d (odd/tasks/talleres-rediseno.md, S1, S4) — «Abrir edición» of the v2
 * taller page: one OpenEdicionForm per page, opened from any
 * BotonAbrirEdicion inside the provider, and from the `#abrir` hash.
 */

import { fireEvent, render, screen } from '@testing-library/react'

const formularioMock = jest.fn()
jest.mock('@/components/talleres/open-edicion-form', () => ({
  OpenEdicionForm: (props: { abierto: boolean; onCambioAbierto: (v: boolean) => void; tallerNombre: string }) => {
    formularioMock(props)
    return props.abierto ? (
      <div role="dialog" aria-label={`Abrir edición de ${props.tallerNombre}`}>
        <button type="button" onClick={() => props.onCambioAbierto(false)}>
          Cerrar
        </button>
      </div>
    ) : null
  },
}))

import { AbrirEdicionProvider, BotonAbrirEdicion } from '@/components/talleres/taller/abrir-edicion'

const FORMULARIO = {
  tallerId: 't-1',
  tallerSlug: 'mujer-de-hoy',
  tallerNombre: 'Mujer de Hoy',
  regimen: 'cadencia' as const,
  temporadasDisponibles: [],
  intervaloEdicionesDias: null,
  cadenciaDias: 7,
  cierreInscripcionOffsetDias: 0,
  clasesPorGrupo: 1,
  gruposPlantillaActivos: 0,
  facilitadoresOmitidosPreview: [],
}

beforeEach(() => {
  formularioMock.mockReset()
  window.history.replaceState(null, '', '/talleres/mujer-de-hoy')
})

describe('AbrirEdicionProvider / BotonAbrirEdicion', () => {
  it('renders nothing for the button outside the provider (no abrirEdicion)', () => {
    render(<BotonAbrirEdicion />)
    expect(screen.queryByRole('button', { name: 'Abrir edición' })).not.toBeInTheDocument()
  })

  it('mounts one closed form with the page props and opens it from any button', () => {
    render(
      <AbrirEdicionProvider formulario={FORMULARIO}>
        <BotonAbrirEdicion />
        <BotonAbrirEdicion variante="outline" />
      </AbrirEdicionProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(formularioMock).toHaveBeenLastCalledWith(expect.objectContaining({ ...FORMULARIO, abierto: false }))
    const botones = screen.getAllByRole('button', { name: 'Abrir edición' })
    expect(botones).toHaveLength(2)
    expect(botones[0]).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(botones[1]!)
    expect(screen.getByRole('dialog', { name: 'Abrir edición de Mujer de Hoy' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on load with #abrir and clears the hash when closed', () => {
    window.history.replaceState(null, '', '/talleres/mujer-de-hoy?x=1#abrir')
    render(
      <AbrirEdicionProvider formulario={FORMULARIO}>
        <BotonAbrirEdicion />
      </AbrirEdicionProvider>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?x=1')
  })

  it('does not open with another hash such as #ediciones', () => {
    window.history.replaceState(null, '', '/talleres/mujer-de-hoy#ediciones')
    render(
      <AbrirEdicionProvider formulario={FORMULARIO}>
        <BotonAbrirEdicion />
      </AbrirEdicionProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
