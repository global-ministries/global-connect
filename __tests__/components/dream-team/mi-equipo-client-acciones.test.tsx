/**
 * `<MiEquipoClient>` — the person panel and "Agregar persona" (T7a-3, S11
 * decisions 1 and 10 of odd/tasks/sistema-diseno-v2.md). One panel per
 * person replaces the per-servicio "⋯" menu; who sees what does not change:
 * the director (write capability) changes the etapa and the shifts; the
 * coordinador (registers people) fixes fichas, shifts and invites where the
 * server allows the ficha, never the etapa; without permissions there is no
 * action. Grupos de Vida and retired servicios stay without stage or shift
 * changes. Intent kept from the old menu suites (mi-equipo-client "actions
 * menu", menu-persona-ficha, lista-personas-persona).
 *
 * jsdom has no matchMedia, so `DetalleResponsivo` renders the side panel.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MiEquipoClient, type MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { listarDirecciones, vistaDeDireccion, type PersonaEntrada, type PersonasPorEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'
import { personaId } from '@/lib/platform/dream-team/types'
import { ID_CONEXION, ID_DHAH, ID_MDH, ID_PAREJAS, arbolConexion, personasPorEquipoConexion } from '@/tests/helpers/mi-equipo-conexion'

const refresh = jest.fn()
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh, push: jest.fn() }),
  usePathname: () => '/dream-team/mi-equipo',
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ accionPrincipal }: { accionPrincipal?: React.ReactNode }) => <header>{accionPrincipal}</header>,
}))

jest.setTimeout(15_000)
let user: ReturnType<typeof userEvent.setup>
beforeEach(() => {
  refresh.mockClear()
  user = userEvent.setup({ delay: null })
})
afterEach(() => jest.restoreAllMocks())

const gdv: PersonaEntrada = {
  clave: 'gdv:p:g',
  personaId: personaId('gdv-p'),
  nombre: 'Lider Solo Lectura',
  rolClave: 'lider',
  rolLabel: 'Líder de grupo',
  estado: 'activo',
  origen: 'grupos_vida',
}
// Fichas the server lets the viewer fix: DHAH only. Rayda Alvarado is retired; Luis Barrios has no account.
const personas: PersonasPorEquipo = {
  ...personasPorEquipoConexion,
  [ID_DHAH]: personasPorEquipoConexion[ID_DHAH].map((p) => ({ ...p, fichaEditable: true, tieneCuenta: p.nombre === 'Luis Barrios' ? false : true })),
  [ID_MDH]: [...personasPorEquipoConexion[ID_MDH].map((p) => (p.nombre === 'Rayda Alvarado' ? { ...p, estado: 'retirado' as const } : p)), gdv],
}

function props(overrides: Partial<MiEquipoClientProps> = {}): MiEquipoClientProps {
  return {
    direcciones: listarDirecciones(arbolConexion, personas),
    vista: vistaDeDireccion(arbolConexion, personas, ID_CONEXION),
    direccionId: ID_CONEXION,
    rol: 'director',
    equiposAsignables: [],
    rolesPorEquipo: {},
    ...overrides,
  }
}

async function abrir(nombre: string) {
  await user.click(screen.getByRole('button', { name: `Abrir ${nombre}`, hidden: true }))
  return within(await screen.findByRole('dialog', { name: nombre }))
}
const botonesDe = (panel: ReturnType<typeof within>, equipo: string) =>
  within(panel.getByRole('group', { name: equipo }))
    .queryAllByRole('button')
    .map((b) => b.textContent)

describe('MiEquipoClient — the person panel replaces the ⋯ menu (S11 decision 1)', () => {
  it('has no row menus: every row opens the panel', async () => {
    render(<MiEquipoClient {...props()} />)
    expect(screen.queryByRole('button', { name: /^Acciones para / })).not.toBeInTheDocument()
    const panel = await abrir('Edith Pérez')
    expect(panel.getByRole('heading', { name: 'Dónde sirve' })).toBeInTheDocument()
    expect(panel.getByRole('group', { name: 'Mujer de Hoy' })).toHaveTextContent('Dirección de Conexión')
  })

  it('director: Cambiar etapa and Turnos per servicio, Editar ficha and Invitar where the ficha is theirs', async () => {
    render(<MiEquipoClient {...props()} />)
    let panel = await abrir('Luis Barrios')
    expect(botonesDe(panel, 'De Hombre a Hombre')).toEqual(['Cambiar etapa', 'Turnos', 'Ver su equipo'])
    expect(panel.getByRole('button', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Invitar a la plataforma' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    // Outside the equipos whose fichas the server grants: stage and shifts only (as the old menu).
    panel = await abrir('Edith Pérez')
    expect(botonesDe(panel, 'Mujer de Hoy')).toEqual(['Cambiar etapa', 'Turnos', 'Ver su equipo'])
    expect(panel.queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument()
  })

  it('coordinador: Editar ficha, Turnos and Invitar, never Cambiar etapa; nothing outside their equipos', async () => {
    render(<MiEquipoClient {...props({ rol: 'coordinador' })} />)
    let panel = await abrir('Luis Barrios')
    expect(botonesDe(panel, 'De Hombre a Hombre')).toEqual(['Turnos', 'Ver su equipo'])
    expect(panel.getByRole('button', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Invitar a la plataforma' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    panel = await abrir('Edith Pérez')
    expect(botonesDe(panel, 'Mujer de Hoy')).toEqual(['Ver su equipo'])
  })

  it('without permissions: no action at all, only "Ver su equipo"', async () => {
    render(<MiEquipoClient {...props({ rol: 'sin_permisos' })} />)
    const panel = await abrir('Luis Barrios')
    expect(botonesDe(panel, 'De Hombre a Hombre')).toEqual(['Ver su equipo'])
    expect(panel.queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument()
    expect(panel.queryByRole('button', { name: 'Invitar a la plataforma' })).not.toBeInTheDocument()
  })

  it('a retired servicio and a Grupos de Vida leader get no stage or shift change; the leader is read-only', async () => {
    render(<MiEquipoClient {...props()} />)
    let panel = await abrir('Rayda Alvarado')
    expect(botonesDe(panel, 'Mujer de Hoy')).toEqual(['Ver su equipo'])
    await user.keyboard('{Escape}')
    panel = await abrir('Lider Solo Lectura')
    expect(botonesDe(panel, 'Mujer de Hoy')).toEqual(['Ver su equipo'])
    expect(panel.getByText('Sus servicios de Grupos de Vida se gestionan desde Grupos de Vida.')).toBeInTheDocument()
    expect(panel.getByText('Grupos de Vida', { selector: 'dd' })).toBeInTheDocument()
  })

  it('"Ver su equipo" enters the equipo of that servicio and closes the panel', async () => {
    render(<MiEquipoClient {...props()} />)
    const panel = await abrir('Edith Pérez')
    await user.click(within(panel.getByRole('group', { name: 'Mujer de Hoy' })).getByRole('button', { name: 'Ver su equipo' }))
    expect(screen.queryByRole('dialog', { name: 'Edith Pérez' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Mujer de Hoy' })).toBeInTheDocument()
  })

  it('changes a person to Activo from the panel and refreshes; "Por activar" stops counting them', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ servicio: {}, historial: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch
    const { rerender } = render(<MiEquipoClient {...props()} />)
    const panel = await abrir('Luis Barrios')
    await user.click(within(panel.getByRole('group', { name: 'De Hombre a Hombre' })).getByRole('button', { name: 'Cambiar etapa' }))
    expect(screen.queryByRole('dialog', { name: 'Luis Barrios' })).not.toBeInTheDocument()
    expect(screen.getByText('Etapa actual: En orientación')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Nueva etapa'), 'activo')
    await user.selectOptions(screen.getByLabelText('Motivo'), 'admin_promocion')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dream-team/servicios/servicio-dhah-3',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ estado: 'activo', motivo: 'admin_promocion', expectedVersion: 1 }) }),
    )
    expect(refresh).toHaveBeenCalledTimes(1)

    const activada: PersonasPorEquipo = {
      ...personas,
      [ID_DHAH]: personas[ID_DHAH].map((p) => (p.nombre === 'Luis Barrios' ? { ...p, estado: 'activo' as const } : p)),
    }
    rerender(<MiEquipoClient {...props({ vista: vistaDeDireccion(arbolConexion, activada, ID_CONEXION) })} />)
    const metrica = within(screen.getByRole('group', { name: 'Necesitan atención' })).getByRole('button', { name: /^Por activar/ })
    expect(metrica).toHaveTextContent('1')
  })

  it('the coordinador opens the shifts dialog of that servicio from Turnos', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ turnos: [], asignados: [] }) })) as unknown as typeof fetch
    render(<MiEquipoClient {...props({ rol: 'coordinador' })} />)
    const panel = await abrir('Luis Barrios')
    await user.click(within(panel.getByRole('group', { name: 'De Hombre a Hombre' })).getByRole('button', { name: 'Turnos' }))
    expect(await screen.findByRole('dialog', { name: /Turnos/ })).toBeInTheDocument()
  })
})

describe('MiEquipoClient — Agregar persona (S11 decision 10)', () => {
  const asignables = [
    { id: ID_CONEXION, etiqueta: 'Dirección de Conexión', ruta: ['Dirección de Conexión'] },
    { id: ID_PAREJAS, etiqueta: '—— Parejas', ruta: ['Talleres', 'Parejas'] },
  ]
  const rolesPorEquipo = {
    [ID_PAREJAS]: [{ id: 'rol-fac', equipoId: ID_PAREJAS, label: 'facilitador', nivel: 'lider' as const, activo: true }],
  }
  const conAlta = (rol: MiEquipoClientProps['rol']) => props({ rol, equiposAsignables: asignables, rolesPorEquipo })

  async function elegirPersona() {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/dream-team/usuarios/buscar')) {
        return { ok: true, json: async () => [{ id: 'u-1', email: 'nueva@test.com', nombre: 'Nueva', apellido: 'Persona' }] }
      }
      if (String(url).startsWith('/api/dream-team/usuarios/registrables')) return { ok: true, json: async () => ({ equipos: [] }) }
      return { ok: true, status: 201, json: async () => ({ servicio: { id: 'srv-1' } }) }
    }) as unknown as typeof fetch
    await user.type(screen.getByLabelText('Buscar persona', { selector: 'input[placeholder*="email"]' }), 'nueva')
    await user.click(await screen.findByRole('button', { name: /Nueva Persona/ }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
  }

  it('the director and the coordinador get the small header action and the phone FAB; read-only viewers neither', () => {
    for (const rol of ['director', 'coordinador'] as const) {
      const { unmount } = render(<MiEquipoClient {...conAlta(rol)} />)
      const botones = screen.getAllByRole('button', { name: 'Agregar persona' })
      expect(botones).toHaveLength(2)
      expect(botones[0]).toHaveClass('h-9')
      unmount()
    }
    render(<MiEquipoClient {...conAlta('sin_permisos')} />)
    expect(screen.queryByRole('button', { name: 'Agregar persona' })).not.toBeInTheDocument()
  })

  it('preselects nothing at the dirección level', async () => {
    render(<MiEquipoClient {...conAlta('director')} />)
    await user.click(screen.getAllByRole('button', { name: 'Agregar persona' })[0])
    await elegirPersona()
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false')
  })

  it('preselects the entered team and refreshes once assigned', async () => {
    render(<MiEquipoClient {...conAlta('director')} />)
    await user.click(within(screen.getByRole('group', { name: 'Equipos' })).getByRole('button', { name: /^Parejas/ }))
    await user.click(screen.getAllByRole('button', { name: 'Agregar persona' })[0])
    await elegirPersona()
    expect(screen.getByRole('radio', { name: 'Talleres › Parejas' })).toHaveAttribute('aria-checked', 'true')
    await user.selectOptions(screen.getByLabelText('Rol'), 'rol-fac')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})
