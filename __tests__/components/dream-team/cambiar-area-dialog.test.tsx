/**
 * `<CambiarAreaDialog>` (odd/tasks/dream-team-cambiar-area.md, T2, S3 and
 * S5): loads the destinations, moves directly where the viewer directs the
 * destination ("Cambiar de área") and sends a request elsewhere ("Enviar
 * solicitud"); motivo required, nota optional, the rol defaults to the current
 * nivel; the database's Spanish error is shown.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CambiarAreaDialog } from '@/components/dream-team/cambiar-area-dialog'

const EQ_AUD = '00000000-0000-4000-8000-0000000000a1'
const EQ_EST = '00000000-0000-4000-8000-0000000000e1'
const R_AUD_VOL = '00000000-0000-4000-8000-0000000000a2'
const R_AUD_LID = '00000000-0000-4000-8000-0000000000a3'
const R_EST_VOL = '00000000-0000-4000-8000-0000000000e2'

const DESTINOS = {
  destinos: [
    {
      equipoId: EQ_AUD,
      ruta: ['DPS', 'Producción Técnica', 'Audio'],
      experiencia: 'dps',
      dirige: true,
      roles: [
        { id: R_AUD_VOL, label: 'Voluntario', nivel: 'voluntario' },
        { id: R_AUD_LID, label: 'Líder', nivel: 'lider' },
      ],
    },
    {
      equipoId: EQ_EST,
      ruta: ['DPS', 'Operaciones', 'Estacionamiento'],
      experiencia: 'dps',
      dirige: false,
      roles: [{ id: R_EST_VOL, label: 'Voluntario', nivel: 'voluntario' }],
    },
  ],
  nivelActual: 'lider',
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
    <CambiarAreaDialog
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

const enviado = (indice = 1) => JSON.parse(fetchMock.mock.calls[indice][1].body)

it('loads the destinations of the servicio', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, DESTINOS))
  abrir()
  expect(await screen.findByRole('radio', { name: 'DPS › Producción Técnica › Audio' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'DPS › Operaciones › Estacionamiento' })).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/dream-team/servicios/srv-1/cambiar-area', expect.objectContaining({ cache: 'no-store' }))
  expect(screen.getByText(/Ana Pérez/)).toBeInTheDocument()
})

it('moves directly where the viewer directs the destination, keeping the nivel of the rol', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, DESTINOS)).mockReturnValueOnce(respuesta(200, { modo: 'directo', id: 'nuevo' }))
  const { onGuardado, onAbiertoChange } = abrir()
  await user.click(await screen.findByRole('radio', { name: 'DPS › Producción Técnica › Audio' }))
  expect(screen.getByRole('combobox', { name: 'Rol' })).toHaveValue(R_AUD_LID)
  expect(screen.queryByRole('button', { name: 'Enviar solicitud' })).not.toBeInTheDocument()
  const mover = screen.getByRole('button', { name: 'Cambiar de área' })
  expect(mover).toBeDisabled()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Motivo' }), 'correccion')
  await user.click(mover)
  await waitFor(() => expect(onGuardado).toHaveBeenCalled())
  expect(fetchMock.mock.calls[1][0]).toBe('/api/dream-team/servicios/srv-1/cambiar-area')
  expect(fetchMock.mock.calls[1][1].method).toBe('POST')
  expect(enviado()).toEqual({ modo: 'directo', equipoId: EQ_AUD, rolId: R_AUD_LID, motivo: 'correccion', nota: null })
  expect(toast.success).toHaveBeenCalledWith('Ana Pérez pasó a Audio.')
  expect(onAbiertoChange).toHaveBeenCalledWith(false)
})

it('sends a request where the viewer does not direct the destination, with the nota', async () => {
  fetchMock.mockReturnValueOnce(respuesta(200, DESTINOS)).mockReturnValueOnce(respuesta(200, { modo: 'solicitud', id: 'sol' }))
  const { onGuardado } = abrir()
  await user.click(await screen.findByRole('radio', { name: 'DPS › Operaciones › Estacionamiento' }))
  expect(screen.getByText(/No diriges esta área/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cambiar de área' })).not.toBeInTheDocument()
  // Estacionamiento has no Líder: the rol must be chosen.
  expect(screen.getByRole('combobox', { name: 'Rol' })).toHaveValue('')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Motivo' }), 'traslado')
  const solicitar = screen.getByRole('button', { name: 'Enviar solicitud' })
  expect(solicitar).toBeDisabled()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Rol' }), R_EST_VOL)
  await user.type(screen.getByRole('textbox', { name: 'Nota (opcional)' }), 'Sirve en el estacionamiento')
  await user.click(solicitar)
  await waitFor(() => expect(onGuardado).toHaveBeenCalled())
  expect(enviado()).toEqual({
    modo: 'solicitud',
    equipoId: EQ_EST,
    rolId: R_EST_VOL,
    motivo: 'traslado',
    nota: 'Sirve en el estacionamiento',
  })
  expect(toast.success).toHaveBeenCalledWith('Solicitud enviada. Un director de ambas áreas la va a revisar.')
})

it('shows the Spanish error of the database and stays open', async () => {
  const mensaje = 'Este servicio ya tiene una solicitud de cambio de área pendiente.'
  fetchMock.mockReturnValueOnce(respuesta(200, DESTINOS)).mockReturnValueOnce(respuesta(422, { error: mensaje }))
  const { onGuardado } = abrir()
  await user.click(await screen.findByRole('radio', { name: 'DPS › Operaciones › Estacionamiento' }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Motivo' }), 'traslado')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Rol' }), R_EST_VOL)
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
  expect(onGuardado).not.toHaveBeenCalled()
  expect(toast.success).not.toHaveBeenCalled()
})

it('shows why the destinations could not load', async () => {
  fetchMock.mockReturnValueOnce(respuesta(403, { error: 'No tienes autoridad de director sobre el área actual de este servicio.' }))
  abrir()
  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes autoridad de director sobre el área actual de este servicio.')
})
