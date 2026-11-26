/**
 * `<CambiarRolDialog>` (odd/tasks/dream-team-cambiar-rol.md, T1, S1–S3): loads
 * the roles of the servicio's own equipo, shows the current one, offers only
 * the assignable others, saves at once with an optional nota and says «Rol
 * actualizado»; the server's plain-Spanish error is shown.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CambiarRolDialog } from '@/components/dream-team/cambiar-rol-dialog'

const R_VOL = '00000000-0000-4000-8000-0000000000a1'
const R_LID = '00000000-0000-4000-8000-0000000000a2'
const R_COORD = '00000000-0000-4000-8000-0000000000a3'
const R_DIR = '00000000-0000-4000-8000-0000000000a4'

const ROLES = {
  roles: [
    { id: R_COORD, label: 'Coordinador', nivel: 'coordinador', actual: false, asignable: true },
    { id: R_DIR, label: 'Director', nivel: 'director', actual: false, asignable: false },
    { id: R_LID, label: 'Líder', nivel: 'lider', actual: false, asignable: true },
    { id: R_VOL, label: 'Voluntario', nivel: 'voluntario', actual: true, asignable: false },
  ],
}

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const fetchMock = jest.fn()
const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  fetchMock.mockReset()
  toast.success.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
  user = userEvent.setup({ delay: null })
})

function abrir() {
  const onGuardado = jest.fn()
  const onAbiertoChange = jest.fn()
  render(
    <CambiarRolDialog
      servicioId="srv-1"
      nombre="Ana Pérez"
      equipoActual="Cámaras"
      abierto
      onAbiertoChange={onAbiertoChange}
      onGuardado={onGuardado}
      toast={toast}
    />,
  )
  return { onGuardado, onAbiertoChange }
}

it('loads the roles of the same equipo, shows the current one and offers only the assignable others', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, ROLES))
  abrir()
  const dialogo = await screen.findByRole('dialog', { name: 'Cambiar rol' })
  expect(fetchMock).toHaveBeenCalledWith('/api/dream-team/servicios/srv-1/cambiar-rol', expect.objectContaining({ cache: 'no-store' }))
  expect(within(dialogo).getByText(/Ana Pérez/)).toBeInTheDocument()
  expect(await within(dialogo).findByText('Rol actual: Voluntario')).toBeInTheDocument()
  const select = screen.getByRole('combobox', { name: 'Rol nuevo' })
  const opciones = within(select)
    .getAllByRole('option')
    .map((o) => o.textContent)
  expect(opciones).toEqual(['Elige el rol nuevo', 'Coordinador', 'Líder'])
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
})

it('saves the new rol at once with the nota, says «Rol actualizado» and refreshes', async () => {
  fetchMock
    .mockReturnValueOnce(respuesta(200, ROLES))
    .mockReturnValueOnce(respuesta(200, { servicioId: 'srv-1', rolAnteriorId: R_VOL, rolId: R_LID, rolLabel: 'Líder' }))
  const { onGuardado, onAbiertoChange } = abrir()
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Rol nuevo' }), R_LID)
  await user.type(screen.getByRole('textbox', { name: 'Nota (opcional)' }), 'Ya lidera el turno')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onGuardado).toHaveBeenCalled())
  expect(fetchMock.mock.calls[1][0]).toBe('/api/dream-team/servicios/srv-1/cambiar-rol')
  expect(fetchMock.mock.calls[1][1].method).toBe('POST')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ rolId: R_LID, nota: 'Ya lidera el turno' })
  expect(toast.success).toHaveBeenCalledWith('Rol actualizado')
  expect(onAbiertoChange).toHaveBeenCalledWith(false)
})

it('sends a null nota when it is blank', async () => {
  fetchMock
    .mockReturnValueOnce(respuesta(200, ROLES))
    .mockReturnValueOnce(respuesta(200, { servicioId: 'srv-1', rolAnteriorId: R_VOL, rolId: R_COORD, rolLabel: 'Coordinador' }))
  const { onGuardado } = abrir()
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Rol nuevo' }), R_COORD)
  await user.type(screen.getByRole('textbox', { name: 'Nota (opcional)' }), '   ')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onGuardado).toHaveBeenCalled())
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ rolId: R_COORD, nota: null })
})

it('shows the plain-Spanish error and stays open', async () => {
  const mensaje = 'Solo la dirección del área puede nombrar coordinadores o directores.'
  fetchMock.mockReturnValueOnce(respuesta(200, ROLES)).mockReturnValueOnce(respuesta(403, { error: mensaje }))
  const { onGuardado, onAbiertoChange } = abrir()
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Rol nuevo' }), R_LID)
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
  expect(onGuardado).not.toHaveBeenCalled()
  expect(onAbiertoChange).not.toHaveBeenCalledWith(false)
  expect(toast.success).not.toHaveBeenCalled()
})

it('says so when the equipo has no other rol to pick', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { roles: [ROLES.roles[3]] }))
  abrir()
  const select = await screen.findByRole('combobox', { name: 'Rol nuevo' })
  expect(select).toBeDisabled()
  expect(within(select).getByRole('option', { name: 'No hay otro rol disponible en esta área' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
})

it('shows why the roles could not load, without the form', async () => {
  fetchMock.mockReturnValueOnce(respuesta(403, { error: 'No puedes cambiar tu propio rol. Pídeselo a la dirección del área.' }))
  abrir()
  expect(await screen.findByRole('alert')).toHaveTextContent('No puedes cambiar tu propio rol. Pídeselo a la dirección del área.')
  expect(screen.queryByRole('combobox', { name: 'Rol nuevo' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
})

it('shows why a coordinator may not change the rol of a coordinator or a director (T2, S6), without the form', async () => {
  const mensaje = 'Solo la dirección del área puede cambiar el rol de un coordinador o de un director.'
  fetchMock.mockReturnValueOnce(respuesta(403, { error: mensaje }))
  abrir()
  expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
  expect(screen.queryByRole('combobox', { name: 'Rol nuevo' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
})
