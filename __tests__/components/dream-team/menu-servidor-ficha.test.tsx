import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

import { MenuServidor, tieneMenu } from '@/components/dream-team/servidores/menu-servidor'
import type { FilaServidor } from '@/lib/platform/dream-team/servidores-vista'

const FILA: FilaServidor = {
  clave: 's-1',
  personaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as FilaServidor['personaId'],
  nombre: 'Ana Pérez',
  equipoId: 'e-1',
  equipoLabel: 'Bebés',
  equipoRuta: 'Waumba Land',
  direccionId: 'd-1',
  rolLabel: 'Voluntario',
  estado: 'activo',
  fechaInicio: null,
  telefono: null,
  tieneCuenta: null,
  origen: 'dream_team',
  servicioId: 's-1',
  version: 1,
  editable: false,
  fichaEditable: true,
}

beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch
})

describe('MenuServidor — Editar ficha (T11)', () => {
  it('the volunteer coordinator (ficha permission only) gets Editar ficha, Turnos and the team link, not Cambiar etapa', async () => {
    expect(tieneMenu(FILA)).toBe(true)
    render(<MenuServidor fila={FILA} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    expect(await screen.findByRole('menuitem', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Turnos' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Ver su equipo' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
  })

  it('the volunteer coordinator opens the shifts dialog of that servicio', async () => {
    render(<MenuServidor fila={FILA} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Turnos' }))
    expect(global.fetch).toHaveBeenCalledWith('/api/dream-team/servicios/s-1/turnos', expect.anything())
  })

  it('no Turnos for a row without servicio', async () => {
    render(<MenuServidor fila={{ ...FILA, servicioId: undefined }} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    expect(await screen.findByRole('menuitem', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Turnos' })).not.toBeInTheDocument()
  })

  it('no Turnos for a retired servicio', async () => {
    render(<MenuServidor fila={{ ...FILA, estado: 'retirado' }} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    expect(await screen.findByRole('menuitem', { name: 'Ver su equipo' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Turnos' })).not.toBeInTheDocument()
  })

  it('opens the side panel', async () => {
    render(<MenuServidor fila={FILA} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar ficha' }))
    expect(await screen.findByRole('dialog', { name: 'Editar ficha' })).toBeInTheDocument()
  })

  it('without the ficha permission there is no Editar ficha', async () => {
    const fila = { ...FILA, editable: true, fichaEditable: false }
    render(<MenuServidor fila={fila} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    expect(await screen.findByRole('menuitem', { name: 'Cambiar etapa' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Editar ficha' })).not.toBeInTheDocument()
  })

  it('a read-only row without the ficha permission has no menu', () => {
    expect(tieneMenu({ ...FILA, fichaEditable: false })).toBe(false)
  })
})
