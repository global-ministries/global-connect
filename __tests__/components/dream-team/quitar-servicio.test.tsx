/**
 * «Quitar de este equipo» (S3, S7 of odd/tasks/dream-team-estructura-correcciones.md):
 * in Servidores' «Dónde sirve», each servicio the viewer may change gets the
 * button; it asks first («¿Quitar a <nombre corto> de <equipo> como <rol>?»,
 * then «Se borra sin dejar historial.» until 2027-01-01 Caracas and «Su
 * historial se conserva.» from then on), then quits ONLY that servicio through
 * DELETE /api/dream-team/servicios/[id] (the server retires it and, until that
 * date, deletes it), and refreshes. Same permission as «Cambiar etapa»; Mi
 * equipo is unchanged.
 *
 * jsdom has no matchMedia, so `DetalleResponsivo` renders the side panel.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DetallePersona, type DetallePersonaProps, type ServicioDetalle } from '@/components/dream-team/detalle-persona'
import { DetalleServidor } from '@/components/dream-team/servidores/detalle-servidor'
import { MiEquipoClient } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { puedeQuitarServicio } from '@/lib/platform/dream-team/acciones-servicio'
import { listarDirecciones, vistaDeDireccion } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { FilaVista, PersonaLista } from '@/lib/platform/dream-team/servidores-vista'
import { personaId } from '@/lib/platform/dream-team/types'
import { ID_CONEXION, arbolConexion, personasPorEquipoConexion } from '@/tests/helpers/mi-equipo-conexion'

const toastError = jest.fn()
const toastSuccess = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ error: toastError, success: toastSuccess, info: jest.fn(), warning: jest.fn() }),
}))
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

const ANTES = '2026-12-31T23:59:00-04:00'
const DESDE = '2027-01-01T00:00:00-04:00'
// Only Date is faked: userEvent and React keep their real timers.
function fijarFecha(iso: string) {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: [
      'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      'queueMicrotask', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback',
    ],
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  fijarFecha(ANTES)
  user = userEvent.setup({ delay: null })
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ borrado: true }) })
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  jest.useRealTimers()
})

const QUITAR = 'Quitar de este equipo'
const botonesDe = (contenedor: HTMLElement, equipo: string) =>
  within(within(contenedor).getByRole('group', { name: equipo }))
    .queryAllByRole('button')
    .map((b) => b.textContent)

const fila = (over: Partial<FilaVista>): FilaVista => ({
  clave: 's1',
  personaId: personaId('p1'),
  nombre: 'Kelly María Chaviel Rojas',
  nombreCorto: 'Kelly Chaviel',
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
  version: 3,
  editable: true,
  equiposDeLaPersona: 2,
  turnosTexto: '—',
  estadoCuenta: null,
  ...over,
})
const persona = (filas: FilaVista[]): PersonaLista => ({
  tipo: 'persona',
  clave: 'p1',
  nombre: 'Kelly María Chaviel Rojas',
  telefono: null,
  tieneCuenta: true,
  soloGruposVida: false,
  invitacion: null,
  estadoCuenta: null,
  filas,
})
const FILAS = [
  fila({}),
  fila({ clave: 's2', servicioId: 's2', version: 7, equipoId: 'eq-dps', equipoLabel: 'DPS', equipoNombre: 'DPS', equipoRuta: '', rolLabel: 'Director' }),
]

function renderDetalle(filas: FilaVista[] = FILAS) {
  const onActualizado = jest.fn()
  const onCambioAbierto = jest.fn()
  render(<DetalleServidor persona={persona(filas)} abierto onCambioAbierto={onCambioAbierto} onActualizado={onActualizado} />)
  return { panel: screen.getByRole('dialog', { name: 'Kelly María Chaviel Rojas' }), onActualizado, onCambioAbierto }
}

async function pedirQuitar(panel: HTMLElement, equipo: string) {
  await user.click(within(within(panel).getByRole('group', { name: equipo })).getByRole('button', { name: QUITAR }))
  return screen.findByRole('alertdialog')
}

describe('puedeQuitarServicio — the same permission as «Cambiar etapa»', () => {
  it('allows an editable Dream Team servicio that is not retired', () => {
    expect(puedeQuitarServicio(fila({}))).toBe(true)
    for (const estado of ['postulado', 'en_orientacion', 'en_pausa', 'inactivo'] as const) {
      expect(puedeQuitarServicio(fila({ estado }))).toBe(true)
    }
  })

  it('denies a retired servicio, a read-only one, or one without id or version', () => {
    expect(puedeQuitarServicio(fila({ estado: 'retirado' }))).toBe(false)
    expect(puedeQuitarServicio(fila({ editable: false }))).toBe(false)
    expect(puedeQuitarServicio(fila({ servicioId: undefined }))).toBe(false)
    expect(puedeQuitarServicio(fila({ version: undefined }))).toBe(false)
  })
})

describe('Servidores — «Quitar de este equipo»', () => {
  it('shows on each servicio the viewer may change, never on a retired or read-only one', () => {
    const { panel } = renderDetalle([
      ...FILAS,
      fila({ clave: 's3', servicioId: 's3', equipoLabel: 'Audio', equipoNombre: 'Audio', estado: 'retirado' }),
      fila({ clave: 's4', servicioId: 's4', equipoLabel: 'Coro', equipoNombre: 'Coro', editable: false }),
    ])
    expect(botonesDe(panel, 'Cámaras')).toContain(QUITAR)
    expect(botonesDe(panel, 'DPS')).toContain(QUITAR)
    expect(botonesDe(panel, 'Audio')).not.toContain(QUITAR)
    expect(botonesDe(panel, 'Coro')).not.toContain(QUITAR)
  })

  it('is hidden when the viewer lacks permission', () => {
    const { panel } = renderDetalle(FILAS.map((f) => ({ ...f, editable: false })))
    expect(within(panel).queryByRole('button', { name: QUITAR })).not.toBeInTheDocument()
  })

  it('uses the canonical destructive button at 44px', () => {
    const { panel } = renderDetalle()
    const boton = within(within(panel).getByRole('group', { name: 'Cámaras' })).getByRole('button', { name: QUITAR })
    expect(boton.className).toMatch(/(^|\s)h-11(\s|$)/)
    expect(boton.className).toContain('bg-danger')
  })

  it('asks first, with the short name, the team and the rol; until 2027 it says nothing is kept', async () => {
    const { panel } = renderDetalle()
    const dialogo = await pedirQuitar(panel, 'Cámaras')
    // «¿Quitar a <nombre corto> de <equipo> como <rol>? Se borra sin dejar historial.»: the question titles the dialog.
    expect(dialogo).toHaveAccessibleName('¿Quitar a Kelly Chaviel de Cámaras como Voluntario?')
    expect(dialogo).toHaveAccessibleDescription('Se borra sin dejar historial.')
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(within(dialogo).getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('from 2027-01-01 (Caracas) it says the history is kept', async () => {
    fijarFecha(DESDE)
    const { panel } = renderDetalle()
    const dialogo = await pedirQuitar(panel, 'Cámaras')
    expect(dialogo).toHaveAccessibleName('¿Quitar a Kelly Chaviel de Cámaras como Voluntario?')
    expect(dialogo).toHaveAccessibleDescription('Su historial se conserva.')
  })

  it('quits only that servicio through DELETE and refreshes the list and the drawer', async () => {
    const { panel, onActualizado, onCambioAbierto } = renderDetalle()
    const dialogo = await pedirQuitar(panel, 'Cámaras')
    // The drawer closes while the question is open: two modals never fight for focus.
    expect(onCambioAbierto).toHaveBeenLastCalledWith(false)
    await user.click(within(dialogo).getByRole('button', { name: QUITAR }))
    await waitFor(() => expect(onActualizado).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/dream-team/servicios/s1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 3 }),
    })
    expect(toastSuccess).toHaveBeenCalledWith('Kelly Chaviel ya no está en Cámaras como Voluntario.')
    expect(toastError).not.toHaveBeenCalled()
    expect(onCambioAbierto).toHaveBeenLastCalledWith(true)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('shows the error and refreshes nothing when the server refuses', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Permiso denegado' }) })
    const { panel, onActualizado } = renderDetalle()
    const dialogo = await pedirQuitar(panel, 'DPS')
    await user.click(within(dialogo).getByRole('button', { name: QUITAR }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Permiso denegado'))
    expect(fetchMock).toHaveBeenCalledWith('/api/dream-team/servicios/s2', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ expectedVersion: 7 }),
    }))
    expect(onActualizado).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('explains a version conflict and a network failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'Conflicto de versión' }) })
    const { panel } = renderDetalle()
    await user.click(within(await pedirQuitar(panel, 'Cámaras')).getByRole('button', { name: QUITAR }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Este servicio fue modificado por otra persona. Recarga la página e intenta de nuevo.'),
    )
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await user.click(within(await pedirQuitar(panel, 'Cámaras')).getByRole('button', { name: QUITAR }))
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith('No se pudo quitar de este equipo. Intenta de nuevo.'))
  })

  it('falls back to the short form of the full name when the row has no short name', async () => {
    const { panel } = renderDetalle([fila({ nombreCorto: undefined })])
    const dialogo = await pedirQuitar(panel, 'Cámaras')
    expect(dialogo).toHaveAccessibleName('¿Quitar a Kelly Chaviel de Cámaras como Voluntario?')
  })
})

describe('DetallePersona without «Quitar» (Mi equipo)', () => {
  const CORO: ServicioDetalle = {
    clave: 's-coro',
    equipoLabel: 'Coro',
    equipoRuta: 'Alabanza',
    rolLabel: 'Integrante',
    estado: 'activo',
    turnoTexto: '—',
    desde: null,
    origen: 'dream_team',
    acciones: { cambiarEtapa: true, turnos: true, editarFicha: false, invitar: false },
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
    ...over,
  })

  it('renders the same buttons as before when neither the flag nor the handler is given', () => {
    render(<DetallePersona {...base()} />)
    expect(botonesDe(screen.getByRole('dialog', { name: 'Ana Ruiz' }), 'Coro')).toEqual(['Cambiar etapa', 'Turnos'])
  })

  it('needs both the flag and the handler', () => {
    const { unmount } = render(<DetallePersona {...base({ servicios: [{ ...CORO, acciones: { ...CORO.acciones, quitar: true } }] })} />)
    expect(screen.queryByRole('button', { name: QUITAR })).not.toBeInTheDocument()
    unmount()
    render(<DetallePersona {...base({ onQuitar: jest.fn() })} />)
    expect(screen.queryByRole('button', { name: QUITAR })).not.toBeInTheDocument()
  })

  it('offers no «Quitar» in Mi equipo, even to a director', async () => {
    render(
      <MiEquipoClient
        direcciones={listarDirecciones(arbolConexion, personasPorEquipoConexion)}
        vista={vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION)}
        direccionId={ID_CONEXION}
        rol="director"
        equiposAsignables={[]}
        rolesPorEquipo={{}}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Abrir Luis Barrios', hidden: true }))
    const panel = await screen.findByRole('dialog', { name: 'Luis Barrios' })
    expect(botonesDe(panel, 'De Hombre a Hombre')).toEqual(['Cambiar etapa', 'Turnos', 'Ver su equipo'])
  })
})
