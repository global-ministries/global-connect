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
  it('a viewer who may only fix the ficha still gets the menu, with just that action and the team link', async () => {
    expect(tieneMenu(FILA)).toBe(true)
    render(<MenuServidor fila={FILA} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    expect(await screen.findByRole('menuitem', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
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
