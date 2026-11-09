/**
 * `<PlanClient>` — Plan del domingo · Equipos (odd/tasks/dps-asistencia-pco.md,
 * T10; artboard docs/design-system/prototipos/planificacion-dps/01-plan-domingo-equipos.html).
 * The server actions are mocked: the header (cover, title, date pill with
 * the previous / next plan, horarios), the tabs, the team columns with their
 * "Falta" rows, convocar from the popover (search, conflict flag, rollback),
 * quitar, "Copiar del domingo anterior" with the replace confirmation, the
 * cover, the read-only plan and the empty / error states. Every person is
 * fictitious. The «Orden» tab (T13) is in orden-servicio.test.tsx.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlanClient, type PlanClientProps } from '@/components/dps/plan-client'
import * as acciones from '@/lib/actions/dps-plan.actions'
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

// The notices (T15b) are covered in avisos-plan.test.tsx / avisos-hoja.test.tsx: here they read nothing.
jest.mock('@/lib/actions/dps-avisos.actions', () => ({
  cargarEstadoAvisosDps: jest.fn(),
  cargarPersonasBloqueadasDps: jest.fn(),
  cargarAvisosPendientesDps: jest.fn(),
  enviarAvisosDps: jest.fn(),
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
const cargar = mock(acciones.cargarEquiposDps)
const buscar = mock(acciones.buscarCandidatosDps)
const convocar = mock(acciones.convocarDps)
const desconvocar = mock(acciones.desconvocarDps)
const anterior = mock(acciones.planAnteriorDps)
const copiar = mock(acciones.copiarPlanDps)
const cambiarPortada = mock(acciones.cambiarPortadaDps)
const quitarPortada = mock(acciones.quitarPortadaDps)

beforeAll(() => {
  // Radix popper measures its anchor; jsdom has no ResizeObserver.
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const SERIE = { id: 's1', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: 's1/1.png', semanas: 4 }
const plan = (parche: Record<string, unknown> = {}): PlanCabecera =>
  leerPlanCabecera({ id: 'plan8', fecha: '2026-11-08', tipo: 'domingo', titulo: null, semana: 3, serie: SERIE, horarios: ['09:15', '11:15'], llegada: '07:00', ...parche })!

const conv = (id: string, nombre: string) => ({ convocado_id: `c-${id}`, persona_id: id, servicio_id: `sv-${id}`, nombre, iniciales: 'XX' })
const equiposJson = (puedeEditar = true) => ({
  plan_id: 'plan8',
  puede_editar: puedeEditar,
  equipos: [
    {
      equipo_id: 'audio',
      equipo: 'Audio',
      ruta: 'a',
      puestos: [
        { puesto_id: 'foh', nombre: 'Audio FOH', cantidad: 1, activo: true, convocados: [conv('rc', 'Rubén Carvajal')] },
        { puesto_id: 'mon', nombre: 'Monitores', cantidad: 2, activo: true, convocados: [conv('li', 'Lorena Ibarra')] },
      ],
    },
    {
      equipo_id: 'video',
      equipo: 'Video',
      ruta: 'v',
      puestos: [{ puesto_id: 'pant', nombre: 'Pantallas', cantidad: 1, activo: true, convocados: [] }],
    },
  ],
})

const candidatos = leerCandidatos([
  {
    servicio_id: 'sv-cs',
    persona_id: 'cs',
    nombre: 'Carmen',
    apellido: 'Aular',
    equipo: 'Video',
    rol: 'Servidor',
    ya_convocado_en_plan: true,
    puestos_del_dia: [{ plan_id: 'plan8', mismo_plan: true, puesto_id: 'cam1', puesto: 'Cámara 1', equipo: 'Video' }],
  },
  { servicio_id: 'sv-is', persona_id: 'is', nombre: 'Irene', apellido: 'Saavedra', equipo: 'Audio', rol: 'Servidor', puestos_del_dia: [] },
])

const props = (parche: Partial<PlanClientProps> = {}): PlanClientProps => ({
  plan: plan(),
  anterior: plan({ id: 'plan1', fecha: '2026-11-01', semana: 2 }),
  siguiente: plan({ id: 'plan15', fecha: '2026-11-15', semana: 4 }),
  equipos: leerEquiposPlan(equiposJson()),
  portadaUrl: 'https://demo.supabase.co/storage/v1/object/public/dps-series/s1/1.png',
  motivo: null,
  error: null,
  ...parche,
})

const region = () => screen.getByRole('region', { name: 'Equipos del plan' })
const columna = (equipo: string) => within(region()).getByRole('region', { name: equipo })
const estado = () => screen.getByTestId('estado-guardado')

beforeEach(() => {
  jest.clearAllMocks()
  buscar.mockResolvedValue({ ok: true, data: candidatos })
  convocar.mockResolvedValue({ ok: true, data: { convocadoId: 'c-nuevo' } })
  desconvocar.mockResolvedValue({ ok: true, data: { quitado: true } })
  cargar.mockResolvedValue({ ok: true, data: leerEquiposPlan(equiposJson()) })
})

describe('the header', () => {
  it('shows the cover, the crumbs, the series title, the date pill and the horarios', async () => {
    render(<PlanClient {...props()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Tu casa tiene influencers · Semana 3 de 4' })).toBeInTheDocument()
    expect(await screen.findByRole('navigation', { name: 'Ubicación' })).toHaveTextContent(/^DPS›Plan$/)
    expect(screen.getByTestId('portada-serie').querySelector('img')).toHaveAttribute(
      'src',
      'https://demo.supabase.co/storage/v1/object/public/dps-series/s1/1.png',
    )
    expect(screen.getByText('Domingo 8 nov 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan anterior, domingo 1 de noviembre' })).toHaveAttribute('href', '/dps/plan?plan=plan1')
    expect(screen.getByRole('link', { name: 'Plan siguiente, domingo 15 de noviembre' })).toHaveAttribute('href', '/dps/plan?plan=plan15')
    expect(screen.getByText('9:15 y 11:15 · llegada 7:00')).toBeInTheDocument()
  })

  it('has a placeholder cover with the series name, and none for a plan without a series', () => {
    const { unmount } = render(<PlanClient {...props({ portadaUrl: null })} />)
    expect(screen.getByTestId('portada-serie')).toHaveTextContent('Tu casa tiene influencers')
    expect(screen.getByTestId('portada-serie').querySelector('img')).toBeNull()
    unmount()
    render(<PlanClient {...props({ plan: plan({ serie: null, tipo: 'cena_del_senor', fecha: '2026-11-03' }), anterior: null, siguiente: null, portadaUrl: null })} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Cena del Señor' })).toBeInTheDocument()
    expect(screen.queryByTestId('portada-serie')).not.toBeInTheDocument()
    expect(screen.getByText('Martes 3 nov 2026')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Plan anterior/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No hay plan anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'No hay plan siguiente' })).toBeDisabled()
  })

  it('opens the matrix of Sundays from the week of the plan (T12), also for read-only', () => {
    const { unmount } = render(<PlanClient {...props()} />)
    expect(screen.getByRole('link', { name: 'Matriz' })).toHaveAttribute('href', '/dps/matriz?desde=2026-11-08')
    unmount()
    render(<PlanClient {...props({ plan: plan({ fecha: '2026-11-10', tipo: 'cena_del_senor' }), equipos: leerEquiposPlan(equiposJson(false)) })} />)
    expect(screen.getByRole('link', { name: 'Matriz' })).toHaveAttribute('href', '/dps/matriz?desde=2026-11-08')
  })

  it('has Equipos as the current tab, Orden next to it (T13) and Ensayo coming later', () => {
    render(<PlanClient {...props()} />)
    const pestanas = screen.getByRole('navigation', { name: 'Secciones del plan' })
    expect(within(pestanas).getByRole('link', { name: 'Equipos' })).toHaveAttribute('aria-current', 'page')
    expect(within(pestanas).getByRole('link', { name: 'Orden' })).toHaveAttribute('href', '/dps/plan?plan=plan8&vista=orden')
    expect(within(pestanas).getByRole('link', { name: 'Orden' })).not.toHaveAttribute('aria-current')
    const ensayo = within(pestanas).getByText('Ensayo').closest('[aria-disabled]')
    expect(ensayo).toHaveAttribute('aria-disabled', 'true')
    expect(ensayo).toHaveTextContent('pronto')
  })
})

describe('the team columns', () => {
  it('renders each team with its counts, puestos, convocados and "Falta" rows', () => {
    render(<PlanClient {...props()} />)
    expect(screen.getByTestId('resumen-plan')).toHaveTextContent('2 convocados en 2 equipos · 2 puestos sin cubrir')
    const audio = columna('Audio')
    expect(within(audio).getByText('2 convocados · 1 falta')).toBeInTheDocument()
    expect(within(audio).getByRole('heading', { level: 3, name: /Monitores/ })).toHaveTextContent('1/2')
    expect(within(audio).getByText('Lorena Ibarra')).toBeInTheDocument()
    expect(within(audio).getByRole('button', { name: 'Falta 1 en Monitores, Audio. Convocar' })).toBeInTheDocument()
    expect(within(audio).queryByRole('button', { name: /Falta 1 en Audio FOH/ })).not.toBeInTheDocument()
    expect(within(columna('Video')).getByText('0 convocados · 1 falta')).toBeInTheDocument()
  })

  it('says everything is covered when nothing is missing', () => {
    const lleno = equiposJson()
    lleno.equipos = [lleno.equipos[0]]
    lleno.equipos[0].puestos = [lleno.equipos[0].puestos[0]]
    render(<PlanClient {...props({ equipos: leerEquiposPlan(lleno) })} />)
    expect(screen.getByTestId('resumen-plan')).toHaveTextContent('1 convocado en 1 equipo · todo cubierto')
    expect(within(columna('Audio')).getByText('1 convocado · completo')).toBeInTheDocument()
  })

  it('is one focusable scroll region in a frame bounded to the viewport from md (L34)', () => {
    render(<PlanClient {...props()} />)
    expect(region()).toHaveAttribute('tabindex', '0')
    expect(region()).toHaveClass('md:overflow-x-auto', 'md:overflow-y-hidden', 'md:flex-1', 'md:min-h-0')
    expect(screen.getByTestId('marco-plan')).toHaveClass('md:h-[calc(100dvh-4rem)]', 'md:flex', 'md:flex-col')
    // The sr-only live region stays inside the page column instead of stretching the document.
    expect(screen.getByTestId('aviso-cambio').parentElement).toHaveClass('relative')
    expect(columna('Audio')).toHaveClass('relative', 'md:max-h-full')
    expect(within(columna('Audio')).getByTestId('cuerpo-columna')).toHaveClass('md:overflow-y-auto')
    // With controls to reach its rows, the column body takes no extra tab stop.
    expect(within(columna('Audio')).getByTestId('cuerpo-columna')).not.toHaveAttribute('tabindex')
  })
})

describe('convocar', () => {
  it('searches the puesto, flags who already serves that day, and convoca at once', async () => {
    const usuario = userEvent.setup()
    let terminar!: (r: Awaited<ReturnType<typeof acciones.convocarDps>>) => void
    convocar.mockReturnValueOnce(new Promise((r) => (terminar = r)))
    render(<PlanClient {...props()} />)

    await usuario.click(within(columna('Audio')).getByRole('button', { name: 'Convocar para Monitores, Audio' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Convocar para Monitores' })
    expect(buscar).toHaveBeenCalledWith({ planId: 'plan8', puestoId: 'mon', busqueda: '' })
    const opciones = await within(dialogo).findAllByRole('button', { name: /Aular|Saavedra/ })
    expect(opciones.map((b) => b.textContent)).toEqual([expect.stringContaining('Irene Saavedra'), expect.stringContaining('Carmen Aular')])
    expect(opciones[1]).toHaveTextContent('Ya sirve ese día en Cámara 1')

    await usuario.type(within(dialogo).getByRole('searchbox', { name: 'Buscar en el equipo' }), 'ire')
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith({ planId: 'plan8', puestoId: 'mon', busqueda: 'ire' }))

    await usuario.click(within(dialogo).getByRole('button', { name: /Irene Saavedra/ }))
    expect(convocar).toHaveBeenCalledWith({ planId: 'plan8', puestoId: 'mon', servicioId: 'sv-is' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(columna('Audio')).getByText('Irene Saavedra')).toBeInTheDocument()
    expect(within(columna('Audio')).getByText('3 convocados · completo')).toBeInTheDocument()
    expect(estado()).toHaveTextContent('Guardando…')
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Convocaste a Irene Saavedra para Monitores.')

    terminar({ ok: true, data: { convocadoId: 'c-nuevo' } })
    await waitFor(() => expect(estado()).toHaveTextContent('Guardado'))
  })

  it('rolls back and explains a refused convocatoria', async () => {
    const usuario = userEvent.setup()
    convocar.mockResolvedValueOnce({ ok: false, message: 'Esa persona ya no sirve en este equipo. Busca de nuevo.', codigo: 'servicio_invalido' })
    render(<PlanClient {...props()} />)
    await usuario.click(within(columna('Video')).getByRole('button', { name: 'Falta 1 en Pantallas, Video. Convocar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Convocar para Pantallas' })
    await usuario.click(await within(dialogo).findByRole('button', { name: /Irene Saavedra/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esa persona ya no sirve en este equipo. Busca de nuevo.'))
    expect(within(columna('Video')).queryByText('Irene Saavedra')).not.toBeInTheDocument()
    expect(within(columna('Video')).getByText('0 convocados · 1 falta')).toBeInTheDocument()
    expect(estado()).toHaveTextContent('No se pudo guardar')
  })

  it('does not offer someone already in this puesto, and shows a search error', async () => {
    const usuario = userEvent.setup()
    buscar.mockResolvedValueOnce({
      ok: true,
      data: leerCandidatos([
        { servicio_id: 'sv-li', persona_id: 'li', nombre: 'Lorena', apellido: 'Ibarra', equipo: 'Audio', rol: 'Servidor', ya_convocado_en_plan: true, en_este_puesto: true, puestos_del_dia: [] },
      ]),
    })
    render(<PlanClient {...props()} />)
    await usuario.click(within(columna('Audio')).getByRole('button', { name: 'Convocar para Monitores, Audio' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Convocar para Monitores' })
    const lorena = await within(dialogo).findByRole('button', { name: /Lorena Ibarra/ })
    expect(lorena).toBeDisabled()
    expect(lorena).toHaveTextContent('Ya está en este puesto')

    buscar.mockResolvedValueOnce({ ok: false, message: 'La búsqueda es muy larga (máximo 100 caracteres).', codigo: 'busqueda_invalida' })
    await usuario.type(within(dialogo).getByRole('searchbox', { name: 'Buscar en el equipo' }), 'x')
    expect(await within(dialogo).findByText('La búsqueda es muy larga (máximo 100 caracteres).')).toBeInTheDocument()
  })
})

describe('quitar', () => {
  it('removes the person at once and puts them back when it fails', async () => {
    const usuario = userEvent.setup()
    desconvocar.mockResolvedValueOnce({ ok: false, message: 'Solo quienes arman el plan pueden cambiar los convocados.', codigo: 'sin_autoridad' })
    render(<PlanClient {...props()} />)
    await usuario.click(within(columna('Audio')).getByRole('button', { name: 'Quitar a Lorena Ibarra de Monitores' }))
    expect(desconvocar).toHaveBeenCalledWith({ planId: 'plan8', puestoId: 'mon', personaId: 'li' })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Solo quienes arman el plan pueden cambiar los convocados.'))
    expect(within(columna('Audio')).getByText('Lorena Ibarra')).toBeInTheDocument()

    await usuario.click(within(columna('Audio')).getByRole('button', { name: 'Quitar a Lorena Ibarra de Monitores' }))
    expect(within(columna('Audio')).queryByText('Lorena Ibarra')).not.toBeInTheDocument()
    expect(within(columna('Audio')).getByRole('button', { name: 'Falta 2 en Monitores, Audio. Convocar' })).toBeInTheDocument()
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Quitaste a Lorena Ibarra de Monitores.')
    await waitFor(() => expect(estado()).toHaveTextContent('Guardado'))
  })
})

// S8: the directors of the direcciones come from Dream Team (automatico).
describe('automatic directors', () => {
  const conDirectores = () => {
    const json = equiposJson()
    return {
      ...json,
      equipos: [
        {
          equipo_id: 'dps',
          equipo: 'DPS',
          ruta: 'd',
          puestos: [
            { puesto_id: 'dmedia', nombre: 'Director de Media', cantidad: 1, activo: true, convocados: [{ ...conv('dm', 'Delia Mora'), automatico: true }] },
            { puesto_id: 'dbaut', nombre: 'Director de Bautizos', cantidad: 1, activo: true, convocados: [] },
          ],
        },
        ...json.equipos,
      ],
    }
  }

  it('tags the automatic director, offers no remove for them and keeps «Convocar» for someone else', () => {
    render(<PlanClient {...props({ equipos: leerEquiposPlan(conDirectores()) })} />)
    const dps = columna('DPS')
    expect(within(dps).getByText('Delia Mora')).toBeInTheDocument()
    expect(within(dps).getByText('Automático')).toBeInTheDocument()
    expect(within(dps).queryByRole('button', { name: /Quitar a Delia Mora/ })).not.toBeInTheDocument()
    expect(within(dps).getByRole('button', { name: 'Convocar para Director de Media, DPS' })).toBeInTheDocument()
    expect(within(dps).getByRole('button', { name: 'Falta 1 en Director de Bautizos, DPS. Convocar' })).toBeInTheDocument()
    // A person convocado by hand keeps the remove action and no tag.
    expect(within(columna('Audio')).getByRole('button', { name: 'Quitar a Lorena Ibarra de Monitores' })).toBeInTheDocument()
    expect(within(columna('Audio')).queryByText('Automático')).not.toBeInTheDocument()
  })

  it('copies into a plan that only has automatic directors without asking to replace', async () => {
    const usuario = userEvent.setup()
    const soloDirectores = conDirectores()
    soloDirectores.equipos.slice(1).forEach((e) => e.puestos.forEach((p) => (p.convocados = [])))
    anterior.mockResolvedValueOnce({ ok: true, data: plan({ id: 'plan1', fecha: '2026-11-01', semana: 2 }) })
    copiar.mockResolvedValueOnce({ ok: true, data: { copiados: 3, omitidos: 0 } })
    render(<PlanClient {...props({ equipos: leerEquiposPlan(soloDirectores) })} />)
    await usuario.click(screen.getByRole('button', { name: 'Acciones' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Copiar del domingo anterior' }))
    const dialogo = await screen.findByRole('alertdialog', { name: '¿Copiar del domingo 1 de noviembre?' })
    expect(within(dialogo).queryByRole('button', { name: 'Reemplazar' })).not.toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Copiar' }))
    expect(copiar).toHaveBeenCalledWith({ origenId: 'plan1', destinoId: 'plan8', reemplazar: false })
  })
})

describe('Copiar del domingo anterior', () => {
  const abrirMenu = async (usuario: ReturnType<typeof userEvent.setup>) => {
    await usuario.click(screen.getByRole('button', { name: 'Acciones' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Copiar del domingo anterior' }))
  }

  it('asks to replace the convocados the plan already has, copies and says how many', async () => {
    const usuario = userEvent.setup()
    anterior.mockResolvedValueOnce({ ok: true, data: plan({ id: 'plan1', fecha: '2026-11-01', semana: 2 }) })
    copiar.mockResolvedValueOnce({ ok: true, data: { copiados: 12, omitidos: 2 } })
    render(<PlanClient {...props()} />)
    await abrirMenu(usuario)
    expect(anterior).toHaveBeenCalledWith({ planId: 'plan8' })
    const dialogo = await screen.findByRole('alertdialog', { name: '¿Copiar del domingo 1 de noviembre?' })
    expect(dialogo).toHaveTextContent('Este plan ya tiene 2 convocados.')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Reemplazar' }))
    expect(copiar).toHaveBeenCalledWith({ origenId: 'plan1', destinoId: 'plan8', reemplazar: true })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Se copiaron 12 (2 omitidos: servicio inactivo o puesto desactivado)'))
    expect(cargar).toHaveBeenCalledWith({ planId: 'plan8' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('copies into an empty plan, and switches to replace when someone convocó meanwhile', async () => {
    const usuario = userEvent.setup()
    const vacio = equiposJson()
    vacio.equipos.forEach((e) => e.puestos.forEach((p) => (p.convocados = [])))
    anterior.mockResolvedValueOnce({ ok: true, data: plan({ id: 'plan1', fecha: '2026-11-01', semana: 2 }) })
    copiar
      .mockResolvedValueOnce({ ok: false, message: 'Este plan ya tiene convocados. Elige si quieres reemplazarlos.', codigo: 'destino_con_convocados' })
      .mockResolvedValueOnce({ ok: true, data: { copiados: 3, omitidos: 0 } })
    render(<PlanClient {...props({ equipos: leerEquiposPlan(vacio) })} />)
    await abrirMenu(usuario)
    const dialogo = await screen.findByRole('alertdialog', { name: '¿Copiar del domingo 1 de noviembre?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Copiar' }))
    expect(copiar).toHaveBeenLastCalledWith({ origenId: 'plan1', destinoId: 'plan8', reemplazar: false })
    expect(await within(dialogo).findByText('Este plan ya tiene convocados. Elige si quieres reemplazarlos.')).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Reemplazar' }))
    expect(copiar).toHaveBeenLastCalledWith({ origenId: 'plan1', destinoId: 'plan8', reemplazar: true })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Se copiaron 3'))
  })

  it('says when there is no previous plan', async () => {
    const usuario = userEvent.setup()
    anterior.mockResolvedValueOnce({ ok: true, data: null })
    render(<PlanClient {...props()} />)
    await abrirMenu(usuario)
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('No hay un plan anterior del mismo tipo para copiar.'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(copiar).not.toHaveBeenCalled()
  })
})

describe('the series cover', () => {
  it('uploads a new cover and shows it', async () => {
    const usuario = userEvent.setup()
    cambiarPortada.mockResolvedValueOnce({ ok: true, data: { imagenPath: 's1/2.png', url: 'https://demo.supabase.co/x/s1/2.png' } })
    render(<PlanClient {...props()} />)
    const archivo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'portada.png', { type: 'image/png' })
    await usuario.upload(screen.getByLabelText('Elegir imagen de portada'), archivo)
    await waitFor(() => expect(cambiarPortada).toHaveBeenCalledTimes(1))
    const datos = cambiarPortada.mock.calls[0][0] as FormData
    expect(datos.get('planId')).toBe('plan8')
    expect((datos.get('imagen') as File).name).toBe('portada.png')
    await waitFor(() => expect(screen.getByTestId('portada-serie').querySelector('img')).toHaveAttribute('src', 'https://demo.supabase.co/x/s1/2.png'))
    expect(toast.success).toHaveBeenCalledWith('Portada actualizada.')
  })

  it('refuses a wrong type or a big file before uploading', async () => {
    render(<PlanClient {...props()} />)
    const input = screen.getByLabelText('Elegir imagen de portada')
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } })
    const grande = new File(['x'], 'b.png', { type: 'image/png' })
    Object.defineProperty(grande, 'size', { value: 5 * 1024 * 1024 + 1 })
    fireEvent.change(input, { target: { files: [grande] } })
    expect(toast.error).toHaveBeenCalledTimes(2)
    expect(toast.error).toHaveBeenCalledWith('La imagen debe ser JPG, PNG o WebP de hasta 5 MB.')
    expect(cambiarPortada).not.toHaveBeenCalled()
  })

  it('removes the cover from the actions menu', async () => {
    const usuario = userEvent.setup()
    quitarPortada.mockResolvedValueOnce({ ok: true, data: { imagenPath: null, url: null } })
    render(<PlanClient {...props()} />)
    await usuario.click(screen.getByRole('button', { name: 'Acciones' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Quitar portada' }))
    expect(quitarPortada).toHaveBeenCalledWith({ planId: 'plan8' })
    await waitFor(() => expect(screen.getByTestId('portada-serie').querySelector('img')).toBeNull())
  })
})

describe('read-only', () => {
  it('shows the plan without any edit control', () => {
    render(<PlanClient {...props({ equipos: leerEquiposPlan(equiposJson(false)) })} />)
    expect(within(columna('Audio')).getByText('Lorena Ibarra')).toBeInTheDocument()
    expect(within(columna('Audio')).getByText('Falta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Convocar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quitar a/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Acciones' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Elegir imagen de portada')).not.toBeInTheDocument()
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument()
  })

  it('lets the keyboard scroll a column without controls', () => {
    render(<PlanClient {...props({ equipos: leerEquiposPlan(equiposJson(false)) })} />)
    expect(within(columna('Audio')).getByRole('group', { name: 'Audio' })).toHaveAttribute('tabindex', '0')
  })
})

describe('empty and error states', () => {
  it('has no plans yet', () => {
    render(<PlanClient {...props({ plan: null, anterior: null, siguiente: null, equipos: null, portadaUrl: null, motivo: 'sin_planes' })} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay planes')).toBeInTheDocument()
  })

  it('says an invalid plan does not exist and links to the next one', () => {
    render(<PlanClient {...props({ plan: null, anterior: null, siguiente: null, equipos: null, portadaUrl: null, motivo: 'plan_invalido' })} />)
    expect(screen.getByText('Ese plan no existe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al próximo plan' })).toHaveAttribute('href', '/dps/plan')
  })

  it('keeps the header when the teams could not be read', () => {
    render(<PlanClient {...props({ equipos: null, error: 'No se pudo cargar el plan. Actualiza la página.' })} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Tu casa tiene influencers · Semana 3 de 4' })).toBeInTheDocument()
    expect(screen.getByText('No se pudo cargar el plan. Actualiza la página.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Equipos del plan' })).not.toBeInTheDocument()
  })

  it('says when DPS has no puestos for the plan', () => {
    render(<PlanClient {...props({ equipos: leerEquiposPlan({ plan_id: 'plan8', puede_editar: true, equipos: [] }) })} />)
    expect(screen.getByText('Sin puestos en este plan')).toBeInTheDocument()
  })
})
