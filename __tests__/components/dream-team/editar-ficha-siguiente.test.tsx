/**
 * "Editar ficha" opened from an alert (odd/tasks/dream-team-pendientes-director.md,
 * T4, S6; artboard design/pendientes-director/07): with a `serie` the panel says
 * where it came from and "1 de N", and "Guardar y siguiente" saves and moves to
 * the next person instead of closing. Without a `serie` it behaves as before
 * (editar-ficha-panel.test.tsx).
 */
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EditarFichaPanel, type SerieFicha } from '@/components/dream-team/servidores/editar-ficha-panel'

const ID_ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID_BEA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ficha = (id: string, nombre: string) => ({
  id, nombre, apellido: 'Pérez', fechaNacimiento: null, cedula: null,
  genero: 'Femenino', estadoCivil: 'Soltero/a', telefono: '04141234567', redesSociales: null,
})

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const fetchMock = jest.fn()
const toast = { success: jest.fn(), error: jest.fn() }

beforeEach(() => {
  fetchMock.mockReset()
  toast.success.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const aviso = () => screen.getByText(/Abriste esta ficha desde/)

function Serie({ onGuardado, onAbiertoChange }: { onGuardado: () => void; onAbiertoChange: (abierto: boolean) => void }) {
  const lista = [
    { id: ID_ANA, nombre: 'Ana Pérez' },
    { id: ID_BEA, nombre: 'Bea Pérez' },
  ]
  const [indice, setIndice] = useState(0)
  const actual = lista[indice]
  const serie: SerieFicha = {
    origen: 'Sin cédula',
    posicion: indice + 1,
    total: lista.length,
    onSiguiente: indice + 1 < lista.length ? () => setIndice(indice + 1) : undefined,
  }
  return (
    <EditarFichaPanel
      personaId={actual.id}
      nombre={actual.nombre}
      abierto
      onAbiertoChange={onAbiertoChange}
      onGuardado={onGuardado}
      toast={toast as never}
      serie={serie}
    />
  )
}

describe('EditarFichaPanel — Guardar y siguiente', () => {
  it('says where it was opened from and the position in the list', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: ficha(ID_ANA, 'Ana') }))
    render(<Serie onGuardado={jest.fn()} onAbiertoChange={jest.fn()} />)
    expect(screen.getByText(/Abriste esta ficha desde «Sin cédula»/)).toHaveTextContent('Abriste esta ficha desde «Sin cédula» · 1 de 2')
    expect(await screen.findByLabelText('Cédula')).toHaveValue('')
  })

  it('saves, stays open and loads the next person', async () => {
    const onGuardado = jest.fn()
    const onAbiertoChange = jest.fn()
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: ficha(ID_ANA, 'Ana') }))
    render(<Serie onGuardado={onGuardado} onAbiertoChange={onAbiertoChange} />)
    await userEvent.type(await screen.findByLabelText('Cédula'), '20111222')
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: { ...ficha(ID_ANA, 'Ana'), cedula: '20111222' } }))
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: ficha(ID_BEA, 'Bea') }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y siguiente' }))

    await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ cedula: '20111222' })
    expect(toast.success).toHaveBeenCalledWith('Ficha actualizada.')
    expect(onAbiertoChange).not.toHaveBeenCalledWith(false)
    await waitFor(() => expect(aviso()).toHaveTextContent('· 2 de 2'))
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(`/api/dream-team/personas/${ID_BEA}/ficha`, expect.objectContaining({ cache: 'no-store' })))
    // The last person has no next: a plain "Guardar", which closes.
    expect(await screen.findByRole('button', { name: 'Guardar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar y siguiente' })).not.toBeInTheDocument()
  })

  it('without changes, "Siguiente" skips to the next person without saving', async () => {
    const onGuardado = jest.fn()
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: ficha(ID_ANA, 'Ana') }))
    render(<Serie onGuardado={onGuardado} onAbiertoChange={jest.fn()} />)
    await screen.findByLabelText('Cédula')
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: ficha(ID_BEA, 'Bea') }))
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(aviso()).toHaveTextContent('· 2 de 2'))
    expect(onGuardado).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'PATCH')).toBe(true)
  })

  it('without a serie there is no notice and the button stays "Guardar" (previous behavior)', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: ficha(ID_ANA, 'Ana') }))
    render(
      <EditarFichaPanel personaId={ID_ANA} nombre="Ana Pérez" abierto onAbiertoChange={jest.fn()} onGuardado={jest.fn()} toast={toast as never} />,
    )
    await screen.findByLabelText('Cédula')
    expect(screen.queryByText(/Abriste esta ficha desde/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()
  })
})
