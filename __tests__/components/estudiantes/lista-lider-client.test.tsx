/**
 * `<ListaLiderClient>` — the leader list (C3b of odd/tasks/estudiantes-fase-b.md,
 * artboards 01 / 02 / 05). The server actions are mocked; each flow checks
 * what the screen sends and shows. Every person is fictitious.
 *
 * `ListaResponsiva` renders the desktop cells and the phone cell of every row
 * (CSS swaps them, jsdom applies none), so each row has two ✓ / ✕ pairs; the
 * tests use the first. Without matchMedia the drawers are side panels.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ListaLiderClient } from '@/components/estudiantes/lista/lista-lider-client'
import type { GrupoLista, ListaGrupo, PersonaLista, Sesion } from '@/lib/platform/estudiantes/lista-datos'
import type { DatosListaLider } from '@/lib/platform/estudiantes/lista-servidor'
import * as acciones from '@/lib/actions/estudiantes-lista.actions'
import * as accionesGrupos from '@/lib/actions/estudiantes-grupos.actions'
import * as accionesFicha from '@/lib/actions/estudiantes-ficha.actions'

jest.mock('@/lib/actions/estudiantes-lista.actions', () => ({
  marcarAsistencia: jest.fn(),
  guardarLugar: jest.fn(),
  confirmarMiembroLista: jest.fn(),
  agregarVisitante: jest.fn(),
  crearVisitante: jest.fn(),
  buscarCoincidencias: jest.fn(),
  sesionReciente: jest.fn(),
}))
jest.mock('@/lib/actions/estudiantes-grupos.actions', () => ({ buscarPersonas: jest.fn() }))
jest.mock('@/lib/actions/estudiantes-ficha.actions', () => ({ leerFicha: jest.fn(), guardarFicha: jest.fn() }))

const exito = jest.fn()
const fallo = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: exito, error: fallo, info: jest.fn() }),
}))

const replace = jest.fn()
const refresh = jest.fn()
const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push }),
  usePathname: () => '/estudiantes/grupos/g2',
}))

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
const mockGrupos = accionesGrupos as jest.Mocked<typeof accionesGrupos>
const mockFicha = accionesFicha as jest.Mocked<typeof accionesFicha>
let user: ReturnType<typeof userEvent.setup>

const FECHA = '2026-10-25'

function persona(id: string, nombre: string, extra: Partial<PersonaLista> = {}): PersonaLista {
  return {
    personaId: id,
    nombre,
    genero: 'Femenino',
    telefono: '0414 555 0132',
    fechaNacimiento: '2013-03-14',
    estado: 'miembro',
    desde: '2025-09-14',
    anio: 2,
    anioEtiqueta: '2do año',
    marca: null,
    marcadoAt: null,
    visitas: 0,
    sugerirConfirmar: false,
    representantes: [],
    ...extra,
  }
}

const GRUPO: GrupoLista = {
  id: 'g2',
  nombre: '2do año · Chicas',
  campusId: 'c1',
  ambitoId: 'a-transit',
  ambito: 'Transit',
  experiencia: 'estudiantes',
  subareaId: 's1',
  subarea: 'Grupos de Chicas',
  anio: 2,
  anioEtiqueta: '2do año',
  zona: null,
  diaSemana: null,
  hora: null,
}

const sesion = (fecha: string, extra: Partial<Sesion> = {}): Sesion => ({
  fecha,
  turnoId: 't9',
  turno: 'Domingo 9:00',
  hora: '09:00:00',
  reunionId: null,
  lugar: null,
  presentes: 0,
  ausentes: 0,
  visitantes: 0,
  marcados: 0,
  ...extra,
})

function datos({ lista = {}, ...extra }: Partial<Omit<DatosListaLider, 'lista'>> & { readonly lista?: Partial<ListaGrupo> } = {}): DatosListaLider {
  const base: ListaGrupo = {
    grupo: GRUPO,
    fecha: FECHA,
    turnoId: 't9',
    reunionId: 'r1',
    lugar: null,
    puedeVerVivo: false,
    puedeGestionar: false,
    personas: [
      persona('p1', 'Camila Herrera', {
        marca: 'presente',
        marcadoAt: '2026-10-25T13:12:00Z',
        representantes: [{ personaId: 'r1', nombre: 'Luis Herrera', telefono: '0424 555 0111', tipo: 'padre' }],
      }),
      persona('p2', 'Daniela Colmenares'),
      persona('p3', 'Mariana Quintero', { marca: 'ausente', marcadoAt: '2026-10-25T13:30:00Z' }),
      persona('v1', 'Sofía Linares', { estado: 'visitante', visitas: 3, sugerirConfirmar: true, marca: 'presente', desde: '2026-10-11' }),
      persona('v3', 'Luciana Ferrer', { estado: 'visitante', visitas: 1, marca: 'presente', desde: FECHA }),
    ],
    ...lista,
  }
  return {
    grupo: {
      grupoId: 'g2',
      nombre: '2do año · Chicas',
      campusId: 'c1',
      ambito: 'Transit',
      experiencia: base.grupo.experiencia,
      subareaId: 's1',
      subarea: 'Grupos de Chicas',
      detalle: '2do año',
      soyLider: true,
      puedeVerVivo: false,
      puedeGestionar: false,
      miembros: 3,
      visitantes: 2,
      lideres: ['Andrea Molina'],
    },
    lista: base,
    sesiones: [sesion(FECHA), sesion('2026-10-18')],
    sesion: { fecha: base.fecha, turnoId: base.turnoId },
    historial: {
      reuniones: [
        { reunionId: 'r0', fecha: '2026-10-18' },
        { reunionId: 'r1', fecha: FECHA },
      ],
      estados: { p1: ['presente', 'presente'], p2: ['ausente', null] },
    },
    escala: [
      { numero: 1, etiqueta: '1er año', ambitoId: 'a-transit' },
      { numero: 2, etiqueta: '2do año', ambitoId: 'a-transit' },
      { numero: 3, etiqueta: '3er año', ambitoId: 'a-transit' },
    ],
    gruposSubarea: [],
    esRaiz: true,
    generoVisor: 'Femenino',
    hoy: '2026-10-29',
    ...extra,
  }
}

const marcas = (nombre: string) => within(screen.getAllByRole('group', { name: `Asistencia de ${nombre}` })[0])
const resumen = () => screen.getAllByText((_, el) => el?.tagName === 'P' && el.getAttribute('aria-live') === 'polite')[0]

const FICHA_P1 = {
  personaId: 'p1',
  campusId: 'c1',
  anioActual: 2,
  anioFinal: 6,
  egresado: false,
  puedeEditar: true,
  escala: [
    { numero: 1, etiqueta: '1er año', ambito: 'Transit' },
    { numero: 2, etiqueta: '2do año', ambito: 'Transit' },
    { numero: 3, etiqueta: '3er año', ambito: 'Transit' },
    { numero: 6, etiqueta: '6to año', ambito: 'Inside Out' },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  user = userEvent.setup({ delay: null })
  mockFicha.leerFicha.mockResolvedValue({ ok: true, data: FICHA_P1 })
})

describe('the list', () => {
  it('shows the meeting, the counts and both sections in A–Z order', () => {
    render(<ListaLiderClient datos={datos()} />)
    expect(screen.getByRole('heading', { level: 1, name: '2do año · Chicas' })).toBeInTheDocument()
    expect(screen.getAllByText('Domingo 25 oct · 9:00 · Transit')[0]).toBeInTheDocument()
    expect(resumen()).toHaveTextContent('2 presentes · 1 ausente · 1 sin marcar · 1 visitante nuevo')
    expect(screen.getByRole('heading', { name: 'Integrantes · 3' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Visitantes · 2' })).toBeInTheDocument()
    const integrantes = screen.getByRole('table', { name: 'Integrantes' })
    expect(within(integrantes).getAllByRole('button', { name: /^Abrir / }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Abrir Camila Herrera',
      'Abrir Daniela Colmenares',
      'Abrir Mariana Quintero',
    ])
    // A visitor registered at this meeting gets "Nueva hoy" instead of the marks.
    expect(screen.getAllByText('Nueva hoy')[0]).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Asistencia de Luciana Ferrer' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Últimas 2 reuniones: presente, presente')[0]).toBeInTheDocument()
    expect(screen.getByText(/en la lista · se guarda al marcar/)).toBeInTheDocument()
  })

  it('a leader with a single group has no back control; from Grupos it goes back to the drawer', () => {
    const { unmount } = render(<ListaLiderClient datos={datos()} />)
    expect(screen.queryByRole('link', { name: /^Volver a/ })).not.toBeInTheDocument()
    unmount()
    render(<ListaLiderClient datos={datos()} desde="grupos" />)
    expect(screen.getByRole('link', { name: 'Volver a Grupos' })).toHaveAttribute('href', '/estudiantes/grupos?grupo=g2')
    expect(screen.getByRole('link', { name: 'Transit' })).toHaveAttribute('href', '/estudiantes/grupos?grupo=g2')
  })

  it('without an origin someone with more groups goes back to Estudiantes', () => {
    render(<ListaLiderClient datos={datos({ esRaiz: false })} />)
    expect(screen.getByRole('link', { name: 'Volver a Estudiantes' })).toHaveAttribute('href', '/estudiantes')
  })
})

describe('marking', () => {
  it('marks at once, saves and announces it', async () => {
    let resolver: (v: Awaited<ReturnType<typeof acciones.marcarAsistencia>>) => void = () => {}
    mock.marcarAsistencia.mockImplementation(() => new Promise((r) => (resolver = r)))
    render(<ListaLiderClient datos={datos()} />)
    await user.click(marcas('Daniela Colmenares').getByRole('button', { name: 'Presente' }))
    // Optimistic: pressed and counted before the server answers.
    expect(marcas('Daniela Colmenares').getByRole('button', { name: 'Presente' })).toHaveAttribute('aria-pressed', 'true')
    expect(resumen()).toHaveTextContent('3 presentes · 1 ausente · 0 sin marcar')
    expect(mock.marcarAsistencia).toHaveBeenCalledWith({ grupoId: 'g2', fecha: FECHA, turnoId: 't9', personaId: 'p2', estado: 'presente' })
    resolver({ ok: true, data: { visitas: 1, sugerirConfirmar: false } })
    await waitFor(() => expect(exito).toHaveBeenCalledWith('Daniela: presente · guardado'))
  })

  it('a second tap on the same state clears the mark', async () => {
    mock.marcarAsistencia.mockResolvedValue({ ok: true, data: { visitas: 0, sugerirConfirmar: false } })
    render(<ListaLiderClient datos={datos()} />)
    await user.click(marcas('Camila Herrera').getByRole('button', { name: 'Presente' }))
    expect(mock.marcarAsistencia).toHaveBeenCalledWith(expect.objectContaining({ personaId: 'p1', estado: null }))
    expect(marcas('Camila Herrera').getByRole('button', { name: 'Presente' })).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(exito).toHaveBeenCalledWith('Camila: sin marcar'))
  })

  it('rolls back and shows the error when the server refuses', async () => {
    mock.marcarAsistencia.mockResolvedValue({ ok: false, message: 'Esa fecha no tiene reunión para marcar. Elige otra.', codigo: 'fecha_invalida' })
    render(<ListaLiderClient datos={datos()} />)
    await user.click(marcas('Mariana Quintero').getByRole('button', { name: 'Presente' }))
    await waitFor(() => expect(fallo).toHaveBeenCalledWith('Esa fecha no tiene reunión para marcar. Elige otra.'))
    expect(marcas('Mariana Quintero').getByRole('button', { name: 'Ausente' })).toHaveAttribute('aria-pressed', 'true')
    expect(resumen()).toHaveTextContent('2 presentes · 1 ausente · 1 sin marcar')
  })
})

describe('filters and search', () => {
  it('a pill narrows the list and a second tap goes back to Todos', async () => {
    render(<ListaLiderClient datos={datos()} />)
    const pastillas = screen.getByRole('group', { name: 'Mostrar' })
    await user.click(within(pastillas).getByRole('button', { name: /Sin marcar/ }))
    expect(screen.getAllByRole('button', { name: /^Abrir / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Abrir Daniela Colmenares'])
    expect(within(pastillas).getByRole('button', { name: /Sin marcar/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(pastillas).getByRole('button', { name: /Sin marcar/ }))
    expect(within(pastillas).getByRole('button', { name: /Todos/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(5)

    await user.click(within(pastillas).getByRole('button', { name: /Visitantes/ }))
    expect(screen.queryByRole('table', { name: 'Integrantes' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(2)
  })

  it('searches by name and offers to clear when nobody matches', async () => {
    render(<ListaLiderClient datos={datos()} />)
    await user.type(screen.getByRole('searchbox', { name: 'Buscar en el grupo' }), 'zz')
    expect(screen.getByText('Nadie coincide')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpiar todo' }))
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(5)
  })
})

describe('the 3rd visit', () => {
  it('suggests confirming the visitor and confirms', async () => {
    mock.confirmarMiembroLista.mockResolvedValue({ ok: true, data: null })
    render(<ListaLiderClient datos={datos()} />)
    expect(screen.getByText(/vino 3 domingos como visitante\. ¿La sumas al grupo\?/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar como miembro' }))
    expect(mock.confirmarMiembroLista).toHaveBeenCalledWith({ grupoId: 'g2', personaId: 'v1' })
    await waitFor(() => expect(exito).toHaveBeenCalledWith('Sofía Linares ya es integrante del grupo'))
    expect(refresh).toHaveBeenCalled()
  })

  it('"Ahora no" hides the suggestion', async () => {
    render(<ListaLiderClient datos={datos()} />)
    await user.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(screen.queryByText(/¿La sumas al grupo\?/)).not.toBeInTheDocument()
  })
})

describe('the row detail', () => {
  it('shows contacts, today’s mark and the representante; marks from there', async () => {
    mock.marcarAsistencia.mockResolvedValue({ ok: true, data: { visitas: 0, sugerirConfirmar: false } })
    render(<ListaLiderClient datos={datos()} />)
    await user.click(screen.getAllByRole('button', { name: 'Abrir Camila Herrera' })[0])
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByRole('link', { name: 'WhatsApp a Camila Herrera' })).toHaveAttribute('href', 'https://wa.me/584145550132')
    expect(within(panel).getByRole('link', { name: 'Llamar a Camila Herrera' })).toHaveAttribute('href', 'tel:04145550132')
    expect(within(panel).getByText('Luis Herrera')).toBeInTheDocument()
    expect(within(panel).getByText(/Solo los líderes del grupo, su entrenador y la dirección de Transit ven este contacto/)).toBeInTheDocument()
    expect(within(panel).getByText('Domingo 25 oct · 9:00')).toBeInTheDocument()
    expect(within(panel).getByText('2 de 2 domingos')).toBeInTheDocument()
    await user.click(within(within(panel).getByRole('group', { name: 'Asistencia de hoy' })).getByRole('button', { name: 'Ausente' }))
    expect(mock.marcarAsistencia).toHaveBeenCalledWith(expect.objectContaining({ personaId: 'p1', estado: 'ausente' }))
  })
})

describe('the school year', () => {
  it('fixes the año actual and the año final from the row detail', async () => {
    mockFicha.guardarFicha.mockResolvedValue({ ok: true, data: null })
    render(<ListaLiderClient datos={datos()} />)
    await user.click(screen.getAllByRole('button', { name: 'Abrir Camila Herrera' })[0])
    const panel = screen.getByRole('dialog')
    expect(await within(panel).findByText('2do año · termina en 6to año')).toBeInTheDocument()
    expect(mockFicha.leerFicha).toHaveBeenCalledWith('p1')
    await user.click(within(panel).getByRole('button', { name: 'Editar el año escolar de Camila Herrera' }))
    await user.selectOptions(within(panel).getByLabelText('Año actual'), '3')
    await user.click(within(panel).getByRole('button', { name: 'Guardar' }))
    expect(mockFicha.guardarFicha).toHaveBeenCalledWith('p1', 3, 6)
    await waitFor(() => expect(exito).toHaveBeenCalledWith('Año escolar de Camila Herrera guardado'))
    expect(refresh).toHaveBeenCalled()
  })
})

describe('entrenador mode', () => {
  it('shows the group selector of the sub-área and the notice', async () => {
    const d = datos()
    render(
      <ListaLiderClient
        datos={{
          ...d,
          grupo: { ...d.grupo, soyLider: false, puedeVerVivo: true },
          esRaiz: false,
          gruposSubarea: [d.grupo, { ...d.grupo, grupoId: 'g3', nombre: '3er año · Chicas' }],
        }}
        desde="vivo"
      />,
    )
    expect(screen.getByText('Marcas como entrenadora, el adulto que ayuda al grupo. Andrea Molina (líder) ve tus marcas y puede corregirlas.')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Grupo que estás marcando'), 'g3')
    expect(push).toHaveBeenCalledWith('/estudiantes/grupos/g3?desde=vivo')
  })
})

describe('The Living Room', () => {
  const tlr = (): DatosListaLider => {
    const d = datos({
      lista: {
        grupo: { ...GRUPO, nombre: 'Zona Este · Chicos', ambito: 'The Living Room', experiencia: 'the_living_room', subarea: 'Grupos de Chicos', anio: null, anioEtiqueta: null, zona: 'Zona Este', diaSemana: 4, hora: '19:30:00' },
        fecha: '2026-10-29',
        turnoId: null,
        lugar: null,
        personas: [persona('t1', 'Adrián Castillo', { genero: 'Masculino', fechaNacimiento: '2005-02-03', anio: null, anioEtiqueta: null })],
      },
      sesiones: ['2026-10-29', '2026-10-22', '2026-10-15', '2026-10-08'].map((f) => sesion(f, { turnoId: null, turno: null, hora: null })),
      sesion: { fecha: '2026-10-29', turnoId: null },
      escala: [],
    })
    return { ...d, grupo: { ...d.grupo, nombre: 'Zona Este · Chicos', ambito: 'The Living Room', experiencia: 'the_living_room' } }
  }

  it('offers the weekly meeting pills and navigates to another one', async () => {
    render(<ListaLiderClient datos={tlr()} />)
    expect(screen.getByText('Cada jueves')).toBeInTheDocument()
    const reunion = screen.getByRole('group', { name: 'Reunión del grupo' })
    expect(within(reunion).getAllByRole('button').map((b) => b.textContent)).toEqual(['Jue 29 oct · hoy', 'Jue 22 oct', 'Jue 15 oct'])
    expect(within(reunion).getByRole('button', { name: 'Jue 29 oct · hoy' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(reunion).getByRole('button', { name: 'Jue 22 oct' }))
    expect(replace).toHaveBeenCalledWith('/estudiantes/grupos/g2?fecha=2026-10-22', { scroll: false })
  })

  it('saves the optional place on blur, with no turno', async () => {
    mock.guardarLugar.mockResolvedValue({ ok: true, data: null })
    render(<ListaLiderClient datos={tlr()} />)
    await user.type(screen.getByLabelText('Lugar (opcional)'), 'Casa de Adrián')
    await user.tab()
    expect(mock.guardarLugar).toHaveBeenCalledWith({ grupoId: 'g2', fecha: '2026-10-29', turnoId: null, lugar: 'Casa de Adrián' })
    await waitFor(() => expect(exito).toHaveBeenCalledWith('Lugar guardado'))
  })

  it('marks without a turno and shows the age, never a representante', async () => {
    mock.marcarAsistencia.mockResolvedValue({ ok: true, data: { visitas: 0, sugerirConfirmar: false } })
    render(<ListaLiderClient datos={tlr()} />)
    await user.click(marcas('Adrián Castillo').getByRole('button', { name: 'Presente' }))
    expect(mock.marcarAsistencia).toHaveBeenCalledWith({ grupoId: 'g2', fecha: '2026-10-29', turnoId: null, personaId: 't1', estado: 'presente' })
    await user.click(screen.getAllByRole('button', { name: 'Abrir Adrián Castillo' })[0])
    expect(within(screen.getByRole('dialog')).queryByText('Representante')).not.toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).queryByText('Año escolar')).not.toBeInTheDocument()
    expect(mockFicha.leerFicha).not.toHaveBeenCalled()
  })
})

describe('Agregar visitante', () => {
  it('searches first: shows who is in the list, in another group, or can be added', async () => {
    mockGrupos.buscarPersonas.mockResolvedValue({
      ok: true,
      data: [
        { personaId: 'v3', nombre: 'Luciana Ferrer', grupoId: 'g2', grupo: '2do año · Chicas', enEsteGrupo: true },
        { personaId: 'd2', nombre: 'Lucía Ramírez', grupoId: 'g3', grupo: '3er año · Chicas', enEsteGrupo: false },
        { personaId: 'd1', nombre: 'Lucía Fernández', grupoId: null, grupo: null, enEsteGrupo: false },
      ],
    })
    mock.agregarVisitante.mockResolvedValue({ ok: true, data: null })
    render(<ListaLiderClient datos={datos()} />)
    await user.click(screen.getAllByRole('button', { name: 'Agregar visitante' })[0])
    const panel = screen.getByRole('dialog')
    await user.type(within(panel).getByLabelText('Búscala primero'), 'luci')
    expect(await within(panel).findByText('Ya está en tu lista')).toBeInTheDocument()
    expect(within(panel).getByText('En 3er año · Chicas')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Agregar a Lucía Ramírez como visitante' })).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Agregar a Lucía Fernández como visitante' }))
    expect(mock.agregarVisitante).toHaveBeenCalledWith({ grupoId: 'g2', fecha: FECHA, turnoId: 't9', personaId: 'd1' })
    await waitFor(() => expect(exito).toHaveBeenCalledWith('Agregaste a Lucía Fernández como visitante'))
    expect(refresh).toHaveBeenCalled()
  })

  it('creates a new visitor; on possible duplicates shows them and "Es otra persona" registers anyway', async () => {
    mockGrupos.buscarPersonas.mockResolvedValue({ ok: true, data: [] })
    mock.crearVisitante
      .mockResolvedValueOnce({ ok: false, message: 'Encontramos personas parecidas. Revisa si es alguna de ellas.', codigo: 'posibles_duplicados' })
      .mockResolvedValueOnce({ ok: true, data: { personaId: 'nuevo' } })
    mock.buscarCoincidencias.mockResolvedValue({
      ok: true,
      data: [{ personaId: 'd9', nombre: 'Valentina Rangel', grupoId: null, grupo: null, enEsteGrupo: false }],
    })
    render(<ListaLiderClient datos={datos()} />)
    await user.click(screen.getAllByRole('button', { name: 'Agregar visitante' })[0])
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Búscala primero'), 'valentina rangel')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear nueva' }))

    const panel = screen.getByRole('dialog')
    const [nombre] = within(panel).getAllByLabelText('Nombre')
    expect(nombre).toHaveValue('Valentina')
    expect(within(panel).getAllByLabelText('Apellido')[0]).toHaveValue('Rangel')
    expect(within(panel).getByLabelText('Año escolar')).toHaveValue('2')
    expect(within(within(panel).getAllByRole('group', { name: 'Sexo' })[0]).getByRole('button', { name: 'Femenino' })).toHaveAttribute('aria-pressed', 'true')

    // Without a phone the form does not go to the server.
    await user.click(within(panel).getByRole('button', { name: 'Registrar visitante' }))
    expect(within(panel).getByText('Escribe el teléfono.')).toBeInTheDocument()
    expect(mock.crearVisitante).not.toHaveBeenCalled()

    await user.type(within(panel).getAllByLabelText('Teléfono')[0], '0412 555 0183')
    await user.type(within(panel).getAllByLabelText('Nombre')[1], 'José')
    await user.type(within(panel).getAllByLabelText('Teléfono')[1], '0412 555 0118')
    await user.click(within(within(panel).getAllByRole('group', { name: 'Sexo' })[1]).getByRole('button', { name: 'Masculino' }))
    await user.click(within(panel).getByRole('button', { name: 'Registrar visitante' }))

    const enviados = {
      nombre: 'Valentina',
      apellido: 'Rangel',
      genero: 'Femenino',
      telefono: '0412 555 0183',
      anio: 2,
      representante: { nombre: 'José', telefono: '0412 555 0118', genero: 'Masculino', tipo: 'padre' },
    }
    expect(mock.crearVisitante).toHaveBeenNthCalledWith(1, { grupoId: 'g2', fecha: FECHA, turnoId: 't9', datos: enviados })
    expect(mock.buscarCoincidencias).toHaveBeenCalledWith({ grupoId: 'g2', nombre: 'Valentina', apellido: 'Rangel', telefono: '0412 555 0183' })
    expect(await within(screen.getByRole('dialog')).findByText('¿Es alguna de ellas?')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('Valentina Rangel')).toBeInTheDocument()

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Es otra persona' }))
    expect(mock.crearVisitante).toHaveBeenNthCalledWith(2, {
      grupoId: 'g2',
      fecha: FECHA,
      turnoId: 't9',
      datos: { ...enviados, ignorar_coincidencias: true },
    })
    await waitFor(() => expect(exito).toHaveBeenCalledWith('Registraste a Valentina Rangel como visitante'))
  })

  it('a cédula already registered points back to the search', async () => {
    mockGrupos.buscarPersonas.mockResolvedValue({ ok: true, data: [] })
    mock.crearVisitante.mockResolvedValue({
      ok: false,
      message: 'Ya hay alguien con esa cédula. Búscalo en el paso anterior y agrégalo desde ahí.',
      codigo: 'cedula_existente',
    })
    render(<ListaLiderClient datos={datos()} />)
    await user.click(screen.getAllByRole('button', { name: 'Agregar visitante' })[0])
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Búscala primero'), 'V-31455102')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear nueva' }))
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByLabelText('Cédula (opcional)')).toHaveValue('V-31455102')
    await user.type(within(panel).getAllByLabelText('Nombre')[0], 'Ana')
    await user.type(within(panel).getAllByLabelText('Apellido')[0], 'Pérez')
    await user.type(within(panel).getAllByLabelText('Teléfono')[0], '0414 555 0100')
    await user.click(within(panel).getByRole('button', { name: 'Registrar visitante' }))
    expect(await within(panel).findByText('Ya hay alguien con esa cédula. Búscalo en el paso anterior y agrégalo desde ahí.')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Buscar por esa cédula' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('Búscala primero')).toHaveValue('V-31455102')
  })
})
