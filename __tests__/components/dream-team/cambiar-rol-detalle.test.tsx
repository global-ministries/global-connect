/**
 * «Cambiar rol» on the servicio card of the person panel
 * (odd/tasks/dream-team-cambiar-rol.md, T1, S1, S2): right after «Cambiar de
 * área», under the same condition (`acciones.cambiarArea`, the server's
 * `areaCambiable`) and only with a handler; Servidores and Mi equipo open the
 * «Cambiar rol» dialog from it.
 *
 * jsdom has no matchMedia, so `DetalleResponsivo` renders the side panel.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DetallePersona, type DetallePersonaProps, type ServicioDetalle } from '@/components/dream-team/detalle-persona'
import { DetalleServidor } from '@/components/dream-team/servidores/detalle-servidor'
import { MiEquipoClient } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { listarDirecciones, vistaDeDireccion, type PersonasPorEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { FilaVista, PersonaLista } from '@/lib/platform/dream-team/servidores-vista'
import { personaId } from '@/lib/platform/dream-team/types'
import { ID_CONEXION, ID_DHAH, arbolConexion, personasPorEquipoConexion } from '@/tests/helpers/mi-equipo-conexion'

jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dream-team/mi-equipo',
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ accionPrincipal }: { accionPrincipal?: React.ReactNode }) => <header>{accionPrincipal}</header>,
}))

jest.setTimeout(15_000)
let user: ReturnType<typeof userEvent.setup>
const fetchMock = jest.fn()
beforeEach(() => {
  user = userEvent.setup({ delay: null })
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ roles: [] }) })
  global.fetch = fetchMock as unknown as typeof fetch
})

const botonesDe = (contenedor: HTMLElement, equipo: string) =>
  within(within(contenedor).getByRole('group', { name: equipo }))
    .queryAllByRole('button')
    .map((b) => b.textContent)

describe('DetallePersona — the «Cambiar rol» button', () => {
  const CORO: ServicioDetalle = {
    clave: 's-coro',
    equipoLabel: 'Coro',
    equipoRuta: 'Alabanza',
    rolLabel: 'Integrante',
    estado: 'activo',
    turnoTexto: '—',
    desde: null,
    origen: 'dream_team',
    acciones: { cambiarEtapa: true, turnos: true, editarFicha: false, invitar: false, cambiarArea: true },
  }
  const base = (over: Partial<DetallePersonaProps> = {}): DetallePersonaProps => ({
    persona: { nombre: 'Ana Ruiz', telefono: null, tieneCuenta: true, soloGruposVida: false },
    servicios: [CORO],
    abierto: true,
    onCambioAbierto: jest.fn(),
    onCambiarEtapa: jest.fn(),
    onTurnos: jest.fn(),
    onEditarFicha: jest.fn(),
    onInvitar: jest.fn(),
    onCambiarArea: jest.fn(),
    onCambiarRol: jest.fn(),
    ...over,
  })

  it('shows right after «Cambiar de área» and calls back with the servicio, closing the panel', async () => {
    const props = base()
    render(<DetallePersona {...props} />)
    expect(botonesDe(screen.getByRole('dialog', { name: 'Ana Ruiz' }), 'Coro')).toEqual([
      'Cambiar etapa',
      'Turnos',
      'Cambiar de área',
      'Cambiar rol',
    ])
    await user.click(screen.getByRole('button', { name: 'Cambiar rol' }))
    expect(props.onCambioAbierto).toHaveBeenCalledWith(false)
    expect(props.onCambiarRol).toHaveBeenCalledWith('s-coro')
    expect(props.onCambiarArea).not.toHaveBeenCalled()
  })

  it('follows the «Cambiar de área» condition and needs its own handler', () => {
    const { unmount } = render(<DetallePersona {...base({ servicios: [{ ...CORO, acciones: { ...CORO.acciones, cambiarArea: false } }] })} />)
    expect(screen.queryByRole('button', { name: 'Cambiar rol' })).not.toBeInTheDocument()
    unmount()
    render(<DetallePersona {...base({ onCambiarRol: undefined })} />)
    expect(screen.queryByRole('button', { name: 'Cambiar rol' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar de área' })).toBeInTheDocument()
  })
})

describe('Servidores — DetalleServidor', () => {
  const fila = (over: Partial<FilaVista>): FilaVista => ({
    clave: 's1',
    personaId: personaId('p1'),
    nombre: 'Ana Pérez',
    equipoId: 'eq-cam',
    equipoLabel: 'Cámaras',
    equipoNombre: 'Cámaras',
    equipoRuta: 'DPS',
    direccionId: 'dps',
    rolLabel: 'Voluntario',
    estado: 'activo',
    fechaInicio: null,
    telefono: null,
    tieneCuenta: true,
    origen: 'dream_team',
    servicioId: 's1',
    version: 1,
    editable: true,
    areaCambiable: true,
    equiposDeLaPersona: 2,
    turnosTexto: '—',
    estadoCuenta: null,
    ...over,
  })
  const persona = (filas: FilaVista[]): PersonaLista => ({
    tipo: 'persona',
    clave: 'p1',
    nombre: 'Ana Pérez',
    telefono: null,
    tieneCuenta: true,
    soloGruposVida: false,
    invitacion: null,
    estadoCuenta: null,
    filas,
  })

  it('offers it where «Cambiar de área» shows, never on a retired one, and opens the dialog', async () => {
    const filas = [
      fila({}),
      fila({ clave: 's2', servicioId: 's2', equipoLabel: 'Audio', equipoNombre: 'Audio', estado: 'retirado' }),
      fila({ clave: 's3', servicioId: 's3', equipoLabel: 'Coro', equipoNombre: 'Coro', areaCambiable: false }),
    ]
    render(<DetalleServidor persona={persona(filas)} abierto onCambioAbierto={jest.fn()} onActualizado={jest.fn()} />)
    const panel = screen.getByRole('dialog', { name: 'Ana Pérez' })
    expect(botonesDe(panel, 'Audio')).not.toContain('Cambiar rol')
    expect(botonesDe(panel, 'Coro')).not.toContain('Cambiar rol')
    await user.click(within(within(panel).getByRole('group', { name: 'Cámaras' })).getByRole('button', { name: 'Cambiar rol' }))
    expect(await screen.findByRole('dialog', { name: 'Cambiar rol' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/dream-team/servicios/s1/cambiar-rol', expect.anything())
  })
})

describe('Mi equipo — the person panel', () => {
  const personas: PersonasPorEquipo = {
    ...personasPorEquipoConexion,
    [ID_DHAH]: personasPorEquipoConexion[ID_DHAH].map((p) => ({ ...p, areaCambiable: p.nombre === 'Luis Barrios' })),
  }
  const props = () => ({
    direcciones: listarDirecciones(arbolConexion, personas),
    vista: vistaDeDireccion(arbolConexion, personas, ID_CONEXION),
    direccionId: ID_CONEXION,
    rol: 'director' as const,
    equiposAsignables: [],
    rolesPorEquipo: {},
  })

  it('offers «Cambiar rol» where the server allows «Cambiar de área» and opens the dialog', async () => {
    render(<MiEquipoClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Abrir Luis Barrios', hidden: true }))
    const panel = await screen.findByRole('dialog', { name: 'Luis Barrios' })
    await user.click(within(panel).getByRole('button', { name: 'Cambiar rol' }))
    expect(await screen.findByRole('dialog', { name: 'Cambiar rol' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/dream-team\/servicios\/.+\/cambiar-rol$/), expect.anything())
  })
})
