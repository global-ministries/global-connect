import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AsignadorServicioDialog } from '@/components/dream-team/asignador-servicio-dialog'

const EQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const OTRO_EQ = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const OTRO_ROL = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const OPCIONES = [
  { id: EQ, etiqueta: 'Waumba Land', roles: [{ id: ROL, label: 'voluntario' }] },
  { id: OTRO_EQ, etiqueta: 'Waumba Land › Bebés', roles: [{ id: OTRO_ROL, label: 'voluntario' }] },
]

// GET /registrables answers `opciones`; every other call takes the next queued answer.
const fetchMock = jest.fn()
let opciones: unknown[] = OPCIONES
const toast = { success: jest.fn(), error: jest.fn() } as never

beforeEach(() => {
  opciones = OPCIONES
  fetchMock.mockReset()
  fetchMock.mockImplementation(() => Promise.reject(new Error('unexpected fetch')))
  global.fetch = ((url: string, init?: RequestInit) =>
    url === '/api/dream-team/usuarios/registrables'
      ? respuesta(200, { equipos: opciones })
      : fetchMock(url, init)) as unknown as typeof fetch
})

function abrir(onAsignado = jest.fn(), soloRegistrar = false) {
  render(
    <AsignadorServicioDialog
      abierto
      onClose={jest.fn()}
      nodosPlanos={[{ id: EQ, etiqueta: 'Waumba Land' }]}
      rolesPorEquipo={{ [EQ]: [{ id: ROL, equipoId: EQ, label: 'voluntario', activo: true }] as never }}
      onAsignado={onAsignado}
      toast={toast}
      equipoIdInicial={EQ}
      soloRegistrar={soloRegistrar}
    />,
  )
  return onAsignado
}

async function llenarBasico() {
  await userEvent.click(await screen.findByRole('button', { name: 'Registrar persona nueva' }))
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

it('hides Registrar persona nueva from whoever may register nowhere', async () => {
  opciones = []
  abrir()
  await userEvent.type(screen.getByLabelText('Buscar persona'), 'zz')
  fetchMock.mockReturnValue(respuesta(200, []))
  expect(await screen.findByText('Sin resultados.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Registrar persona nueva' })).not.toBeInTheDocument()
})

it('offers only the registrable equipos and their roles while registering', async () => {
  abrir()
  await userEvent.click(await screen.findByRole('button', { name: 'Registrar persona nueva' }))
  const equipo = screen.getByLabelText('Equipo')
  expect(within(equipo).getByRole('option', { name: 'Waumba Land › Bebés' })).toBeInTheDocument()
  await userEvent.selectOptions(equipo, OTRO_EQ)
  expect(within(screen.getByLabelText('Rol')).getByRole('option', { name: /voluntario/i })).toHaveValue(OTRO_ROL)
})

it('opens straight into the form for a registrar who may not assign', async () => {
  abrir(jest.fn(), true)
  expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
  expect(screen.queryByLabelText('Buscar persona')).not.toBeInTheDocument()
})

it('offers the new kinships for the representative', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, { persona: { id: REP, nombre: 'Rep', apellido: 'Uno' } }))
  abrir()
  await llenarBasico()
  await userEvent.type(screen.getByLabelText('Cédula del representante'), '12345678')
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  const tipo = await screen.findByLabelText('Tipo de representante')
  for (const etiqueta of ['Abuelo/a', 'Tío/a', 'Hermano/a mayor', 'Otro familiar']) {
    expect(within(tipo).getByRole('option', { name: etiqueta })).toBeInTheDocument()
  }
})
