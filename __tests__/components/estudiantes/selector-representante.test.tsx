/**
 * `<SelectorRepresentante>` — the search-first picker of a student's
 * representante (S1 of odd/tasks/representante-buscador.md): buscar · elegido
 * · nuevo, driven by props so the visitor form (T1) and the member view (T3)
 * share it. `buscarPersonas` is mocked. Every person is fictitious.
 */
import React, { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SelectorRepresentante, type PersonaElegida } from '@/components/estudiantes/representante/selector-representante'
import * as accionesGrupos from '@/lib/actions/estudiantes-grupos.actions'

jest.mock('@/lib/actions/estudiantes-grupos.actions', () => ({ buscarPersonas: jest.fn() }))

jest.setTimeout(15_000)

const mockGrupos = accionesGrupos as jest.Mocked<typeof accionesGrupos>
let user: ReturnType<typeof userEvent.setup>

const PATRICIA = { personaId: 'r-7', nombre: 'Patricia Ferrer', grupoId: 'g9', grupo: 'Zona Este · Chicas', enEsteGrupo: false }
const JOSE = { personaId: 'r-8', nombre: 'José Rangel', grupoId: 'g2', grupo: '2do año · Chicas', enEsteGrupo: true }

const onElegir = jest.fn()

function Anfitrion(): React.ReactElement {
  const [elegido, setElegido] = useState<PersonaElegida | null>(null)
  const [nuevo, setNuevo] = useState(false)
  return (
    <SelectorRepresentante
      id="rep"
      grupoId="g2"
      elegido={elegido}
      nuevo={nuevo}
      onElegir={(persona) => {
        onElegir(persona)
        setElegido(persona)
        setNuevo(false)
      }}
      onCambiar={() => {
        setElegido(null)
        setNuevo(false)
      }}
      onRegistrar={() => setNuevo(true)}
    >
      <label>
        Nombre
        <input />
      </label>
    </SelectorRepresentante>
  )
}

const buscador = () => screen.getByRole('searchbox', { name: 'Buscar por cédula, teléfono o nombre' })

beforeEach(() => {
  jest.clearAllMocks()
  user = userEvent.setup({ delay: null })
})

describe('buscar', () => {
  it('waits for 3 characters, then searches with { grupoId, consulta } once the typing stops', async () => {
    mockGrupos.buscarPersonas.mockResolvedValue({ ok: true, data: [PATRICIA] })
    render(<Anfitrion />)
    await user.type(buscador(), 'pa')
    expect(screen.getByText('Escribe al menos 3 letras o números.')).toBeInTheDocument()
    expect(mockGrupos.buscarPersonas).not.toHaveBeenCalled()
    await user.type(buscador(), 'tricia ferrer')
    await waitFor(() => expect(mockGrupos.buscarPersonas).toHaveBeenCalledWith({ grupoId: 'g2', consulta: 'patricia ferrer' }))
    // Debounced: one call for the whole word, not one per key.
    expect(mockGrupos.buscarPersonas).toHaveBeenCalledTimes(1)
    const lista = await screen.findByRole('list', { name: 'Posibles representantes' })
    expect(within(lista).getByText('Patricia Ferrer')).toBeInTheDocument()
    expect(within(lista).getByText('Coincide por nombre · Zona Este · Chicas')).toBeInTheDocument()
  })

  it('a person in a group (even this one) can be picked as representante', async () => {
    mockGrupos.buscarPersonas.mockResolvedValue({ ok: true, data: [PATRICIA, JOSE] })
    render(<Anfitrion />)
    await user.type(buscador(), '0414 555 0161')
    expect(await screen.findByText('Coincide por cédula o teléfono · 2do año · Chicas')).toBeInTheDocument()
    expect(screen.queryByText('Ya está en este grupo')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Elegir a José Rangel como representante' }))
    expect(onElegir).toHaveBeenCalledWith({ personaId: 'r-8', nombre: 'José Rangel' })
  })

  it('says exactly what matched when the database tells (coincide)', async () => {
    mockGrupos.buscarPersonas.mockResolvedValue({ ok: true, data: [{ ...PATRICIA, coincide: ['telefono'] }] })
    render(<Anfitrion />)
    await user.type(buscador(), '0414 555 0161')
    expect(await screen.findByText('Coincide por teléfono · Zona Este · Chicas')).toBeInTheDocument()
  })

  it('shows «Nadie coincide» and the search error', async () => {
    mockGrupos.buscarPersonas.mockResolvedValueOnce({ ok: true, data: [] }).mockResolvedValueOnce({ ok: false, message: 'No se pudo buscar.' })
    render(<Anfitrion />)
    await user.type(buscador(), 'zzz')
    expect(await screen.findByText(/^Nadie coincide con «zzz»/)).toBeInTheDocument()
    await user.type(buscador(), 'z')
    expect(await screen.findByText('No se pudo buscar.')).toBeInTheDocument()
  })

  it('Enter in the search does not submit the surrounding form', async () => {
    const enviar = jest.fn((e: React.FormEvent) => e.preventDefault())
    mockGrupos.buscarPersonas.mockResolvedValue({ ok: true, data: [] })
    render(
      <form onSubmit={enviar}>
        <Anfitrion />
      </form>,
    )
    await user.type(buscador(), 'patricia{Enter}')
    expect(enviar).not.toHaveBeenCalled()
  })
})

describe('elegido and nuevo', () => {
  it('shows the chosen person with «Cambiar», which goes back to the search', async () => {
    mockGrupos.buscarPersonas.mockResolvedValue({ ok: true, data: [PATRICIA] })
    render(<Anfitrion />)
    await user.type(buscador(), 'patricia')
    await user.click(await screen.findByRole('button', { name: 'Elegir a Patricia Ferrer como representante' }))
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByText('Patricia Ferrer')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(buscador()).toBeInTheDocument()
  })

  it('«No está, registrarlo» shows the fields and «Volver a buscar» hides them', async () => {
    render(<Anfitrion />)
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'No está, registrarlo' }))
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Volver a buscar' }))
    expect(buscador()).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
  })
})
