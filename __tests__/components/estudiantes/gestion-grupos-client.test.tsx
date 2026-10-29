/**
 * `<GestionGruposClient>` — /estudiantes/grupos (C2 of
 * odd/tasks/estudiantes-fase-b.md, artboards 06 / 07 / 08). The server
 * actions are mocked; each flow checks what the screen sends and shows.
 *
 * `ListaResponsiva` renders the desktop cells and the phone cell of every row
 * (CSS swaps them, jsdom applies none), so rows are found through their
 * "Abrir …" button. Without matchMedia the drawer is the desktop side panel.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GestionGruposClient, type GestionGruposClientProps } from '@/components/estudiantes/grupos/gestion-grupos-client'
import { FILTROS_INICIALES } from '@/lib/platform/estudiantes/grupos-vista'
import { CHICOS, GRUPOS_TRANSIT, SUBAREAS_TRANSIT, CAMPUS, TLR, TLR_CHICAS, TRANSIT, persona, subarea } from '@/lib/platform/estudiantes/__fixtures__/grupos'
import * as acciones from '@/lib/actions/estudiantes-grupos.actions'

jest.mock('@/lib/actions/estudiantes-grupos.actions', () => ({
  crearGrupo: jest.fn(),
  editarGrupo: jest.fn(),
  activarGrupo: jest.fn(),
  fijarLideres: jest.fn(),
  confirmarMiembro: jest.fn(),
  agregarIntegrante: jest.fn(),
  moverIntegrante: jest.fn(),
  quitarIntegrante: jest.fn(),
  buscarPersonas: jest.fn(),
  sinGrupo: jest.fn(),
  lideresDisponibles: jest.fn(),
}))

const exito = jest.fn()
const fallo = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: exito, error: fallo, info: jest.fn() }),
}))

jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/estudiantes/grupos',
}))

// PaginaSistema renders DesktopHeader behind React.lazy + Suspense; this
// synchronous double shows the breadcrumbs and the header action.
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ accionPrincipal, breadcrumbs }: { accionPrincipal?: React.ReactNode; breadcrumbs?: React.ReactNode }) => (
    <header>
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))

jest.setTimeout(15_000)

const mock = acciones as jest.Mocked<typeof acciones>
const OK = { ok: true as const, data: null }
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  jest.clearAllMocks()
  user = userEvent.setup({ delay: null })
  mock.sinGrupo.mockResolvedValue({ ok: true, data: [{ personaId: 'p-lf', nombre: 'Lucía Fernández', anioEtiqueta: '2do año', ultimoGrupo: '1er año · Chicas' }] })
  mock.lideresDisponibles.mockResolvedValue({
    ok: true,
    data: [persona('and', 'Andrea Molina'), persona('pao', 'Paola Ruiz'), persona('dia', 'Diana Peraza')],
  })
})

function props(extra: Partial<GestionGruposClientProps> = {}): GestionGruposClientProps {
  return {
    grupos: GRUPOS_TRANSIT,
    subareas: SUBAREAS_TRANSIT,
    escalas: {
      [CAMPUS]: [
        { numero: 1, etiqueta: '1er año', ambitoId: TRANSIT },
        { numero: 2, etiqueta: '2do año', ambitoId: TRANSIT },
        { numero: 3, etiqueta: '3er año', ambitoId: TRANSIT },
      ],
    },
    filtrosIniciales: FILTROS_INICIALES,
    ...extra,
  }
}

const panel = () => screen.getByRole('dialog')

async function abrirGrupo(nombre: string) {
  await user.click(screen.getByRole('button', { name: `Abrir ${nombre}` }))
  return panel()
}

describe('the list', () => {
  it('shows the hero, the three metrics, the área cards and the active groups', () => {
    render(<GestionGruposClient {...props()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Grupos de Transit' })).toBeInTheDocument()
    const metricas = screen.getByRole('group', { name: 'Necesitan atención' })
    expect(within(metricas).getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false'])
    expect(within(metricas).getByRole('button', { name: /Grupos sin líder/ })).toBeInTheDocument()
    expect(screen.queryByText(/Asistencia baja/)).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Áreas' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(5)
    expect(screen.getByText('5 de 5 grupos activos · 7 integrantes')).toBeInTheDocument()
  })

  it('filters by a metric and writes it in the URL; Desactivados lists the deactivated group', async () => {
    render(<GestionGruposClient {...props()} />)
    await user.click(screen.getByRole('button', { name: /Grupos sin líder/ }))
    expect(screen.getAllByRole('button', { name: /^Abrir / }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Abrir 2do año · Chicos',
      'Abrir 3er año · Chicas',
    ])
    expect(replace).toHaveBeenLastCalledWith('/estudiantes/grupos?ambito=a-transit&metrica=sinLider', { scroll: false })

    await user.click(screen.getByRole('button', { name: /Desactivados/ }))
    expect(screen.getAllByRole('button', { name: /^Abrir / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Abrir Nuevos · Chicos'])
  })

  it('enters a sub-área from its card and goes back from the breadcrumb', async () => {
    render(<GestionGruposClient {...props()} />)
    await user.click(within(screen.getByRole('group', { name: 'Áreas' })).getByRole('button', { name: /Grupos de Chicos/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Grupos de Chicos' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Áreas' })).not.toBeInTheDocument()
    await user.click(within(screen.getByRole('navigation', { name: 'Ubicación' })).getByRole('button', { name: 'Transit' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Grupos de Transit' })).toBeInTheDocument()
  })
})

describe('the group drawer', () => {
  it('confirms a visitor from the 3rd visit as a member', async () => {
    mock.confirmarMiembro.mockResolvedValue(OK)
    render(<GestionGruposClient {...props()} />)
    const dialogo = await abrirGrupo('2do año · Chicas')
    expect(within(dialogo).getByText(/vino 3 domingos como visitante/)).toBeInTheDocument()
    expect(within(dialogo).getByText('Luciana Ferrer')).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar como miembro' }))
    expect(mock.confirmarMiembro).toHaveBeenCalledWith({ grupoId: 'g2', personaId: 'i4' })
    expect(exito).toHaveBeenCalledWith('Sofía Linares ya es integrante de 2do año · Chicas')
  })

  it('warns about a group without a leader and shows who directs the sub-área', async () => {
    render(<GestionGruposClient {...props()} />)
    const dialogo = await abrirGrupo('3er año · Chicas')
    expect(within(dialogo).getByText('Este grupo no tiene líder')).toBeInTheDocument()
    expect(within(dialogo).getByText('Lorena Salas')).toBeInTheDocument()
    expect(within(dialogo).getByText('Se asignan en Dream Team › Transit › Grupos de Chicas.')).toBeInTheDocument()
  })

  it('removes a leader with one tap', async () => {
    mock.fijarLideres.mockResolvedValue(OK)
    render(<GestionGruposClient {...props()} />)
    const dialogo = await abrirGrupo('2do año · Chicas')
    await user.click(within(dialogo).getByRole('button', { name: 'Quitar a Paola Ruiz como líder' }))
    expect(mock.fijarLideres).toHaveBeenCalledWith({ grupoId: 'g2', servicioIds: ['sv-and'] })
  })

  it('sets the leaders from the multi-select', async () => {
    mock.fijarLideres.mockResolvedValue(OK)
    render(<GestionGruposClient {...props()} />)
    const dialogo = await abrirGrupo('3er año · Chicas')
    await user.click(within(dialogo).getByRole('button', { name: 'Asignar líder' }))
    expect(mock.lideresDisponibles).toHaveBeenCalledWith({ subareaId: 's-transit-chicas', campusId: CAMPUS })
    const diana = await within(panel()).findByRole('checkbox', { name: /Diana Peraza/ })
    expect(within(panel()).getByRole('checkbox', { name: /Paola Ruiz/ })).toHaveAccessibleName(/lidera 2do año · Chicas/)
    await user.click(diana)
    await user.click(within(panel()).getByRole('button', { name: 'Guardar líderes' }))
    expect(mock.fijarLideres).toHaveBeenCalledWith({ grupoId: 'g3', servicioIds: ['sv-dia'] })
    expect(exito).toHaveBeenCalledWith('Líderes guardados')
    expect(await within(panel()).findByText('Desactivar grupo', { selector: 'h3' })).toBeInTheDocument()
  })

  it('deactivates only after the inline confirmation', async () => {
    mock.activarGrupo.mockResolvedValue(OK)
    render(<GestionGruposClient {...props()} />)
    const dialogo = await abrirGrupo('1er año · Chicos')
    await user.click(within(dialogo).getByRole('button', { name: 'Desactivar grupo' }))
    expect(mock.activarGrupo).not.toHaveBeenCalled()
    expect(within(dialogo).getByText('¿Desactivar 1er año · Chicos?')).toBeInTheDocument()
    expect(within(dialogo).getByText(/Sus 4 integrantes quedan sin grupo/)).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Desactivar' }))
    expect(mock.activarGrupo).toHaveBeenCalledWith({ grupoId: 'g4', activo: false })
  })

  it('reactivates a deactivated group', async () => {
    mock.activarGrupo.mockResolvedValue(OK)
    render(<GestionGruposClient {...props({ filtrosIniciales: { ...FILTROS_INICIALES, metrica: 'desactivados' } })} />)
    const dialogo = await abrirGrupo('Nuevos · Chicos')
    await user.click(within(dialogo).getByRole('button', { name: 'Reactivar grupo' }))
    expect(mock.activarGrupo).toHaveBeenCalledWith({ grupoId: 'g8', activo: true })
  })
})

describe('members', () => {
  it('moves a member to another group of the ámbito', async () => {
    mock.moverIntegrante.mockResolvedValue(OK)
    render(<GestionGruposClient {...props()} />)
    const dialogo = await abrirGrupo('1er año · Chicas')
    await user.click(within(dialogo).getByRole('button', { name: 'Abrir Alejandra Acosta' }))
    expect(within(panel()).getByRole('button', { name: 'Volver a 1er año · Chicas' })).toBeInTheDocument()
    await user.selectOptions(within(panel()).getByLabelText('Grupo nuevo'), 'g2')
    await user.click(within(panel()).getByRole('button', { name: 'Mover' }))
    expect(mock.moverIntegrante).toHaveBeenCalledWith({ grupoId: 'g2', personaId: 'i1' })
    expect(exito).toHaveBeenCalledWith('Alejandra Acosta pasó a 2do año · Chicas')
  })

  it('removes a member only after the inline confirmation', async () => {
    mock.quitarIntegrante.mockResolvedValue(OK)
    render(<GestionGruposClient {...props()} />)
    const dialogo = await abrirGrupo('1er año · Chicas')
    await user.click(within(dialogo).getByRole('button', { name: 'Abrir Bárbara Bermúdez' }))
    await user.click(within(panel()).getByRole('button', { name: 'Quitar del grupo' }))
    expect(within(panel()).getByText('¿Quitar a Bárbara del grupo?')).toBeInTheDocument()
    await user.click(within(panel()).getByRole('button', { name: 'Quitar' }))
    expect(mock.quitarIntegrante).toHaveBeenCalledWith({ grupoId: 'g1', personaId: 'i2' })
  })

  it('adds someone without a group as a member and searches the church', async () => {
    mock.agregarIntegrante.mockResolvedValue(OK)
    mock.buscarPersonas.mockResolvedValue({
      ok: true,
      data: [{ personaId: 'p-lr', nombre: 'Lucía Ramírez', grupoId: 'g3', grupo: '3er año · Chicas', enEsteGrupo: false }],
    })
    render(<GestionGruposClient {...props()} />)
    const dialogo = await abrirGrupo('2do año · Chicas')
    await user.click(within(dialogo).getByRole('button', { name: 'Agregar integrante' }))
    expect(await within(panel()).findByRole('heading', { name: 'Sin grupo en Transit · Chicas · 1' })).toBeInTheDocument()
    expect(within(panel()).getByRole('button', { name: 'Registrar nuevo' })).toBeDisabled()
    await user.click(within(panel()).getByRole('button', { name: 'Agregar a Lucía Fernández' }))
    expect(mock.agregarIntegrante).toHaveBeenCalledWith({ grupoId: 'g2', personaId: 'p-lf' })
    expect(within(panel()).getByText('Ya está en este grupo')).toBeInTheDocument()

    await user.type(within(panel()).getByLabelText('Busca al estudiante'), 'Lucía Ramírez')
    await waitFor(() => expect(mock.buscarPersonas).toHaveBeenCalledWith({ grupoId: 'g2', consulta: 'Lucía Ramírez' }))
    expect(await within(panel()).findByRole('button', { name: 'Mover aquí a Lucía Ramírez' })).toBeInTheDocument()
  })
})

describe('Crear grupo', () => {
  it('suggests "… B" when the name exists and creates the group with its leaders', async () => {
    mock.crearGrupo.mockResolvedValue({ ok: true, data: { grupoId: 'g-nuevo', aviso: null } })
    render(<GestionGruposClient {...props({ filtrosIniciales: { ...FILTROS_INICIALES, area: CHICOS } })} />)
    await user.click(screen.getAllByRole('button', { name: 'Crear grupo' })[0])
    const dialogo = panel()
    await user.selectOptions(within(dialogo).getByLabelText('Año escolar'), '2')
    expect(within(dialogo).getByLabelText('Nombre')).toHaveValue('2do año · Chicos B')
    expect(within(dialogo).getByText('Ya existe «2do año · Chicos», por eso sugerimos «2do año · Chicos B».')).toBeInTheDocument()
    await user.click(await within(dialogo).findByRole('checkbox', { name: /Diana Peraza/ }))
    await user.click(within(dialogo).getByRole('button', { name: 'Crear grupo' }))
    expect(mock.crearGrupo).toHaveBeenCalledWith({
      subareaId: CHICOS,
      campusId: CAMPUS,
      lideres: ['sv-dia'],
      nombre: '2do año · Chicos B',
      anio: 2,
      zona: null,
      diaSemana: null,
      hora: null,
    })
    expect(exito).toHaveBeenCalledWith('Creaste 2do año · Chicos B')
  })

  it('refuses a taken name on the field, without calling the server', async () => {
    render(<GestionGruposClient {...props({ filtrosIniciales: { ...FILTROS_INICIALES, area: CHICOS } })} />)
    await user.click(screen.getAllByRole('button', { name: 'Crear grupo' })[0])
    const dialogo = panel()
    await user.selectOptions(within(dialogo).getByLabelText('Año escolar'), '1')
    const nombre = within(dialogo).getByLabelText('Nombre')
    await user.clear(nombre)
    await user.type(nombre, '1er año · chicos')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear grupo' }))
    expect(mock.crearGrupo).not.toHaveBeenCalled()
    expect(nombre).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialogo).getByText('Ya hay un grupo llamado «1er año · Chicos» en esta sub-área. Elige otro nombre.')).toBeInTheDocument()
  })

  it('asks The Living Room for zona, day and hour instead of the año', async () => {
    mock.crearGrupo.mockResolvedValue({ ok: true, data: { grupoId: 'g-tlr', aviso: null } })
    const tlr = subarea(TLR_CHICAS, { ambitoId: TLR, ambito: 'The Living Room', experiencia: 'the_living_room' })
    render(<GestionGruposClient {...props({ grupos: [], subareas: [tlr] })} />)
    expect(screen.getByText('Todavía no hay grupos aquí')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Crear grupo' })[0])
    const dialogo = panel()
    expect(within(dialogo).queryByLabelText('Año escolar')).not.toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Hora')).toBeDisabled()
    await user.type(within(dialogo).getByLabelText('Zona'), 'Zona Este')
    expect(within(dialogo).getByLabelText('Nombre')).toHaveValue('Zona Este · Chicas')
    await user.selectOptions(within(dialogo).getByLabelText('Se reúne cada'), '4')
    await user.type(within(dialogo).getByLabelText('Hora'), '19:30')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear grupo' }))
    expect(mock.crearGrupo).toHaveBeenCalledWith({
      subareaId: TLR_CHICAS,
      campusId: CAMPUS,
      lideres: [],
      nombre: 'Zona Este · Chicas',
      anio: null,
      zona: 'Zona Este',
      diaSemana: 4,
      hora: '19:30',
    })
  })

  it('edits a group from its drawer', async () => {
    mock.editarGrupo.mockResolvedValue(OK)
    render(<GestionGruposClient {...props()} />)
    const dialogo = await abrirGrupo('3er año · Chicas')
    await user.click(within(dialogo).getByRole('button', { name: 'Editar grupo' }))
    const formulario = await screen.findByRole('dialog', { name: 'Editar grupo' })
    const nombre = within(formulario).getByLabelText('Nombre')
    await user.clear(nombre)
    await user.type(nombre, '3er año · Chicas A')
    await user.click(within(formulario).getByRole('button', { name: 'Guardar cambios' }))
    expect(mock.editarGrupo).toHaveBeenCalledWith({ grupoId: 'g3', nombre: '3er año · Chicas A', anio: 3, zona: null, diaSemana: null, hora: null })
  })
})
