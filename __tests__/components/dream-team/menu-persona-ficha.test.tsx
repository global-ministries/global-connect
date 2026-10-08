import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MenuPersona, tieneAccionesDisponibles } from '@/components/dream-team/mi-equipo/menu-persona'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'

const PERSONA = {
  clave: 's-1',
  servicioId: 's-1',
  version: 1,
  personaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  nombre: 'Ana Pérez',
  iniciales: 'AP',
  equipoId: 'e-1',
  equipoLabel: 'Bebés',
  rolClave: 'voluntario',
  rolLabel: 'Voluntario',
  rolOrden: 9,
  estado: 'activo',
  origen: 'dream_team',
  editable: true,
  telefono: null,
  tieneCuenta: null,
  turnoIds: [],
  fichaEditable: true,
} as unknown as PersonaVista

beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch
})

async function abrirMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
}

describe('MenuPersona — Editar ficha (T11)', () => {
  it('the volunteer coordinator (no write capability) gets only Editar ficha', async () => {
    expect(tieneAccionesDisponibles(PERSONA, false)).toBe(true)
    render(<MenuPersona persona={PERSONA} puedeEditarServicio={false} onActualizado={jest.fn()} />)
    await abrirMenu()
    expect(await screen.findByRole('menuitem', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Turnos' })).not.toBeInTheDocument()
  })

  it('opens the side panel', async () => {
    render(<MenuPersona persona={PERSONA} puedeEditarServicio={false} onActualizado={jest.fn()} />)
    await abrirMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar ficha' }))
    expect(await screen.findByRole('dialog', { name: 'Editar ficha' })).toBeInTheDocument()
  })

  it('an editor without the ficha permission keeps the servicio actions only', async () => {
    render(<MenuPersona persona={{ ...PERSONA, fichaEditable: false }} puedeEditarServicio onActualizado={jest.fn()} />)
    await abrirMenu()
    expect(await screen.findByRole('menuitem', { name: 'Cambiar etapa' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Editar ficha' })).not.toBeInTheDocument()
  })

  it('no menu with neither permission', () => {
    expect(tieneAccionesDisponibles({ ...PERSONA, fichaEditable: false }, false)).toBe(false)
  })
})
