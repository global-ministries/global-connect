/**
 * "Agregar familiar" sheet (S15 decisions 2–4, 7 and 11): relation first,
 * hijo asks about the age, the path summarizes the relation with "Cambiar",
 * the masked search, the homonym datum (match / no match → "Agregarlo sin
 * cuenta"), the error message of the RPC and the no-account form.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }), usePathname: () => '/perfil' }))
const exito = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: exito, error: jest.fn(), info: jest.fn() }) }))
jest.mock('@/lib/actions/familia.actions', () => ({
  buscarFamiliar: jest.fn(), verificarFamiliar: jest.fn(), solicitarFamiliar: jest.fn(), solicitarFamiliarSinCuenta: jest.fn(),
  responderSolicitud: jest.fn(), cancelarSolicitud: jest.fn(), quitarFamiliar: jest.fn(),
}))

import { MiFamilia } from '@/components/users/familia/mi-familia'
import { buscarFamiliar, solicitarFamiliar, solicitarFamiliarSinCuenta, verificarFamiliar } from '@/lib/actions/familia.actions'

const CANDIDATO = { token: 't-1', nombres: 'José', primerApellido: 'Giménez', inicialSegundoApellido: 'P', campus: 'Barquisimeto', homonimo: true }

async function abrir() {
  render(<MiFamilia familia={{ familiares: [], enviadas: [], recibidas: [] }} campus="Barquisimeto" />)
  await userEvent.click(screen.getAllByRole('button', { name: 'Agregar familiar' })[0])
  return screen.getByRole('dialog', { name: 'Agregar familiar' })
}

beforeEach(() => jest.clearAllMocks())

describe('HojaAgregarFamiliar', () => {
  it('asks the relation first; hijo asks about the age', async () => {
    const hoja = await abrir()
    expect(within(hoja).getByText('1 · ¿Qué es para ti?')).toBeInTheDocument()
    expect(within(hoja).queryByText('2 · ¿Tiene cuenta en Global Connect?')).not.toBeInTheDocument()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Hijo o hija' }))
    expect(within(hoja).getByRole('button', { name: 'Ir a Mis hijos' })).toBeInTheDocument()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Tiene 13 años o más' }))
    expect(within(hoja).getByText('2 · ¿Tiene cuenta en Global Connect?')).toBeInTheDocument()
  })

  it('once a path is chosen the relation is summarized with Cambiar', async () => {
    const hoja = await abrir()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Hermano o hermana' }))
    await userEvent.click(within(hoja).getByRole('button', { name: /Sí, buscarlo/ }))
    expect(within(hoja).queryByRole('button', { name: 'Cónyuge' })).not.toBeInTheDocument()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Cambiar la relación' }))
    expect(within(hoja).getByRole('button', { name: 'Cónyuge' })).toBeInTheDocument()
  })

  it('a homonym asks a datum; no match offers "Agregarlo sin cuenta", a match lets the request go', async () => {
    jest.mocked(buscarFamiliar).mockResolvedValue({ ok: true, data: [CANDIDATO] })
    jest.mocked(verificarFamiliar).mockResolvedValueOnce({ ok: true, data: false }).mockResolvedValueOnce({ ok: true, data: true })
    jest.mocked(solicitarFamiliar).mockResolvedValue({ ok: true, data: 'ENVIADA' })
    const hoja = await abrir()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Hermano o hermana' }))
    await userEvent.click(within(hoja).getByRole('button', { name: /Sí, buscarlo/ }))
    await userEvent.type(within(hoja).getByLabelText('Busca por nombre en Campus Barquisimeto'), 'José Giménez')
    await userEvent.click(await within(hoja).findByRole('button', { name: /José Giménez P\./ }, { timeout: 2000 }))
    expect(buscarFamiliar).toHaveBeenCalledWith('José Giménez')
    expect(within(hoja).getByText('Hay varias personas con este nombre')).toBeInTheDocument()
    const enviar = screen.getByRole('button', { name: 'Enviar solicitud' })
    expect(enviar).toBeDisabled()

    await userEvent.selectOptions(within(hoja).getByLabelText('Día'), '12')
    await userEvent.selectOptions(within(hoja).getByLabelText('Mes'), '3')
    await userEvent.click(within(hoja).getByRole('button', { name: 'Comprobar' }))
    expect(verificarFamiliar).toHaveBeenCalledWith('t-1', { dia: 12, mes: 3 })
    expect(await within(hoja).findByText('Ese dato no coincide con esta persona.')).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Agregarlo sin cuenta' })).toBeInTheDocument()
    expect(enviar).toBeDisabled()

    await userEvent.click(within(hoja).getByRole('button', { name: 'Comprobar' }))
    expect(await within(hoja).findByText('Dato confirmado')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(solicitarFamiliar).toHaveBeenCalledWith('t-1', 'hermano')
    expect(exito).toHaveBeenCalledWith('Solicitud enviada a José Giménez P. Aparecerá en tu familia cuando confirme.')
  })

  it('shows the message of an RPC error code', async () => {
    jest.mocked(buscarFamiliar).mockResolvedValue({ ok: true, data: [{ ...CANDIDATO, homonimo: false }] })
    jest.mocked(solicitarFamiliar).mockResolvedValue({ ok: false, codigo: 'YA_SOLICITADO', mensaje: 'Ya hay una solicitud pendiente con esta persona.' })
    const hoja = await abrir()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Cónyuge' }))
    await userEvent.click(within(hoja).getByRole('button', { name: /Sí, buscarlo/ }))
    await userEvent.type(within(hoja).getByLabelText('Busca por nombre en Campus Barquisimeto'), 'José')
    await userEvent.click(await within(hoja).findByRole('button', { name: /José Giménez P\./ }, { timeout: 2000 }))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(await within(hoja).findByRole('alert')).toHaveTextContent('Ya hay una solicitud pendiente con esta persona.')
  })

  it('without account: required fields, and under 13 points to Mis hijos', async () => {
    jest.mocked(solicitarFamiliarSinCuenta).mockResolvedValue({ ok: true, data: 'ENVIADA' })
    const hoja = await abrir()
    await userEvent.click(within(hoja).getByRole('button', { name: 'Hijo o hija' }))
    await userEvent.click(within(hoja).getByRole('button', { name: 'Tiene 13 años o más' }))
    await userEvent.click(within(hoja).getByRole('button', { name: /No tiene cuenta/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisión' }))
    expect(within(hoja).getByText('Escribe su nombre.')).toBeInTheDocument()
    expect(within(hoja).getByText('Escribe su fecha de nacimiento.')).toBeInTheDocument()
    expect(solicitarFamiliarSinCuenta).not.toHaveBeenCalled()

    await userEvent.type(within(hoja).getByLabelText(/^Nombre/), 'Valentina')
    await userEvent.type(within(hoja).getByLabelText(/^Apellido/), 'Pérez')
    await userEvent.type(within(hoja).getByLabelText(/^Fecha de nacimiento/), '2020-05-01')
    expect(within(hoja).getByText(/Tiene menos de 13 años: regístralo en/)).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Mis hijos' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisión' }))
    expect(solicitarFamiliarSinCuenta).not.toHaveBeenCalled()
  })
})
