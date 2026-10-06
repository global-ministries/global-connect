import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AsignadorServicioDialog } from '@/components/dream-team/asignador-servicio-dialog'

const EQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const fetchMock = jest.fn()
const toast = { success: jest.fn(), error: jest.fn() } as never

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function abrir(onAsignado = jest.fn()) {
  render(
    <AsignadorServicioDialog
      abierto
      onClose={jest.fn()}
      nodosPlanos={[{ id: EQ, etiqueta: 'Waumba Land' }]}
      rolesPorEquipo={{ [EQ]: [{ id: ROL, equipoId: EQ, label: 'voluntario', activo: true }] as never }}
      onAsignado={onAsignado}
      toast={toast}
      equipoIdInicial={EQ}
    />,
  )
  return onAsignado
}

async function llenarBasico() {
  await userEvent.click(screen.getByRole('button', { name: 'Registrar persona nueva' }))
  await userEvent.selectOptions(screen.getByLabelText('Rol'), ROL)
  await userEvent.type(screen.getByLabelText('Nombre'), 'Ana')
  await userEvent.type(screen.getByLabelText('Apellido'), 'Pérez')
  await userEvent.selectOptions(screen.getByLabelText('Género'), 'Femenino')
}

it('requires the birth date when there is no cedula', async () => {
  abrir()
  await llenarBasico()
  expect(screen.getByRole('button', { name: 'Registrar y asignar' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2017-01-01')
  expect(screen.getByRole('button', { name: 'Registrar y asignar' })).toBeEnabled()
})

it('registers and assigns, with an optional representative found by cedula', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { persona: { id: REP, nombre: 'Rep', apellido: 'Uno' } }))
  fetchMock.mockReturnValueOnce(respuesta(201, { resultado: 'creada', personaId: 'n1', nombre: 'Ana Pérez', servicioId: 's1' }))
  const onAsignado = abrir()
  await llenarBasico()
  await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2017-01-01')
  await userEvent.type(screen.getByLabelText('Cédula del representante'), '12345678')
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  expect(await screen.findByText('Rep Uno')).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Tipo de representante'), 'tutor')
  await userEvent.click(screen.getByRole('button', { name: 'Registrar y asignar' }))
  await waitFor(() => expect(onAsignado).toHaveBeenCalled())
  const [url, init] = fetchMock.mock.calls[1]
  expect(url).toBe('/api/dream-team/usuarios')
  expect(JSON.parse(init.body)).toMatchObject({
    equipoId: EQ, rolId: ROL, nombre: 'Ana', apellido: 'Pérez', genero: 'Femenino', estadoCivil: 'Soltero',
    fechaNacimiento: '2017-01-01', representanteId: REP, representanteTipo: 'tutor',
  })
})

it('offers the existing person when the cedula is taken, and assigns them through POST servicios', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { resultado: 'existente', personaId: 'old-1', nombre: 'Ana Vieja' }))
  fetchMock.mockReturnValueOnce(respuesta(201, {}))
  const onAsignado = abrir()
  await llenarBasico()
  await userEvent.type(screen.getByLabelText('Cédula (opcional)'), '12345678')
  await userEvent.click(screen.getByRole('button', { name: 'Registrar y asignar' }))
  expect(await screen.findByText('Ya existe: Ana Vieja')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Usar esta persona' }))
  await userEvent.click(screen.getByRole('button', { name: 'Crear' }))
  await waitFor(() => expect(onAsignado).toHaveBeenCalled())
  const [url, init] = fetchMock.mock.calls[1]
  expect(url).toBe('/api/dream-team/servicios')
  expect(JSON.parse(init.body)).toEqual({ personaId: 'old-1', equipoId: EQ, rolId: ROL })
})

it('lists namesakes born the same day instead of creating', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { resultado: 'coincidencias', candidatos: [{ id: 'x', nombre: 'Ana', apellido: 'Pérez', fechaNacimiento: '2017-01-01' }] }))
  abrir()
  await llenarBasico()
  await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2017-01-01')
  await userEvent.click(screen.getByRole('button', { name: 'Registrar y asignar' }))
  expect(await screen.findByText(/mismo nombre y fecha de nacimiento/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Usar' })).toBeInTheDocument()
})
