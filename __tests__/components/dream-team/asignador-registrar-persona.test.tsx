import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AsignadorServicioDialog } from '@/components/dream-team/asignador-servicio-dialog'

const EQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OTRO_EQ = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const OTRO_ROL = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const TURNO = '00000000-0000-4000-8000-000000000009'

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const OPCIONES = [
  { id: EQ, etiqueta: 'Waumba Land', roles: [{ id: ROL, label: 'voluntario' }] },
  { id: OTRO_EQ, etiqueta: 'Waumba Land › Bebés', roles: [{ id: OTRO_ROL, label: 'voluntario' }] },
]

// GET /registrables answers `opciones`; every other call takes the next queued answer.
const fetchMock = jest.fn()
let opciones: unknown[] = OPCIONES
const toast = { success: jest.fn(), error: jest.fn() }

beforeEach(() => {
  opciones = OPCIONES
  toast.success.mockReset()
  toast.error.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(() => Promise.reject(new Error('unexpected fetch')))
  global.fetch = ((url: string, init?: RequestInit) =>
    url === '/api/dream-team/usuarios/registrables'
      ? respuesta(200, { equipos: opciones })
      : fetchMock(url, init)) as unknown as typeof fetch
})

function abrir({ soloRegistrar = false, onClose = jest.fn(), turnos = [] as { id: string; label: string }[] } = {}) {
  const onAsignado = jest.fn()
  render(
    <AsignadorServicioDialog
      abierto
      onClose={onClose}
      nodosPlanos={[{ id: EQ, etiqueta: 'Waumba Land', ruta: ['Waumba Land'] }]}
      rolesPorEquipo={{ [EQ]: [{ id: ROL, equipoId: EQ, label: 'voluntario', activo: true }] as never }}
      onAsignado={onAsignado}
      toast={toast as never}
      equipoIdInicial={EQ}
      soloRegistrar={soloRegistrar}
      turnos={turnos}
    />,
  )
  return onAsignado
}

const siguiente = () => screen.getByRole('button', { name: 'Siguiente' })

async function llenarBasico() {
  await userEvent.click(await screen.findByRole('button', { name: 'Registrar persona nueva' }))
  await userEvent.type(screen.getByLabelText('Nombre'), 'Ana')
  await userEvent.type(screen.getByLabelText('Apellido'), 'Pérez')
  await userEvent.selectOptions(screen.getByLabelText('Género'), 'Femenino')
}

/** Step 2 with the preselected equipo: pick the rol and go on to step 3. */
async function elegirRolYSeguir() {
  expect(await screen.findByText('Paso 2 de 3: Equipo y rol')).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Rol'), ROL)
  await userEvent.click(siguiente())
  expect(await screen.findByText('Paso 3 de 3: Turno')).toBeInTheDocument()
}

describe('AsignadorServicioDialog — side panel in three steps', () => {
  it('is a labelled dialog with a step indicator, and Esc closes it', async () => {
    const onClose = jest.fn()
    abrir({ onClose })
    const panel = screen.getByRole('dialog', { name: 'Asignar servicio' })
    expect(within(panel).getByRole('list', { name: 'Pasos' })).toBeInTheDocument()
    expect(within(panel).getByText('Persona').closest('li')).toHaveAttribute('aria-current', 'step')
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('assigns an existing person with a shift: search, equipo y rol, turno, Asignar', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, [{ id: 'u-1', email: 'ana@test.com', nombre: 'Ana', apellido: 'Vieja' }]))
    fetchMock.mockReturnValueOnce(respuesta(201, { servicio: { id: 'srv-1' } }))
    fetchMock.mockReturnValueOnce(respuesta(200, { asignados: [TURNO] }))
    const onAsignado = abrir({ turnos: [{ id: TURNO, label: 'Domingo 9:00' }] })

    expect(siguiente()).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Buscar persona'), 'ana')
    await userEvent.click(await screen.findByRole('button', { name: /Ana Vieja/ }))
    await userEvent.click(siguiente())

    expect(await screen.findByRole('radio', { name: 'Waumba Land' })).toHaveAttribute('aria-checked', 'true')
    expect(siguiente()).toBeDisabled()
    await elegirRolYSeguir()

    await userEvent.selectOptions(screen.getByLabelText('Turno (opcional)'), TURNO)
    const resumen = screen.getByRole('region', { name: 'Resumen' })
    expect(within(resumen).getByText('Ana Vieja')).toBeInTheDocument()
    expect(within(resumen).getByText('Domingo 9:00')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }))

    await waitFor(() => expect(onAsignado).toHaveBeenCalled())
    expect(fetchMock.mock.calls[1][0]).toBe('/api/dream-team/servicios')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ personaId: 'u-1', equipoId: EQ, rolId: ROL })
    expect(fetchMock.mock.calls[2][0]).toBe('/api/dream-team/servicios/srv-1/turnos')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ turnoIds: [TURNO] })
  })

  it('keeps the servicio when the shift is rejected (422) and says so', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, [{ id: 'u-1', email: null, nombre: 'Ana', apellido: 'Vieja' }]))
    fetchMock.mockReturnValueOnce(respuesta(201, { servicio: { id: 'srv-1' } }))
    fetchMock.mockReturnValueOnce(respuesta(422, { error: 'El equipo no sirve en ese turno' }))
    const onAsignado = abrir({ turnos: [{ id: TURNO, label: 'Domingo 9:00' }] })
    await userEvent.type(screen.getByLabelText('Buscar persona'), 'ana')
    await userEvent.click(await screen.findByRole('button', { name: /Ana Vieja/ }))
    await userEvent.click(siguiente())
    await elegirRolYSeguir()
    await userEvent.selectOptions(screen.getByLabelText('Turno (opcional)'), TURNO)
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(onAsignado).toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('El equipo no sirve en ese turno'))
  })

  it('goes back with Atrás keeping what was chosen', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, [{ id: 'u-1', email: null, nombre: 'Ana', apellido: 'Vieja' }]))
    abrir()
    await userEvent.type(screen.getByLabelText('Buscar persona'), 'ana')
    await userEvent.click(await screen.findByRole('button', { name: /Ana Vieja/ }))
    await userEvent.click(siguiente())
    await elegirRolYSeguir()
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByLabelText('Rol')).toHaveValue(ROL)
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByText('Ana Vieja')).toBeInTheDocument()
  })
})

describe('AsignadorServicioDialog — Registrar persona nueva', () => {
  it('requires the birth date when there is no cedula', async () => {
    abrir()
    await llenarBasico()
    expect(siguiente()).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2017-01-01')
    expect(siguiente()).toBeEnabled()
  })

  it('keeps the optional data collapsed under Más datos', async () => {
    abrir()
    await llenarBasico()
    expect(screen.queryByLabelText('Teléfono (opcional)')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Más datos (opcional)' }))
    expect(screen.getByLabelText('Teléfono (opcional)')).toBeInTheDocument()
  })

  it('registers and assigns in one request, with a representative found by cedula (opened for a minor)', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { persona: { id: REP, nombre: 'Rep', apellido: 'Uno' } }))
    fetchMock.mockReturnValueOnce(respuesta(201, { resultado: 'creada', personaId: 'n1', nombre: 'Ana Pérez', servicioId: 's1' }))
    const onAsignado = abrir()
    await llenarBasico()
    await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2017-01-01')
    await userEvent.type(await screen.findByLabelText('Cédula del representante'), '12345678')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText('Rep Uno')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Tipo de representante'), 'tutor')
    await userEvent.click(siguiente())
    await elegirRolYSeguir()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }))

    await waitFor(() => expect(onAsignado).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/dream-team/usuarios')
    expect(JSON.parse(init.body)).toMatchObject({
      equipoId: EQ, rolId: ROL, nombre: 'Ana', apellido: 'Pérez', genero: 'Femenino', estadoCivil: 'Soltero',
      fechaNacimiento: '2017-01-01', representanteId: REP, representanteTipo: 'tutor',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops on step 1 when the cedula is taken, and assigns that person through POST servicios', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { persona: { id: 'old-1', nombre: 'Ana', apellido: 'Vieja' } }))
    fetchMock.mockReturnValueOnce(respuesta(201, { servicio: { id: 'srv-1' } }))
    const onAsignado = abrir()
    await llenarBasico()
    await userEvent.type(screen.getByLabelText('Cédula (opcional)'), '12345678')
    await userEvent.click(siguiente())
    expect(await screen.findByText('Ya existe: Ana Vieja')).toBeInTheDocument()
    expect(screen.getByText('Paso 1 de 3: Persona')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/dream-team/usuarios/cedula?cedula=12345678')

    await userEvent.click(screen.getByRole('button', { name: 'Usar esta persona' }))
    await userEvent.click(siguiente())
    await elegirRolYSeguir()
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(onAsignado).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/dream-team/servicios')
    expect(JSON.parse(init.body)).toEqual({ personaId: 'old-1', equipoId: EQ, rolId: ROL })
  })

  it('brings the panel back to step 1 with the namesakes the database reports', async () => {
    fetchMock.mockReturnValueOnce(
      respuesta(200, { resultado: 'coincidencias', candidatos: [{ id: 'x', nombre: 'Ana', apellido: 'Pérez', fechaNacimiento: '2017-01-01' }] }),
    )
    abrir()
    await llenarBasico()
    await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2017-01-01')
    await userEvent.click(siguiente())
    await elegirRolYSeguir()
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    expect(await screen.findByText(/mismo nombre y fecha de nacimiento/)).toBeInTheDocument()
    expect(screen.getByText('Paso 1 de 3: Persona')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar' })).toBeInTheDocument()
    expect(siguiente()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'No es ninguna, registrar igual' }))
    expect(siguiente()).toBeEnabled()
  })

  it('shows the error of a rejected registration (422) and stays on the summary', async () => {
    fetchMock.mockReturnValueOnce(respuesta(422, { error: 'Fecha de nacimiento inválida' }))
    const onAsignado = abrir()
    await llenarBasico()
    await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2017-01-01')
    await userEvent.click(siguiente())
    await elegirRolYSeguir()
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Fecha de nacimiento inválida'))
    expect(onAsignado).not.toHaveBeenCalled()
    expect(screen.getByText('Paso 3 de 3: Turno')).toBeInTheDocument()
  })

  it('offers the new kinships for the representative', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { persona: { id: REP, nombre: 'Rep', apellido: 'Uno' } }))
    abrir()
    await llenarBasico()
    await userEvent.click(screen.getByRole('button', { name: 'Representante (opcional)' }))
    await userEvent.type(screen.getByLabelText('Cédula del representante'), '12345678')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    const tipo = await screen.findByLabelText('Tipo de representante')
    for (const etiqueta of ['Abuelo/a', 'Tío/a', 'Hermano/a mayor', 'Otro familiar']) {
      expect(within(tipo).getByRole('option', { name: etiqueta })).toBeInTheDocument()
    }
  })
})

describe('AsignadorServicioDialog — permissions', () => {
  it('hides Registrar persona nueva from whoever may register nowhere', async () => {
    opciones = []
    fetchMock.mockReturnValue(respuesta(200, []))
    abrir()
    await userEvent.type(screen.getByLabelText('Buscar persona'), 'zz')
    expect(await screen.findByText('Sin resultados.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar persona nueva' })).not.toBeInTheDocument()
  })

  it('offers only the registrable equipos, by path, and their roles while registering', async () => {
    abrir()
    await llenarBasico()
    await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '2017-01-01')
    await userEvent.click(siguiente())
    const radios = (await screen.findAllByRole('radio')).map((r) => r.getAttribute('aria-label'))
    expect(radios).toEqual(['Waumba Land', 'Waumba Land › Bebés'])
    await userEvent.click(screen.getByRole('radio', { name: 'Waumba Land › Bebés' }))
    expect(within(screen.getByLabelText('Rol')).getByRole('option', { name: /voluntario/i })).toHaveValue(OTRO_ROL)
  })

  it('opens straight into the form for a registrar who may not assign, with no way back to the search', async () => {
    abrir({ soloRegistrar: true })
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar persona')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Volver a buscar' })).not.toBeInTheDocument()
  })
})
