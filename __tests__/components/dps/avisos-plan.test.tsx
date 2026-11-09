/**
 * `<PlanClient>` with the service notices (odd/tasks/dps-asistencia-pco.md,
 * T15b; S13.2, S13.3, S13.6; artboards design/dps-avisos/01 and 02). The
 * server actions are mocked: the state chip of each convocado (icon + text),
 * the «No puede» motivo and «Buscar reemplazo», the person taken out after
 * the notice, the header summary, the «N avisos sin enviar» bar (never for
 * a past plan), the «Enviar avisos» panel and its all-or-nothing send, the
 * blocked people of the picker (S13.6) and the read-only plan. Every person
 * is fictitious.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlanClient, type PlanClientProps } from '@/components/dps/plan-client'
import * as acciones from '@/lib/actions/dps-plan.actions'
import * as avisos from '@/lib/actions/dps-avisos.actions'
import { leerEnvioAvisos, leerEstadoAvisos, leerPendientesAvisos, type EstadoAvisos } from '@/lib/platform/dps/avisos'
import { leerCandidatos, leerEquiposPlan, leerPlanCabecera, type PlanCabecera } from '@/lib/platform/dps/plan'

jest.mock('@/lib/actions/dps-plan.actions', () => ({
  cargarEquiposDps: jest.fn(),
  buscarCandidatosDps: jest.fn(),
  convocarDps: jest.fn(),
  desconvocarDps: jest.fn(),
  planAnteriorDps: jest.fn(),
  copiarPlanDps: jest.fn(),
  cambiarPortadaDps: jest.fn(),
  quitarPortadaDps: jest.fn(),
}))
jest.mock('@/lib/actions/dps-avisos.actions', () => ({
  cargarEstadoAvisosDps: jest.fn(),
  cargarAvisosPendientesDps: jest.fn(),
  enviarAvisosDps: jest.fn(),
  cargarPersonasBloqueadasDps: jest.fn(),
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dps/plan',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const mock = <T extends (...args: never[]) => unknown>(f: T) => f as unknown as jest.MockedFunction<T>
const buscar = mock(acciones.buscarCandidatosDps)
const convocar = mock(acciones.convocarDps)
const desconvocar = mock(acciones.desconvocarDps)
const cargarEstado = mock(avisos.cargarEstadoAvisosDps)
const cargarPendientes = mock(avisos.cargarAvisosPendientesDps)
const enviar = mock(avisos.enviarAvisosDps)
const cargarBloqueados = mock(avisos.cargarPersonasBloqueadasDps)

beforeAll(() => {
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const PLAN = '11111111-1111-4111-8111-111111111111'
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`
const RC = id(1) // Rubén, confirmó
const LI = id(2) // Lorena, pendiente
const OB = id(3) // Óscar, no puede
const SA = id(4) // Simón, sin avisar
const HP = id(5) // Hugo, quitado tras aviso
const IS = id(6) // Irene, candidata
const WD = id(7) // Wilmer, bloqueó la fecha

const SERIE = { id: 's1', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: null, semanas: 4 }
const plan = (parche: Record<string, unknown> = {}): PlanCabecera =>
  leerPlanCabecera({ id: PLAN, fecha: '2026-11-15', tipo: 'domingo', titulo: null, semana: 4, serie: SERIE, horarios: ['09:00', '11:30'], llegada: '07:30', ...parche })!

const conv = (personaId: string, nombre: string) => ({ convocado_id: `c-${personaId}`, persona_id: personaId, servicio_id: `sv-${personaId}`, nombre, iniciales: 'XX' })
const equiposJson = (puedeEditar = true) => ({
  plan_id: PLAN,
  puede_editar: puedeEditar,
  equipos: [
    {
      equipo_id: 'audio',
      equipo: 'Audio',
      ruta: 'a',
      puestos: [
        { puesto_id: 'foh', nombre: 'Audio FOH', cantidad: 1, activo: true, convocados: [conv(RC, 'Rubén Carvajal')] },
        { puesto_id: 'esc', nombre: 'Escenario', cantidad: 2, activo: true, convocados: [conv(LI, 'Lorena Ibarra')] },
        { puesto_id: 'str', nombre: 'Streaming', cantidad: 1, activo: true, convocados: [conv(SA, 'Simón Arrieta')] },
      ],
    },
    {
      equipo_id: 'video',
      equipo: 'Video',
      ruta: 'v',
      puestos: [{ puesto_id: 'cam2', nombre: 'Cámara 2', cantidad: 1, activo: true, convocados: [conv(OB, 'Óscar Bermúdez')] }],
    },
  ],
})

const persona = (personaId: string, nombre: string, estado: string, claves: string[], parche: Record<string, unknown> = {}) => ({
  persona_id: personaId,
  nombre,
  iniciales: 'XX',
  tiene_cuenta: true,
  estado,
  por_enviar: null,
  claves,
  roles_antes: null,
  estado_aviso: null,
  motivo: null,
  respondido_at: null,
  enviado_at: null,
  ...parche,
})

const estadoJson = (parche: Record<string, unknown> = {}) => ({
  por_enviar: 3,
  planes: [
    {
      plan_id: PLAN,
      fecha: '2026-11-15',
      pasado: false,
      por_enviar: 3,
      resumen: { sin_avisar: 2, pendiente: 1, confirmo: 1, no_puede: 1, quitado: 1, sin_cuenta: 0 },
      personas: [
        persona(RC, 'Rubén Carvajal', 'confirmo', ['p:foh'], { estado_aviso: 'confirmo' }),
        persona(LI, 'Lorena Ibarra', 'sin_avisar', ['p:esc'], {
          por_enviar: 'cambio',
          roles_antes: [{ origen: 'puesto', puesto_id: null, columna: null, nombre: 'Monitores', equipo: 'Audio', direccion: 'Producción Técnica', automatico: false }],
        }),
        persona(OB, 'Óscar Bermúdez', 'no_puede', ['p:cam2'], {
          estado_aviso: 'no_puede',
          motivo: 'Estoy de viaje en Carora ese fin de semana.',
          respondido_at: '2026-11-07T14:00:00Z',
        }),
        persona(SA, 'Simón Arrieta', 'sin_avisar', ['p:str'], { por_enviar: 'nueva' }),
        persona(HP, 'Hugo Pacheco', 'quitado', ['p:esc'], { por_enviar: 'quitado' }),
      ],
      ...parche,
    },
  ],
})
const estado = (parche: Record<string, unknown> = {}): EstadoAvisos => leerEstadoAvisos(estadoJson(parche))
const sinPendientes = (): EstadoAvisos =>
  leerEstadoAvisos({
    por_enviar: 0,
    planes: [
      {
        plan_id: PLAN,
        fecha: '2026-11-15',
        pasado: false,
        por_enviar: 0,
        resumen: { sin_avisar: 0, pendiente: 3, confirmo: 1, no_puede: 1, quitado: 0, sin_cuenta: 0 },
        personas: [persona(RC, 'Rubén Carvajal', 'confirmo', ['p:foh']), persona(SA, 'Simón Arrieta', 'pendiente', ['p:str'])],
      },
    ],
  })

const rolJson = (nombre: string, equipo: string, automatico = false) => ({ origen: 'puesto', puesto_id: null, columna: null, nombre, equipo, direccion: 'DPS', automatico })
const base = (personaId: string, nombre: string) => ({ plan_id: PLAN, fecha: '2026-11-15', tipo: 'domingo', titulo: null, serie: 'Tu casa', persona_id: personaId, nombre, iniciales: 'XX', tiene_cuenta: true })
const pendientes = leerPendientesAvisos({
  total: 3,
  nuevas: [{ ...base(SA, 'Simón Arrieta'), roles: [rolJson('Streaming', 'Audio')], automatico: false, reemplaza: [] }],
  cambios: [
    {
      ...base(LI, 'Lorena Ibarra'),
      roles: [rolJson('Escenario', 'Audio')],
      reinicia: true,
      estado: 'confirmo',
      horarios: ['09:00', '11:30'],
      llegada: '07:30',
      roles_antes: [rolJson('Monitores', 'Audio')],
      fecha_antes: null,
      horarios_antes: null,
      llegada_antes: null,
    },
  ],
  quitados: [{ ...base(HP, 'Hugo Pacheco'), roles: [rolJson('Escenario', 'Audio')] }],
  no_reciben: {
    ya_respondieron: [{ ...base(OB, 'Óscar Bermúdez'), roles: [rolJson('Cámara 2', 'Video')] }],
    sin_cuenta: [{ plan_id: PLAN, fecha: '2026-11-15', columna: 'cantantes', nombre: 'Gabriela Nieves' }],
    sin_cambios: 23,
  },
})

const candidatos = leerCandidatos([
  { servicio_id: 'sv-is', persona_id: IS, nombre: 'Irene', apellido: 'Saavedra', equipo: 'Video', rol: 'Servidor', puestos_del_dia: [] },
  { servicio_id: 'sv-wd', persona_id: WD, nombre: 'Wilmer', apellido: 'Duque', equipo: 'Video', rol: 'Servidor', puestos_del_dia: [] },
])

const props = (parche: Partial<PlanClientProps> = {}): PlanClientProps => ({
  plan: plan(),
  anterior: null,
  siguiente: null,
  equipos: leerEquiposPlan(equiposJson()),
  portadaUrl: null,
  motivo: null,
  error: null,
  ...parche,
})

const region = () => screen.getByRole('region', { name: 'Equipos del plan' })
const columna = (equipo: string) => within(region()).getByRole('region', { name: equipo })
const fila = (nombre: string) => within(region()).getByText(nombre).closest('li')!

beforeEach(() => {
  jest.clearAllMocks()
  cargarEstado.mockResolvedValue({ ok: true, data: estado() })
  cargarBloqueados.mockResolvedValue({ ok: true, data: [{ personaId: WD, nota: 'Graduación de mi hermana' }] })
  cargarPendientes.mockResolvedValue({ ok: true, data: pendientes })
  enviar.mockResolvedValue({ ok: true, data: leerEnvioAvisos({ enviados: 3, nuevas: 1, cambios: 1, quitados: 1, cerrados: 1 }) })
  buscar.mockResolvedValue({ ok: true, data: candidatos })
  convocar.mockResolvedValue({ ok: true, data: { convocadoId: 'c-nuevo' } })
  desconvocar.mockResolvedValue({ ok: true, data: { quitado: true } })
})

describe('the state of each convocado', () => {
  it('reads the states of the plan and the blocked people once it opens', async () => {
    render(<PlanClient {...props()} />)
    await waitFor(() => expect(cargarEstado).toHaveBeenCalledWith({ planIds: [PLAN] }))
    expect(cargarBloqueados).toHaveBeenCalledWith({ planId: PLAN })
  })

  it('shows a chip with icon and text per state, never color alone', async () => {
    render(<PlanClient {...props()} />)
    expect(await within(fila('Rubén Carvajal')).findByText('Confirmó')).toBeInTheDocument()
    expect(within(fila('Simón Arrieta')).getByText('Sin avisar')).toBeInTheDocument()
    expect(within(fila('Lorena Ibarra')).getByText('Sin avisar')).toBeInTheDocument()
    expect(within(fila('Óscar Bermúdez')).getByText('No puede')).toBeInTheDocument()
    // Each chip carries a decorative icon next to its words.
    expect(within(fila('Rubén Carvajal')).getByText('Confirmó').querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the motivo of «No puede» inline and when they answered', async () => {
    render(<PlanClient {...props()} />)
    const video = columna('Video')
    expect(await within(video).findByText(/Estoy de viaje en Carora ese fin de semana\./)).toBeInTheDocument()
    expect(within(video).getByText(/respondió el sáb 7 nov/)).toBeInTheDocument()
  })

  it('says what changed for someone who already knew', async () => {
    render(<PlanClient {...props()} />)
    expect(await within(columna('Audio')).findByText('Cambió de Monitores · ya sabía de esta fecha')).toBeInTheDocument()
  })

  it('shows the person taken out after the notice struck through in their puesto, without counting them', async () => {
    render(<PlanClient {...props()} />)
    const hugo = await within(columna('Audio')).findByText('Hugo Pacheco')
    expect(hugo.tagName).toBe('S')
    expect(within(hugo.closest('li')!).getByText('Quitado')).toBeInTheDocument()
    expect(within(columna('Audio')).getByText('Ya tenía el aviso. Al enviar recibe «Ya no estás programado».')).toBeInTheDocument()
    // Escenario still counts Lorena only.
    expect(within(columna('Audio')).getByRole('heading', { name: /Escenario/ })).toHaveTextContent('1/2')
  })

  it('sums the answers in the header', async () => {
    render(<PlanClient {...props()} />)
    const resumen = await screen.findByRole('list', { name: 'Respuestas de los convocados' })
    expect(resumen).toHaveTextContent('1 confirmado')
    expect(resumen).toHaveTextContent('1 pendiente')
    expect(resumen).toHaveTextContent('1 no puede')
    expect(resumen).toHaveTextContent('2 sin avisar')
  })
})

describe('the «avisos sin enviar» bar', () => {
  it('shows how many notices are pending with «Enviar avisos»', async () => {
    render(<PlanClient {...props()} />)
    const barra = await screen.findByRole('region', { name: '3 avisos sin enviar' })
    expect(barra).toHaveTextContent('1 invitación · 1 cambio · 1 «Ya no estás programado»')
    expect(within(barra).getByRole('button', { name: 'Enviar avisos' })).toBeInTheDocument()
  })

  it('does not show without pending notices', async () => {
    cargarEstado.mockResolvedValue({ ok: true, data: sinPendientes() })
    render(<PlanClient {...props()} />)
    await within(region()).findAllByText('Pendiente')
    expect(screen.queryByRole('button', { name: 'Enviar avisos' })).not.toBeInTheDocument()
  })

  it('never shows for a past plan', async () => {
    cargarEstado.mockResolvedValue({ ok: true, data: estado({ pasado: true }) })
    render(<PlanClient {...props()} />)
    await within(fila('Rubén Carvajal')).findByText('Confirmó')
    expect(screen.queryByRole('button', { name: 'Enviar avisos' })).not.toBeInTheDocument()
  })

  it('reads the states again after convocar', async () => {
    render(<PlanClient {...props()} />)
    await screen.findByRole('region', { name: '3 avisos sin enviar' })
    await userEvent.click(within(columna('Audio')).getByRole('button', { name: /Falta 1 en Escenario/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Irene Saavedra/ }))
    await waitFor(() => expect(convocar).toHaveBeenCalled())
    await waitFor(() => expect(cargarEstado).toHaveBeenCalledTimes(2))
  })
})

describe('the «Enviar avisos» panel', () => {
  async function abrir(): Promise<HTMLElement> {
    render(<PlanClient {...props()} />)
    const barra = await screen.findByRole('region', { name: '3 avisos sin enviar' })
    await userEvent.click(within(barra).getByRole('button', { name: 'Enviar avisos' }))
    return screen.findByRole('dialog', { name: 'Enviar avisos' })
  }

  it('groups what the send delivers and who gets nothing', async () => {
    const panel = await abrir()
    expect(cargarPendientes).toHaveBeenCalledWith({ planIds: [PLAN] })
    expect(within(panel).getByText('Les llegará a su panel en Global Connect.')).toBeInTheDocument()
    const nuevas = await within(panel).findByRole('region', { name: /Nuevas invitaciones/ })
    expect(nuevas).toHaveTextContent('Simón Arrieta')
    expect(nuevas).toHaveTextContent('Streaming · Audio')
    const cambios = within(panel).getByRole('region', { name: /Cambios para quien ya sabía/ })
    expect(within(cambios).getByText('Monitores · Audio').tagName).toBe('S')
    expect(cambios).toHaveTextContent('Antes: Monitores · Audio ahora: Escenario · Audio')
    expect(within(panel).getByRole('region', { name: /Ya no estás programado/ })).toHaveTextContent('Tenía Escenario · Audio')
    const no = within(panel).getByRole('region', { name: 'No reciben aviso' })
    expect(no).toHaveTextContent('Óscar Bermúdez ya respondió que no puede; sale del plan sin otro aviso.')
    expect(no).toHaveTextContent('Gabriela Nieves no tiene cuenta. Avísale tú por otro medio.')
    expect(no).toHaveTextContent('23 personas ya tienen su aviso y nada les cambió.')
  })

  it('sends all at once, says how many and reads the states again', async () => {
    const panel = await abrir()
    cargarEstado.mockResolvedValue({ ok: true, data: sinPendientes() })
    await userEvent.click(await within(panel).findByRole('button', { name: 'Enviar 3 avisos' }))
    expect(enviar).toHaveBeenCalledWith({ planIds: [PLAN] })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Enviamos 3 avisos: 1 invitación, 1 cambio y 1 «Ya no estás programado». Ya están en su panel.'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Enviar avisos' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Enviar avisos' })).not.toBeInTheDocument())
    expect(cargarEstado).toHaveBeenCalledTimes(2)
  })

  it('keeps the panel open and explains why when the send fails (nothing was sent)', async () => {
    enviar.mockResolvedValue({ ok: false, message: 'No se pudieron enviar los avisos. Intenta de nuevo.', codigo: null })
    const panel = await abrir()
    await userEvent.click(await within(panel).findByRole('button', { name: 'Enviar 3 avisos' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudieron enviar los avisos. Intenta de nuevo.'))
    expect(screen.getByRole('dialog', { name: 'Enviar avisos' })).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('closes with «Cancelar» without sending', async () => {
    const panel = await abrir()
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Enviar avisos' })).not.toBeInTheDocument())
    expect(enviar).not.toHaveBeenCalled()
  })
})

describe('«Buscar reemplazo» and the blocked dates (S13.6)', () => {
  it('opens the picker of that puesto with the blocked people apart, with a warning and their nota', async () => {
    render(<PlanClient {...props()} />)
    await userEvent.click(await within(columna('Video')).findByRole('button', { name: 'Buscar reemplazo para Cámara 2' }))
    expect(await screen.findByRole('heading', { name: 'Reemplazo para Cámara 2' })).toBeInTheDocument()
    const disponibles = await screen.findByRole('list', { name: 'Disponibles' })
    expect(within(disponibles).getByRole('button', { name: /Irene Saavedra/ })).toBeInTheDocument()
    const bloqueados = screen.getByRole('list', { name: 'Bloquearon esta fecha' })
    const wilmer = within(bloqueados).getByRole('button', { name: /Wilmer Duque/ })
    expect(wilmer).toHaveTextContent('Fecha bloqueada. Bloqueó esta fecha: «Graduación de mi hermana»')
    expect(wilmer).toBeEnabled()
  })

  it('convoca the blocked person anyway and takes out who could not', async () => {
    render(<PlanClient {...props()} />)
    await userEvent.click(await within(columna('Video')).findByRole('button', { name: 'Buscar reemplazo para Cámara 2' }))
    const bloqueados = await screen.findByRole('list', { name: 'Bloquearon esta fecha' })
    await userEvent.click(within(bloqueados).getByRole('button', { name: /Wilmer Duque/ }))
    await waitFor(() => expect(convocar).toHaveBeenCalledWith({ planId: PLAN, puestoId: 'cam2', servicioId: 'sv-wd' }))
    await waitFor(() => expect(desconvocar).toHaveBeenCalledWith({ planId: PLAN, puestoId: 'cam2', personaId: OB }))
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Wilmer Duque reemplaza a Óscar Bermúdez en Cámara 2. Queda sin avisar. Ojo: bloqueó esta fecha.')
    await waitFor(() => expect(cargarEstado).toHaveBeenCalledTimes(2))
  })
})

describe('the read-only plan', () => {
  it('reads no notices and shows no chips nor bar', async () => {
    render(<PlanClient {...props({ equipos: leerEquiposPlan(equiposJson(false)) })} />)
    expect(await screen.findByText('Rubén Carvajal')).toBeInTheDocument()
    expect(cargarEstado).not.toHaveBeenCalled()
    expect(cargarBloqueados).not.toHaveBeenCalled()
    expect(screen.queryByText('Confirmó')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar avisos' })).not.toBeInTheDocument()
  })
})
