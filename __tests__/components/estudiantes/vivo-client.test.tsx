/**
 * `<VivoClient>` — the live view (C4b of odd/tasks/estudiantes-fase-b.md,
 * artboards 03 / 04). The server action is mocked and the timers are fake:
 * each flow checks the 15 s refresh, the live indicator, the filters that
 * survive a refresh and the toast for a new visitor. Every person is
 * fictitious.
 *
 * `ListaResponsiva` renders the desktop cells and the phone cell of every row
 * (CSS swaps them, jsdom applies none), so each row button appears twice; the
 * tests use the first. Without matchMedia the drawer is the side panel.
 */
import React from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { VivoClient } from '@/components/estudiantes/vivo/vivo-client'
import * as acciones from '@/lib/actions/estudiantes-vivo.actions'
import type { DatosVivo, GrupoVivo, OpcionVivo, VisitanteHoy } from '@/lib/platform/estudiantes/vivo-datos'
import { FILTROS_VIVO_INICIALES } from '@/lib/platform/estudiantes/vivo-vista'

jest.mock('@/lib/actions/estudiantes-vivo.actions', () => ({ refrescarVivo: jest.fn() }))

const info = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info }),
}))

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/estudiantes/vivo',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

jest.setTimeout(15_000)

const refrescar = acciones.refrescarVivo as jest.MockedFunction<typeof acciones.refrescarVivo>

const OPCION: OpcionVivo = {
  ambitoId: 'a-t',
  ambito: 'Transit',
  campusId: 'c1',
  campus: 'Barquisimeto',
  fecha: '2026-10-25',
  turnoId: 't1',
  turno: '1er servicio',
  hora: '09:00:00',
}

const grupo = (grupoId: string, nombre: string, subarea: string, lideres: string[], presentes: number, ausentes: number, visitantes: number, sinMarcar: number): GrupoVivo => ({
  grupoId,
  nombre,
  subarea,
  anio: Number(nombre[0]),
  anioEtiqueta: nombre.split(' · ')[0],
  lideres,
  presentes,
  ausentes,
  visitantes,
  sinMarcar,
})

const G1 = grupo('g1', '1er año · Chicas', 'Grupos de Chicas', ['Fernanda Ochoa'], 11, 3, 1, 0)
const G3 = grupo('g3', '3er año · Chicas', 'Grupos de Chicas', ['Karla Mujica'], 0, 0, 0, 13)
const G5 = grupo('g5', '2do año · Chicos', 'Grupos de Chicos', ['Samuel Nieves'], 0, 0, 0, 12)
const G6 = grupo('g6', '3er año · Chicos', 'Grupos de Chicos', ['Diego Carrasco'], 9, 4, 0, 0)

const visitante = (personaId: string, nombre: string, g: GrupoVivo, esNuevo: boolean): VisitanteHoy => ({
  personaId,
  nombre,
  grupoId: g.grupoId,
  grupo: g.nombre,
  anioEtiqueta: g.anioEtiqueta,
  registradoPor: g.lideres[0],
  registradoAt: '2026-10-25T13:32:00Z',
  esNuevo,
})

const V1 = visitante('p1', 'Emilia Rangel', G1, true)
const DATOS: DatosVivo = { ambitoId: 'a-t', fecha: '2026-10-25', turnoId: 't1', grupos: [G1, G3, G5, G6], visitantesHoy: [V1] }

let user: ReturnType<typeof userEvent.setup>
let replaceState: jest.SpyInstance

function pintar(extra: Partial<React.ComponentProps<typeof VivoClient>> = {}) {
  return render(<VivoClient opciones={[OPCION]} opcion={OPCION} datos={DATOS} error={null} filtrosIniciales={FILTROS_VIVO_INICIALES} {...extra} />)
}

const metricas = () => within(screen.getByRole('group', { name: 'Resumen de la reunión' }))
const filasGrupo = (nombre: string) => screen.queryAllByRole('button', { name: `Abrir ${nombre}` })

const pasar = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

const visibilidad = (estado: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  replaceState = jest.spyOn(window.history, 'replaceState')
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})

afterEach(() => {
  jest.useRealTimers()
  replaceState.mockRestore()
})

describe('<VivoClient>', () => {
  it('shows the meeting: title, live line, metrics, visitors and groups', () => {
    pintar()
    expect(screen.getAllByRole('heading', { name: 'Transit' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('En vivo · Actualizado ahora').length).toBeGreaterThan(0)
    expect(metricas().getByRole('button', { name: /Grupos sin marcar/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('list', { name: 'Visitantes de hoy' })).toHaveTextContent('Emilia Rangel')
    expect(screen.getByRole('list', { name: 'Visitantes de hoy' })).toHaveTextContent('Nuevo')
    expect(filasGrupo('3er año · Chicas').length).toBeGreaterThan(0)
    expect(screen.getByText('4 de 4 grupos · 52 inscritos')).toBeInTheDocument()
  })

  it('counts the seconds since the last refresh', async () => {
    pintar()
    refrescar.mockResolvedValue({ ok: true, data: DATOS })
    await pasar(10_000)
    expect(screen.getAllByText('En vivo · Actualizado hace 10 s').length).toBeGreaterThan(0)
  })

  it('refreshes every 15 s, keeps the filters and announces a new visitor', async () => {
    pintar()
    await user.click(metricas().getByRole('button', { name: /Grupos sin marcar/ }))
    expect(filasGrupo('1er año · Chicas')).toHaveLength(0)
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, '', '/estudiantes/vivo?ambito=a-t&campus=c1&fecha=2026-10-25&turno=t1&metrica=sin_marcar')

    const nuevo = visitante('p6', 'Joaquín Silva', G6, true)
    // 2do año · Chicos starts marking: it leaves "sin marcar".
    refrescar.mockResolvedValueOnce({ ok: true, data: { ...DATOS, grupos: [G1, G3, { ...G5, presentes: 4, sinMarcar: 8 }, G6], visitantesHoy: [nuevo, V1] } })
    await pasar(15_000)

    expect(refrescar).toHaveBeenCalledTimes(1)
    expect(refrescar).toHaveBeenCalledWith({ ambitoId: 'a-t', fecha: '2026-10-25', turnoId: 't1' })
    expect(info).toHaveBeenCalledWith('Nuevo visitante: Joaquín Silva en 3er año · Chicos')
    expect(metricas().getByRole('button', { name: /Grupos sin marcar/ })).toHaveAttribute('aria-pressed', 'true')
    expect(filasGrupo('3er año · Chicas').length).toBeGreaterThan(0)
    expect(filasGrupo('2do año · Chicos')).toHaveLength(0)
    expect(screen.getByRole('list', { name: 'Visitantes de hoy' })).toHaveTextContent('Joaquín Silva')
    expect(replace).not.toHaveBeenCalled()
  })

  it('does not announce the visitors already on screen', async () => {
    pintar()
    refrescar.mockResolvedValue({ ok: true, data: DATOS })
    await pasar(15_000)
    expect(refrescar).toHaveBeenCalledTimes(1)
    expect(info).not.toHaveBeenCalled()
  })

  it('keeps the last data and goes muted when a refresh fails, then recovers', async () => {
    pintar()
    refrescar.mockResolvedValueOnce({ ok: false, message: 'No se pudo actualizar la vista en vivo. Se reintenta sola.', codigo: null })
    await pasar(15_000)
    expect(screen.getAllByText(/^Reintentando · Actualizado hace 15 s$/).length).toBeGreaterThan(0)
    expect(screen.getByText('No se pudo actualizar la vista en vivo. Se reintenta sola.')).toBeInTheDocument()
    expect(filasGrupo('1er año · Chicas').length).toBeGreaterThan(0)

    refrescar.mockResolvedValueOnce({ ok: true, data: DATOS })
    await pasar(15_000)
    expect(screen.getAllByText('En vivo · Actualizado ahora').length).toBeGreaterThan(0)
    expect(screen.queryByText('No se pudo actualizar la vista en vivo. Se reintenta sola.')).not.toBeInTheDocument()
  })

  it('pauses while the tab is hidden and refreshes when it comes back', async () => {
    pintar()
    refrescar.mockResolvedValue({ ok: true, data: DATOS })
    await act(async () => visibilidad('hidden'))
    await pasar(30_000)
    expect(refrescar).not.toHaveBeenCalled()
    expect(screen.getAllByText('En pausa · Actualizado hace 30 s').length).toBeGreaterThan(0)

    await act(async () => visibilidad('visible'))
    expect(refrescar).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('En vivo · Actualizado ahora').length).toBeGreaterThan(0)
  })

  it('opens the group detail with "Ver la lista" back to this meeting', async () => {
    pintar()
    await user.click(filasGrupo('3er año · Chicas')[0])
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Nadie marcó todavía')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Ver la lista' })).toHaveAttribute('href', '/estudiantes/grupos/g3?desde=vivo&fecha=2026-10-25&turno=t1')
  })

  it('opens the group of a visitor from the strip', async () => {
    pintar()
    await user.click(within(screen.getByRole('list', { name: 'Visitantes de hoy' })).getByRole('button', { name: /Emilia Rangel/ }))
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: '1er año · Chicas' })).toBeInTheDocument()
  })

  it('narrows to a sub-área from its card and back from the breadcrumb', async () => {
    pintar()
    await user.click(screen.getAllByRole('button', { name: /Grupos de Chicos/ })[0])
    expect(screen.getAllByRole('heading', { name: 'Grupos de Chicos' }).length).toBeGreaterThan(0)
    expect(filasGrupo('1er año · Chicas')).toHaveLength(0)
    await user.click(within(screen.getByRole('navigation', { name: 'Ubicación' })).getByRole('button', { name: 'Transit' }))
    expect(filasGrupo('1er año · Chicas').length).toBeGreaterThan(0)
  })

  it('shows the empty state without a meeting', () => {
    render(<VivoClient opciones={[]} opcion={null} datos={null} error={null} filtrosIniciales={FILTROS_VIVO_INICIALES} />)
    expect(screen.getByText('No hay reuniones para seguir en vivo')).toBeInTheDocument()
  })
})
