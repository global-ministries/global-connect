/**
 * `<AnioEscolar>` — the "Año escolar" row of a person detail (C6b4, S16). The
 * server actions are mocked; each flow checks what the row sends and shows.
 * Every person is fictitious.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AnioEscolar } from '@/components/estudiantes/lista/anio-escolar'
import * as acciones from '@/lib/actions/estudiantes-ficha.actions'
import type { FichaEstudiante } from '@/lib/platform/estudiantes/ficha'

jest.mock('@/lib/actions/estudiantes-ficha.actions', () => ({ leerFicha: jest.fn(), guardarFicha: jest.fn() }))

const exito = jest.fn()
const fallo = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: exito, error: fallo, info: jest.fn() }),
}))

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const mock = acciones as jest.Mocked<typeof acciones>
let user: ReturnType<typeof userEvent.setup>

const FICHA: FichaEstudiante = {
  personaId: 'p1',
  campusId: 'c1',
  anioActual: 2,
  anioFinal: 6,
  egresado: false,
  puedeEditar: true,
  escala: [
    { numero: 1, etiqueta: '1er año', ambito: 'Transit' },
    { numero: 2, etiqueta: '2do año', ambito: 'Transit' },
    { numero: 3, etiqueta: '3er año', ambito: 'Transit' },
    { numero: 4, etiqueta: '4to año', ambito: 'Inside Out' },
    { numero: 5, etiqueta: '5to año', ambito: 'Inside Out' },
    { numero: 6, etiqueta: '6to año', ambito: 'Inside Out' },
  ],
}

const opciones = (etiqueta: string) =>
  Array.from((screen.getByLabelText(etiqueta) as HTMLSelectElement).options)
    .filter((o) => o.value !== '')
    .map((o) => o.textContent)

async function abrirEditor(ficha: FichaEstudiante = FICHA): Promise<void> {
  mock.leerFicha.mockResolvedValueOnce({ ok: true, data: ficha })
  render(<AnioEscolar personaId="p1" nombre="Camila Herrera" />)
  await user.click(await screen.findByRole('button', { name: 'Editar el año escolar de Camila Herrera' }))
}

beforeEach(() => {
  jest.clearAllMocks()
  user = userEvent.setup({ delay: null })
})

describe('the row', () => {
  it('reads the ficha of the person and shows both years', async () => {
    mock.leerFicha.mockResolvedValueOnce({ ok: true, data: FICHA })
    render(<AnioEscolar personaId="p1" nombre="Camila Herrera" />)
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(await screen.findByText('2do año · termina en 6to año')).toBeInTheDocument()
    expect(mock.leerFicha).toHaveBeenCalledWith('p1')
  })

  it('without ficha says so and still offers "Editar"', async () => {
    mock.leerFicha.mockResolvedValueOnce({ ok: true, data: { ...FICHA, anioActual: null, anioFinal: null } })
    render(<AnioEscolar personaId="p1" nombre="Camila Herrera" />)
    expect(await screen.findByText('Sin año escolar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar el año escolar de Camila Herrera' })).toBeInTheDocument()
  })

  it('a graduate shows the year without "Editar"', async () => {
    mock.leerFicha.mockResolvedValueOnce({ ok: true, data: { ...FICHA, anioActual: 6, egresado: true, puedeEditar: false } })
    render(<AnioEscolar personaId="p1" nombre="Camila Herrera" />)
    expect(await screen.findByText('6to año · egresó')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
  })

  it.each([['anio_no_aplica' as const], ['sin_autoridad' as const]])('hides for %s', async (codigo) => {
    mock.leerFicha.mockResolvedValueOnce({ ok: false, message: 'x', codigo })
    const { container } = render(<AnioEscolar personaId="p1" nombre="Camila Herrera" />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('shows a failed read', async () => {
    mock.leerFicha.mockResolvedValueOnce({ ok: false, message: 'No se pudo cargar el año escolar.', codigo: null })
    render(<AnioEscolar personaId="p1" nombre="Camila Herrera" />)
    expect(await screen.findByText('No se pudo cargar el año escolar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
  })
})

describe('editing', () => {
  it('starts from the stored years; "Termina el colegio en" offers only years from the año actual on', async () => {
    await abrirEditor()
    expect(screen.getByLabelText('Año actual')).toHaveValue('2')
    expect(screen.getByLabelText('Termina el colegio en')).toHaveValue('6')
    expect(opciones('Año actual')).toEqual(['1er año', '2do año', '3er año', '4to año', '5to año', '6to año'])
    expect(opciones('Termina el colegio en')).toEqual(['2do año', '3er año', '4to año', '5to año', '6to año'])
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('saves, announces, refreshes and shows the new years', async () => {
    mock.guardarFicha.mockResolvedValueOnce({ ok: true, data: null })
    await abrirEditor()
    await user.selectOptions(screen.getByLabelText('Año actual'), '3')
    await user.selectOptions(screen.getByLabelText('Termina el colegio en'), '5')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(mock.guardarFicha).toHaveBeenCalledWith('p1', 3, 5)
    expect(await screen.findByText('3er año · termina en 5to año')).toBeInTheDocument()
    expect(exito).toHaveBeenCalledWith('Año escolar de Camila Herrera guardado')
    expect(refresh).toHaveBeenCalled()
    expect(screen.queryByLabelText('Año actual')).not.toBeInTheDocument()
  })

  it('an año actual after the año final moves it to the last year of the scale', async () => {
    await abrirEditor({ ...FICHA, anioFinal: 3 })
    await user.selectOptions(screen.getByLabelText('Año actual'), '5')
    expect(screen.getByLabelText('Termina el colegio en')).toHaveValue('6')
    expect(opciones('Termina el colegio en')).toEqual(['5to año', '6to año'])
  })

  it('without ficha asks for the año actual before saving', async () => {
    await abrirEditor({ ...FICHA, anioActual: null, anioFinal: null })
    expect(screen.getByLabelText('Año actual')).toHaveValue('')
    expect(screen.getByLabelText('Termina el colegio en')).toHaveValue('6')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elige el año actual.')
    expect(mock.guardarFicha).not.toHaveBeenCalled()
  })

  it('keeps the editor and shows the error when the server refuses', async () => {
    mock.guardarFicha.mockResolvedValueOnce({ ok: false, message: 'No tienes permiso para editar el año escolar de esta persona.', codigo: 'sin_autoridad' })
    await abrirEditor()
    await user.selectOptions(screen.getByLabelText('Año actual'), '3')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(fallo).toHaveBeenCalledWith('No tienes permiso para editar el año escolar de esta persona.'))
    expect(screen.getByLabelText('Año actual')).toHaveValue('3')
    expect(refresh).not.toHaveBeenCalled()
    expect(exito).not.toHaveBeenCalled()
  })

  it('"Cancelar" drops the changes', async () => {
    await abrirEditor()
    await user.selectOptions(screen.getByLabelText('Año actual'), '4')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('2do año · termina en 6to año')).toBeInTheDocument()
    expect(mock.guardarFicha).not.toHaveBeenCalled()
  })
})
