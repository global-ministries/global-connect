/**
 * @jest-environment jsdom
 *
 * R3b (odd/tasks/talleres-rediseno.md, S1, S2, S5) — the v2 client of
 * /talleres/temporadas (artboards design/talleres-interior/26 and 27):
 * attention metrics as filters, Vigentes / Historial / Todas, URL state with
 * replace, one drawer per temporada with the existing actions (Abrir at once;
 * Cerrar, Cancelar and Quitar after a confirmation inside the drawer; Agregar
 * taller) and «Crear temporada» in its own drawer. Neutral Spanish, no voseo.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const transitionTemporadaMock = jest.fn()
const agregarTallerATemporadaMock = jest.fn()
const quitarTallerDeTemporadaMock = jest.fn()
const createTemporadaMock = jest.fn()
const refreshMock = jest.fn()
const exitoMock = jest.fn()

jest.mock('@/app/(auth)/talleres/temporadas/actions', () => ({
  transitionTemporada: (...a: unknown[]) => transitionTemporadaMock(...a),
  agregarTallerATemporada: (...a: unknown[]) => agregarTallerATemporadaMock(...a),
  quitarTallerDeTemporada: (...a: unknown[]) => quitarTallerDeTemporadaMock(...a),
  createTemporada: (...a: unknown[]) => createTemporadaMock(...a),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/talleres/temporadas',
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs, accionPrincipal }: { breadcrumbs?: React.ReactNode; accionPrincipal?: React.ReactNode }) => (
    <header>
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: exitoMock, error: jest.fn(), info: jest.fn() }),
}))

import { TemporadasClient, type TemporadasClientProps } from '@/components/talleres/temporadas/temporadas-client'
import { FILTROS_INICIALES } from '@/components/talleres/temporadas/vista-temporadas'
import type { EdicionPanel, TemporadaPanel } from '@/lib/platform/talleres/temporadas'

function edicion(o: Partial<EdicionPanel> = {}): EdicionPanel {
  return {
    id: 'ed-1',
    tallerId: 't-mujer',
    tallerNombre: 'Mujer de Hoy',
    tallerSlug: 'mujer-de-hoy',
    nombre: 'Edición ene 2027',
    estado: 'abierto',
    fechaInicio: '2027-01-12',
    fechaFin: '2027-02-16',
    inscritos: 9,
    aprobados: 9,
    minimo: null,
    ...o,
  }
}

const ABIERTA: TemporadaPanel = {
  id: 'temp-abierta',
  nombre: 'Temporada 2027-I',
  estado: 'abierto',
  fecha_apertura: '2027-01-11',
  fecha_cierre: '2027-03-27',
  dream_team_equipo_id: 'root-con',
  direccionLabel: 'Dirección de Conexión',
  ediciones: [
    edicion({ id: 'ed-p', tallerId: 't-parejas', tallerNombre: 'Parejas', tallerSlug: 'parejas', inscritos: 6, aprobados: 6, minimo: 8 }),
    edicion(),
  ],
  talleresDisponibles: [{ id: 't-hombre', nombre: 'De Hombre a Hombre', slug: 'de-hombre' }],
}
const BORRADOR: TemporadaPanel = {
  ...ABIERTA,
  id: 'temp-borrador',
  nombre: 'Temporada 2027-II',
  estado: 'borrador',
  fecha_apertura: '2027-04-05',
  ediciones: [edicion({ id: 'ed-b', estado: 'borrador', inscritos: 0, aprobados: 0 })],
  talleresDisponibles: [],
}
const CERRADA: TemporadaPanel = {
  ...ABIERTA,
  id: 'temp-cerrada',
  nombre: 'Temporada 2026-II',
  estado: 'cerrado',
  fecha_apertura: '2026-06-01',
  dream_team_equipo_id: 'root-dps',
  direccionLabel: 'DPS',
  ediciones: [edicion({ id: 'ed-c', estado: 'cerrado', inscritos: 20, aprobados: 20 })],
}

function props(o: Partial<TemporadasClientProps> = {}): TemporadasClientProps {
  return {
    temporadas: [CERRADA, BORRADOR, ABIERTA],
    puedeEditar: true,
    direccionesCrear: [],
    filtrosIniciales: FILTROS_INICIALES,
    temporadaInicial: null,
    crearInicial: false,
    ...o,
  }
}

const replaceStateSpy = jest.spyOn(window.history, 'replaceState')

beforeEach(() => {
  for (const m of [transitionTemporadaMock, agregarTallerATemporadaMock, quitarTallerDeTemporadaMock, createTemporadaMock, refreshMock, exitoMock]) {
    m.mockReset()
  }
  replaceStateSpy.mockClear()
})

const ultimaUrl = () => String(replaceStateSpy.mock.calls.at(-1)?.[2])
const filas = () => screen.getAllByRole('button', { name: /^Abrir Temporada/ }).map((b) => b.getAttribute('aria-label'))

describe('list', () => {
  it('shows the summary and the four attention metrics with their counts', () => {
    render(<TemporadasClient {...props()} />)
    const metricas = screen.getByRole('group', { name: 'Lo que necesita atención' })
    expect(within(metricas).getByRole('button', { name: /Abiertas\s*1/ })).toHaveAttribute('aria-pressed', 'false')
    expect(within(metricas).getByRole('button', { name: /En borrador\s*1/ })).toBeInTheDocument()
    expect(within(metricas).getByRole('button', { name: /Ediciones bajo el mínimo\s*1/ })).toBeInTheDocument()
    expect(within(metricas).getByRole('button', { name: /Talleres sin edición\s*1/ })).toBeInTheDocument()
  })

  it('Vigentes lists abiertas then borrador; Historial and Todas switch the list and the URL', () => {
    render(<TemporadasClient {...props()} />)
    expect(filas()).toEqual(['Abrir Temporada 2027-I', 'Abrir Temporada 2027-II'])
    expect(ultimaUrl()).toBe('/talleres/temporadas')

    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(filas()).toEqual(['Abrir Temporada 2026-II'])
    expect(ultimaUrl()).toBe('/talleres/temporadas?vista=historial')

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(filas()).toHaveLength(3)
  })

  it('a metric filters the list, shows its chip, and a second press clears it', () => {
    render(<TemporadasClient {...props()} />)
    const metrica = screen.getByRole('button', { name: /Ediciones bajo el mínimo/ })
    fireEvent.click(metrica)
    expect(metrica).toHaveAttribute('aria-pressed', 'true')
    expect(filas()).toEqual(['Abrir Temporada 2027-I'])
    expect(ultimaUrl()).toBe('/talleres/temporadas?atencion=minimo')
    expect(screen.getByRole('button', { name: /Quitar Ediciones bajo el mínimo/ })).toBeInTheDocument()

    fireEvent.click(metrica)
    expect(filas()).toHaveLength(2)
  })

  it('scope cards by dirección filter the list', () => {
    render(<TemporadasClient {...props({ filtrosIniciales: { ...FILTROS_INICIALES, vista: 'todas' } })} />)
    const alcance = screen.getByRole('group', { name: 'Filtrar por dirección' })
    fireEvent.click(within(alcance).getByRole('button', { name: /DPS/ }))
    expect(filas()).toEqual(['Abrir Temporada 2026-II'])
    expect(ultimaUrl()).toBe('/talleres/temporadas?vista=todas&direccion=root-dps')
  })

  it('searches by temporada or taller name', () => {
    render(<TemporadasClient {...props()} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar temporadas' }), { target: { value: 'parejas' } })
    expect(filas()).toEqual(['Abrir Temporada 2027-I'])
    expect(ultimaUrl()).toBe('/talleres/temporadas?q=parejas')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar temporadas' }), { target: { value: '2027-II' } })
    expect(filas()).toEqual(['Abrir Temporada 2027-II'])
  })

  it('shows an empty state with «Limpiar todo» when nothing matches', () => {
    render(<TemporadasClient {...props({ temporadas: [CERRADA] })} />)
    expect(screen.getByText('Ninguna temporada con estos filtros')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))
    expect(filas()).toEqual(['Abrir Temporada 2026-II'])
  })
})

describe('drawer', () => {
  it('opens one drawer per temporada with its ediciones, the minimum warning and the URL', async () => {
    render(<TemporadasClient {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Temporada 2027-I' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Parejas · Edición ene 2027')).toHaveAttribute('href', '/talleres/parejas/ed-p')
    expect(within(panel).getByText(/aprobados para el mínimo/)).toHaveTextContent('Faltan 2 aprobados para el mínimo')
    expect(within(panel).getByText(/Una edición no llega/)).toBeInTheDocument()
    expect(ultimaUrl()).toBe('/talleres/temporadas?temporada=temp-abierta')
  })

  it('«Abrir temporada» on a borrador runs at once and refreshes', async () => {
    transitionTemporadaMock.mockResolvedValue({ ok: true, temporadaId: 'temp-borrador' })
    render(<TemporadasClient {...props({ temporadaInicial: 'temp-borrador' })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir temporada' }))
    await waitFor(() => expect(transitionTemporadaMock).toHaveBeenCalledWith({ temporadaId: 'temp-borrador', next: 'abierto' }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(exitoMock).toHaveBeenCalledWith('Abriste «Temporada 2027-II».')
  })

  it('«Cerrar temporada» asks first and only then closes it', async () => {
    transitionTemporadaMock.mockResolvedValue({ ok: true, temporadaId: 'temp-abierta' })
    render(<TemporadasClient {...props({ temporadaInicial: 'temp-abierta' })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar temporada' }))
    expect(transitionTemporadaMock).not.toHaveBeenCalled()
    expect(screen.getByText('Una temporada cerrada no se puede volver a abrir')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sí, cerrar temporada' }))
    await waitFor(() => expect(transitionTemporadaMock).toHaveBeenCalledWith({ temporadaId: 'temp-abierta', next: 'cerrado' }))
    expect(exitoMock).toHaveBeenCalledWith('Cerraste «Temporada 2027-I». Queda en Historial.')
  })

  it('«Cancelar temporada» asks first; «Volver» goes back without acting', async () => {
    transitionTemporadaMock.mockResolvedValue({ ok: true })
    render(<TemporadasClient {...props({ temporadaInicial: 'temp-abierta' })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar temporada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('button', { name: 'Cancelar temporada' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar temporada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cancelar temporada' }))
    await waitFor(() => expect(transitionTemporadaMock).toHaveBeenCalledWith({ temporadaId: 'temp-abierta', next: 'cancelado' }))
  })

  it('«Quitar» asks first and shows the action error without leaving the confirmation', async () => {
    quitarTallerDeTemporadaMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'Esta edición ya tiene inscritos.' })
    render(<TemporadasClient {...props({ temporadaInicial: 'temp-abierta' })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar Parejas de la temporada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar taller' }))
    await waitFor(() => expect(quitarTallerDeTemporadaMock).toHaveBeenCalledWith({ temporadaId: 'temp-abierta', tallerId: 't-parejas' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta edición ya tiene inscritos.')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('«Agregar taller» adds a dirección taller without edición here', async () => {
    agregarTallerATemporadaMock.mockResolvedValue({ ok: true })
    render(<TemporadasClient {...props({ temporadaInicial: 'temp-abierta' })} />)
    fireEvent.change(await screen.findByLabelText('Taller'), { target: { value: 't-hombre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await waitFor(() => expect(agregarTallerATemporadaMock).toHaveBeenCalledWith({ temporadaId: 'temp-abierta', tallerId: 't-hombre' }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('without write permission the drawer has no actions', async () => {
    render(<TemporadasClient {...props({ puedeEditar: false, temporadaInicial: 'temp-abierta' })} />)
    const panel = await screen.findByRole('dialog')
    for (const nombre of ['Cerrar temporada', 'Cancelar temporada', 'Agregar', 'Quitar Parejas de la temporada']) {
      expect(within(panel).queryByRole('button', { name: nombre })).not.toBeInTheDocument()
    }
  })

  it('a cerrada temporada admits no changes', async () => {
    render(<TemporadasClient {...props({ temporadaInicial: 'temp-cerrada', filtrosIniciales: { ...FILTROS_INICIALES, vista: 'historial' } })} />)
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Cerrada: ya no admite cambios.')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Cancelar temporada' })).not.toBeInTheDocument()
  })
})

describe('crear temporada', () => {
  const DIRECCION = {
    id: 'root-con',
    label: 'Dirección de Conexión',
    talleres: [
      { id: 't-parejas', nombre: 'Parejas', nodoLabel: 'GCP', regimen: 'temporada' as const },
      { id: 't-pp', nombre: 'Punto de Partida', nodoLabel: 'GCP', regimen: 'cadencia' as const },
    ],
  }

  it('is hidden without a dirección that allows it', () => {
    render(<TemporadasClient {...props()} />)
    expect(screen.queryByRole('button', { name: 'Crear temporada' })).not.toBeInTheDocument()
  })

  it('opens from the header (and the phone FAB) and creates through createTemporada', async () => {
    createTemporadaMock.mockResolvedValue({ ok: true, temporadaId: 'temp-nueva', edicionesCreadas: 1 })
    render(<TemporadasClient {...props({ direccionesCrear: [DIRECCION] })} />)
    expect(screen.getAllByRole('button', { name: 'Crear temporada' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Crear temporada' })[0]!)

    const panel = await screen.findByRole('dialog')
    expect(ultimaUrl()).toBe('/talleres/temporadas?crear=1')
    expect(within(panel).getByRole('checkbox', { name: /Punto de Partida/ })).toBeDisabled()
    fireEvent.change(within(panel).getByLabelText('Nombre'), { target: { value: 'Temporada 2027-III' } })
    fireEvent.change(within(panel).getByLabelText('Fecha de apertura'), { target: { value: '2027-07-05' } })
    fireEvent.change(within(panel).getByLabelText('Fecha de cierre'), { target: { value: '2027-09-25' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear temporada' }))

    await waitFor(() =>
      expect(createTemporadaMock).toHaveBeenCalledWith({
        equipoId: 'root-con',
        nombre: 'Temporada 2027-III',
        fecha_apertura: '2027-07-05',
        fecha_cierre: '2027-09-25',
        tallerIds: ['t-parejas'],
      }),
    )
    expect(exitoMock).toHaveBeenCalledWith('Creamos «Temporada 2027-III» en borrador con 1 edición.')
    expect(refreshMock).toHaveBeenCalled()
  })

  it('shows the action error inside the form', async () => {
    createTemporadaMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'La fecha de cierre debe ser posterior o igual a la de apertura.' })
    render(<TemporadasClient {...props({ direccionesCrear: [DIRECCION], crearInicial: true })} />)
    const panel = await screen.findByRole('dialog')
    fireEvent.change(within(panel).getByLabelText('Nombre'), { target: { value: 'Temporada X' } })
    fireEvent.change(within(panel).getByLabelText('Fecha de apertura'), { target: { value: '2027-07-05' } })
    fireEvent.change(within(panel).getByLabelText('Fecha de cierre'), { target: { value: '2027-07-01' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear temporada' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('La fecha de cierre debe ser posterior')
  })
})

describe('language', () => {
  it('uses neutral Spanish with «tú», never voseo', async () => {
    const { container } = render(<TemporadasClient {...props({ temporadaInicial: 'temp-abierta', direccionesCrear: [] })} />)
    await screen.findByRole('dialog')
    const texto = `${container.textContent} ${document.body.textContent}`
    expect(texto).not.toMatch(/\b(Tocá|tenés|Explorá|para vos|Quitá|usá|podés|querés)\b/i)
  })
})
