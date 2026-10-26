/**
 * Mi equipo — "Calendario" of a dated shift (T2 of odd/tasks/tlr-calendario-servicios.md,
 * S1, S2, S4, A2): its planned dates (upcoming first, past collapsed), "+ Fecha"
 * for whoever may plan them, and per date who serves, with "Todos" in one click.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CalendarioTurnos } from '@/components/dream-team/mi-equipo/calendario-turnos'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { personaId } from '@/lib/platform/dream-team/types'

const TLR = '00000000-0000-4000-8000-000000000010'
const T9 = '00000000-0000-4000-8000-000000000009'
const F1 = '00000000-0000-4000-8000-0000000000f1'
const F2 = '00000000-0000-4000-8000-0000000000f2'
const F0 = '00000000-0000-4000-8000-0000000000f0'
const S_ANA = '00000000-0000-4000-8000-00000000000a'
const S_BETO = '00000000-0000-4000-8000-00000000000b'
const S_CARLA = '00000000-0000-4000-8000-00000000000c'
const S_DANI = '00000000-0000-4000-8000-00000000000d'
/** Serves on F1 but is not on this card: the save must keep it. */
const S_OTRO = '00000000-0000-4000-8000-0000000000ee'

function persona(servicioId: string, nombre: string, turnoIds: string[]): PersonaVista {
  return {
    clave: servicioId,
    servicioId,
    personaId: personaId(`11111111-1111-4111-8111-${servicioId.slice(-12)}`),
    nombre,
    iniciales: nombre.slice(0, 2).toUpperCase(),
    equipoId: 'e-tlr',
    equipoLabel: 'The Living Room',
    rolClave: 'voluntario',
    rolLabel: 'Voluntario',
    rolOrden: 3,
    estado: 'activo',
    origen: 'dream_team',
    editable: true,
    telefono: null,
    tieneCuenta: true,
    turnoIds,
  }
}

const personas: PersonaVista[] = [
  persona(S_ANA, 'Ana', [TLR]),
  persona(S_BETO, 'Beto', [TLR, T9]),
  persona(S_CARLA, 'Carla', [TLR]),
  persona(S_DANI, 'Dani', [T9]),
]

function calendario(puedeGestionar: boolean) {
  return {
    turnos: [
      {
        id: TLR,
        nombre: 'The Living Room',
        hora: '10:00',
        puedeGestionar,
        fechas: [
          { id: F2, turnoId: TLR, fecha: '2026-11-22', hora: '11:00', nota: 'Bautizos', servidores: [] },
          { id: F0, turnoId: TLR, fecha: '2026-10-11', hora: null, nota: null, servidores: [S_ANA] },
          { id: F1, turnoId: TLR, fecha: '2026-11-08', hora: null, nota: null, servidores: [S_ANA, S_OTRO] },
        ],
      },
    ],
  }
}

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const fetchMock = jest.fn()
const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }

beforeEach(() => {
  fetchMock.mockReset()
  toast.success.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function montar() {
  return render(<CalendarioTurnos equipoId="e-tlr" personas={personas} toast={toast as never} hoy="2026-10-26" />)
}

describe('CalendarioTurnos', () => {
  it('lists the planned dates, upcoming first, with the past ones collapsed', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, calendario(true)))
    montar()
    const region = await screen.findByRole('region', { name: 'Calendario · The Living Room' })
    expect(fetchMock).toHaveBeenCalledWith('/api/dream-team/turnos/calendario?equipoId=e-tlr', expect.objectContaining({ cache: 'no-store' }))
    const proximas = within(region).getByRole('list', { name: 'Próximas fechas' })
    const filas = within(proximas).getAllByRole('button')
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringContaining('Domingo 8 nov · 10:00'),
      expect.stringContaining('Domingo 22 nov · 11:00'),
    ])
    expect(filas[0]).toHaveTextContent('1 de 3 sirven')
    expect(filas[1]).toHaveTextContent('Bautizos')
    expect(within(region).getByText('Fechas pasadas (1)')).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Agregar fecha' })).toBeInTheDocument()
  })

  it('"Todos" marks every volunteer of the shift in one click, one can be unmarked, and Guardar sends the ids', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, calendario(true)))
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /Domingo 8 nov/ }))
    const panel = await screen.findByRole('dialog', { name: 'Domingo 8 nov' })
    // Only the volunteers assigned to the shift, never Dani (another shift).
    expect(within(panel).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? c.id)).toHaveLength(3)
    expect(within(panel).queryByText('Dani')).not.toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: /Ana/ })).toBeChecked()
    expect(within(panel).getByText('1 de 3 sirven')).toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('button', { name: 'Todos' }))
    for (const nombre of [/Ana/, /Beto/, /Carla/]) expect(within(panel).getByRole('checkbox', { name: nombre })).toBeChecked()
    expect(within(panel).getByText('3 de 3 sirven')).toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('checkbox', { name: /Beto/ }))
    expect(within(panel).getByText('2 de 3 sirven')).toBeInTheDocument()

    fetchMock.mockReturnValueOnce(respuesta(200, { sirven: 3 }))
    fetchMock.mockReturnValueOnce(respuesta(200, calendario(true)))
    await userEvent.click(within(panel).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe(`/api/dream-team/turnos/${TLR}/fechas/${F1}/servidores`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ servicioIds: [S_ANA, S_CARLA, S_OTRO] })
  })

  it('without authority: no "+ Fecha", and the date panel only shows who serves', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, calendario(false)))
    montar()
    await screen.findByRole('region', { name: 'Calendario · The Living Room' })
    expect(screen.queryByRole('button', { name: 'Agregar fecha' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Domingo 8 nov/ }))
    const panel = await screen.findByRole('dialog', { name: 'Domingo 8 nov' })
    expect(within(panel).queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: /Ana/ })).toBeDisabled()
  })

  it('"+ Fecha" plans a date and shows the refusal of the database', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, calendario(true)))
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar fecha' }))
    const panel = await screen.findByRole('dialog', { name: 'Nueva fecha' })
    await userEvent.type(within(panel).getByLabelText('Fecha'), '2026-11-29')
    await userEvent.type(within(panel).getByLabelText('Nota (opcional)'), 'Navidad')
    fetchMock.mockReturnValueOnce(respuesta(403, { error: 'No tienes permiso para planificar las fechas de este turno.' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Guardar' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No tienes permiso para planificar las fechas de este turno.')
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe(`/api/dream-team/turnos/${TLR}/fechas`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ fecha: '2026-11-29', hora: null, nota: 'Navidad' })
  })

  it('edits and deletes a planned date', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, calendario(true)))
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /Domingo 22 nov/ }))
    let panel = await screen.findByRole('dialog', { name: 'Domingo 22 nov' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Editar fecha' }))
    panel = await screen.findByRole('dialog', { name: 'Editar fecha' })
    expect(within(panel).getByLabelText('Fecha')).toHaveValue('2026-11-22')
    expect(within(panel).getByLabelText('Hora (opcional)')).toHaveValue('11:00')
    fetchMock.mockReturnValueOnce(respuesta(200, { id: F2 }))
    fetchMock.mockReturnValueOnce(respuesta(200, calendario(true)))
    await userEvent.click(within(panel).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/dream-team/turnos/${TLR}/fechas/${F2}`)
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH')

    await userEvent.click(await screen.findByRole('button', { name: /Domingo 22 nov/ }))
    panel = await screen.findByRole('dialog', { name: 'Domingo 22 nov' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Borrar fecha' }))
    fetchMock.mockReturnValueOnce(respuesta(200, { borrada: true }))
    fetchMock.mockReturnValueOnce(respuesta(200, calendario(true)))
    await userEvent.click(within(panel).getByRole('button', { name: 'Sí, borrar' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    expect(fetchMock.mock.calls[3][0]).toBe(`/api/dream-team/turnos/${TLR}/fechas/${F2}`)
    expect(fetchMock.mock.calls[3][1].method).toBe('DELETE')
  })

  it('renders nothing when the team serves in no dated shift', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { turnos: [] }))
    const { container } = montar()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
