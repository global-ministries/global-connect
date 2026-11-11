/**
 * @jest-environment jsdom
 *
 * R3c (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the v2 /talleres
 * catálogo (artboards design/talleres-interior/18 and 19): hero with the
 * summary, route tabs only where the viewer may go, attention metrics as
 * filters, dirección scope cards, one drawer per taller with quick actions
 * that follow the taller page's gates, Próximo Paso managed on its own page,
 * «Nuevo taller» only with `puedeCrear`, «Mis grupos» for a líder, URL state
 * with replace, and neutral Spanish (no voseo).
 *
 * The page test proves which props each role gets; this one proves what the
 * screen does with them. jsdom has no matchMedia, so DetalleResponsivo
 * renders the desktop side panel.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const createTallerAbstractMock = jest.fn()
const refreshMock = jest.fn()
const exitoMock = jest.fn()

jest.mock('@/app/(auth)/admin/talleres/abstracto/nuevo/actions', () => ({
  createTallerAbstract: (...a: unknown[]) => createTallerAbstractMock(...a),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/talleres',
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

import {
  CatalogoTalleresClient,
  type CatalogoTalleresClientProps,
} from '@/components/talleres/catalogo-talleres-client'
import type { CatalogoEdicionPanel, CatalogoTallerPanel, MiGrupoResumen } from '@/lib/platform/talleres/catalogo'

function edicion(o: Partial<CatalogoEdicionPanel> = {}): CatalogoEdicionPanel {
  return {
    id: 'e-1',
    nombre_snapshot: 'Edición nov 2026',
    tipo: 'individual',
    estado: 'abierto',
    total_inscripciones: 0,
    temporada_id: null,
    fecha_inicio: '2026-11-24',
    fecha_fin: '2026-12-29',
    pendientes: 0,
    aprobados: 0,
    ocupados: 0,
    cierre_inscripcion: '2026-11-20',
    ...o,
  }
}

const MUJER: CatalogoTallerPanel = {
  id: 't-m',
  slug: 'mujer-de-hoy',
  nombre: 'Mujer de Hoy',
  estado: 'active',
  dream_team_equipo_id: 'eq-1',
  minimo_inscritos: 10,
  ediciones: [
    edicion({ id: 'e-m', pendientes: 5, aprobados: 9, ocupados: 14 }),
    edicion({ id: 'e-m-old', nombre_snapshot: 'Edición jul 2026', estado: 'cerrado', ocupados: 22 }),
  ],
}
const PAREJAS: CatalogoTallerPanel = {
  id: 't-p',
  slug: 'parejas',
  nombre: 'Parejas',
  estado: 'active',
  dream_team_equipo_id: 'eq-2',
  minimo_inscritos: null,
  ediciones: [edicion({ id: 'e-p', tipo: 'pareja', nombre_snapshot: 'Edición ene 2027', aprobados: 6, ocupados: 6 })],
}
const PP: CatalogoTallerPanel = {
  id: 't-pp',
  slug: 'proximo-paso',
  nombre: 'Próximo Paso',
  estado: 'active',
  dream_team_equipo_id: 'eq-3',
  minimo_inscritos: null,
  ediciones: [edicion({ id: 'e-pp', nombre_snapshot: 'Domingo 15 nov', aprobados: 40, ocupados: 40 })],
}

const GRUPOS = {
  'e-m': { cupo: 30, gruposSinFacilitador: 0 },
  'e-p': { cupo: 15, gruposSinFacilitador: 2 },
  'e-pp': { cupo: 40, gruposSinFacilitador: 0 },
}

const MI_GRUPO: MiGrupoResumen = {
  id: 'g-1',
  nombre: 'Grupo A',
  estado: 'activo',
  tallerNombre: 'Matrimonio sobre la Roca',
  edicionNombre: 'Septiembre 2026',
  proximaClase: '2026-11-24',
}

function props(o: Partial<CatalogoTalleresClientProps> = {}): CatalogoTalleresClientProps {
  return {
    catalogo: [MUJER, PAREJAS, PP],
    grupos: GRUPOS,
    misGrupos: [],
    puedeCrear: false,
    misTalleres: [{ id: 't-m', slug: 'mujer-de-hoy', nombre: 'Mujer de Hoy', puedeAbrirEdicion: true }],
    opciones: { vincular: [{ id: 'eq-9', ruta: 'Conexión › Talleres' }], crearBajo: [] },
    pestanas: { pendientes: true, temporadas: true, reportes: true },
    ...o,
  } as CatalogoTalleresClientProps
}

function metrica(nombre: RegExp): HTMLElement {
  return within(screen.getByRole('group', { name: 'Lo que necesita atención' })).getByRole('button', { name: nombre })
}

function filasDeLista(): string[] {
  const tabla = screen.getByRole('table', { name: 'Talleres' })
  return within(tabla)
    .getAllByRole('button', { name: /^Abrir / })
    .map((b) => b.getAttribute('aria-label')?.replace('Abrir ', '') ?? '')
}

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/talleres')
})

describe('CatalogoTalleresClient — hero, tabs and header actions', () => {
  it('summarises talleres, ediciones abiertas and por aprobar, and links the tabs the viewer may open', () => {
    render(<CatalogoTalleresClient {...props()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Talleres' })).toBeInTheDocument()
    expect(screen.getAllByText(/ediciones con inscripción abierta/)[0]?.closest('p')).toHaveTextContent(
      '3 talleres · 3 ediciones con inscripción abierta · 5 inscripciones por aprobar',
    )
    const tabs = screen.getByRole('navigation', { name: 'Secciones de Talleres' })
    expect(within(tabs).getByRole('link', { name: 'Talleres' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Pendientes' })).toHaveAttribute('href', '/talleres/pendientes')
    expect(within(tabs).getByRole('link', { name: 'Temporadas' })).toHaveAttribute('href', '/talleres/temporadas')
    expect(within(tabs).getByRole('link', { name: 'Reportes' })).toHaveAttribute('href', '/talleres/reportes')
  })

  it('hides the tabs the viewer cannot open', () => {
    render(<CatalogoTalleresClient {...props({ pestanas: { pendientes: false, temporadas: false, reportes: true } })} />)
    const tabs = screen.getByRole('navigation', { name: 'Secciones de Talleres' })
    expect(within(tabs).queryByRole('link', { name: 'Pendientes' })).not.toBeInTheDocument()
    expect(within(tabs).queryByRole('link', { name: 'Temporadas' })).not.toBeInTheDocument()
    expect(within(tabs).getByRole('link', { name: 'Reportes' })).toBeInTheDocument()
  })

  it('always links Explorar, and offers «Nuevo taller» only with puedeCrear', () => {
    const { unmount } = render(<CatalogoTalleresClient {...props()} />)
    expect(screen.getAllByRole('link', { name: /Explorar/ })[0]).toHaveAttribute('href', '/talleres/explorar')
    expect(screen.queryByRole('button', { name: 'Nuevo taller' })).not.toBeInTheDocument()
    unmount()
    render(<CatalogoTalleresClient {...props({ puedeCrear: true })} />)
    expect(screen.getAllByRole('button', { name: 'Nuevo taller' }).length).toBeGreaterThan(0)
  })
})

describe('CatalogoTalleresClient — attention metrics as filters', () => {
  it('counts Por aprobar, Ediciones abiertas, Bajo el mínimo and Sin facilitador from the loaded data', () => {
    render(<CatalogoTalleresClient {...props()} />)
    expect(metrica(/Por aprobar/)).toHaveTextContent('5')
    expect(metrica(/Ediciones abiertas/)).toHaveTextContent('3')
    expect(metrica(/Bajo el mínimo/)).toHaveTextContent('1')
    expect(metrica(/Sin facilitador/)).toHaveTextContent('2')
  })

  it('leaves Sin facilitador out when the grupos could not be read', () => {
    render(<CatalogoTalleresClient {...props({ grupos: null })} />)
    const grupo = screen.getByRole('group', { name: 'Lo que necesita atención' })
    expect(within(grupo).queryByRole('button', { name: /Sin facilitador/ })).not.toBeInTheDocument()
    expect(within(grupo).getAllByRole('button')).toHaveLength(3)
  })

  it('a metric filters the list, shows a chip and writes the URL; a second press clears it', async () => {
    render(<CatalogoTalleresClient {...props()} />)
    fireEvent.click(metrica(/Sin facilitador/))
    expect(metrica(/Sin facilitador/)).toHaveAttribute('aria-pressed', 'true')
    expect(filasDeLista()).toEqual(['Parejas'])
    expect(screen.getByRole('button', { name: 'Quitar Sin facilitador' })).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe('?atencion=sin-facilitador'))

    fireEvent.click(metrica(/Sin facilitador/))
    expect(filasDeLista()).toHaveLength(3)
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('shows no metrics when the viewer sees no edición at all', () => {
    render(
      <CatalogoTalleresClient
        {...props({ catalogo: [{ ...MUJER, ediciones: [] }], misTalleres: [], pestanas: { pendientes: false, temporadas: false, reportes: false } })}
      />,
    )
    expect(screen.queryByRole('group', { name: 'Lo que necesita atención' })).not.toBeInTheDocument()
    expect(filasDeLista()).toEqual(['Mujer de Hoy'])
  })
})

describe('CatalogoTalleresClient — dirección and list', () => {
  it('scope cards split Grupos de Corto Plazo (Conexión) and Próximo Paso (DPS) and filter the list', () => {
    render(<CatalogoTalleresClient {...props()} />)
    const alcance = screen.getByRole('group', { name: 'Filtrar por dirección' })
    expect(within(alcance).getByRole('button', { name: /Grupos de Corto Plazo/ })).toBeInTheDocument()
    fireEvent.click(within(alcance).getByRole('button', { name: /Próximo Paso/ }))
    expect(filasDeLista()).toEqual(['Próximo Paso'])
  })

  it('orders what needs attention first and keeps Próximo Paso last', () => {
    render(<CatalogoTalleresClient {...props()} />)
    expect(filasDeLista()).toEqual(['Mujer de Hoy', 'Parejas', 'Próximo Paso'])
  })

  it('shows próxima edición, inscritos de cupo and estado of each row', () => {
    render(<CatalogoTalleresClient {...props()} />)
    const tabla = screen.getByRole('table', { name: 'Talleres' })
    expect(within(tabla).getAllByText('Inscripción abierta').length).toBeGreaterThan(0)
    expect(within(tabla).getAllByText('Cupo lleno').length).toBeGreaterThan(0)
    expect(within(tabla).getByText('Edición nov 2026 · empieza el mar 24 nov · cierra el vie 20 nov')).toBeInTheDocument()
    expect(within(tabla).getByText('Edición ene 2027 · 6 de 15 parejas')).toBeInTheDocument()
  })

  it('the Próximo Paso row says «Se gestiona en Próximo Paso» and links /proximo-paso', () => {
    render(<CatalogoTalleresClient {...props()} />)
    const tabla = screen.getByRole('table', { name: 'Talleres' })
    expect(within(tabla).getByRole('link', { name: 'Se gestiona en Próximo Paso' })).toHaveAttribute('href', '/proximo-paso')
  })

  it('searches by name ignoring accents', () => {
    render(<CatalogoTalleresClient {...props()} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar talleres' }), { target: { value: 'proximo' } })
    expect(filasDeLista()).toEqual(['Próximo Paso'])
  })

  it('reads the initial filters from the URL and offers «Limpiar todo» when nothing matches', () => {
    render(<CatalogoTalleresClient {...props({ filtrosIniciales: { atencion: 'pendientes', direccion: 'dps', q: '' } })} />)
    expect(screen.getByText('Ningún taller con estos filtros')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar todo' })[0]!)
    expect(filasDeLista()).toHaveLength(3)
  })
})

describe('CatalogoTalleresClient — drawer per taller', () => {
  it('opens the taller drawer with quick actions to the existing routes when the viewer can edit it', async () => {
    render(<CatalogoTalleresClient {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Mujer de Hoy' }))
    const panel = await screen.findByRole('dialog')
    const acciones = within(panel).getByRole('navigation', { name: 'Acciones de Mujer de Hoy' })
    expect(within(acciones).getByRole('link', { name: 'Abrir edición' })).toHaveAttribute('href', '/talleres/mujer-de-hoy#ediciones')
    expect(within(acciones).getByRole('link', { name: 'Compartir' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/compartir')
    expect(within(acciones).getByRole('link', { name: 'Avisos' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/avisos')
    expect(within(acciones).getByRole('link', { name: 'Configuración' })).toHaveAttribute(
      'href',
      '/talleres/mujer-de-hoy/configuracion',
    )
    expect(within(panel).getByText(/Falta/)).toHaveTextContent('Falta 1 aprobado para el mínimo.')
    expect(within(panel).getByRole('link', { name: 'Ver inscripciones' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/e-m')
    expect(within(panel).getByRole('link', { name: 'Aprobar 5' })).toHaveAttribute('href', '/talleres/pendientes')
    expect(within(panel).getByRole('link', { name: /Edición jul 2026/ })).toHaveAttribute('href', '/talleres/mujer-de-hoy/e-m-old')
    expect(within(panel).getByRole('link', { name: /Ver taller/ })).toHaveAttribute('href', '/talleres/mujer-de-hoy')
    await waitFor(() => expect(window.location.search).toBe('?taller=mujer-de-hoy'))
  })

  it('shows no quick actions for a taller the viewer cannot edit, and no «Aprobar» without Pendientes', async () => {
    render(<CatalogoTalleresClient {...props({ pestanas: { pendientes: false, temporadas: false, reportes: false } })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Parejas' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).queryByRole('navigation', { name: /Acciones de/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('link', { name: /Aprobar/ })).not.toBeInTheDocument()
    expect(within(panel).getByText(/grupos sin facilitador/)).toBeInTheDocument()
  })

  it('opens Abrir edición only with abrir_edicion even when the viewer can edit', async () => {
    render(
      <CatalogoTalleresClient
        {...props({ misTalleres: [{ id: 't-m', slug: 'mujer-de-hoy', nombre: 'Mujer de Hoy', puedeAbrirEdicion: false }] })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Mujer de Hoy' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).queryByRole('link', { name: 'Abrir edición' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Compartir' })).toBeInTheDocument()
  })

  it('Próximo Paso: the drawer links /proximo-paso and offers no taller actions', async () => {
    render(<CatalogoTalleresClient {...props({ tallerInicial: 'proximo-paso' })} />)
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('link', { name: 'Abrir en Próximo Paso' })).toHaveAttribute('href', '/proximo-paso')
    expect(within(panel).getByRole('link', { name: /Ir a Próximo Paso/ })).toHaveAttribute('href', '/proximo-paso')
    expect(within(panel).queryByRole('link', { name: 'Ver inscripciones' })).not.toBeInTheDocument()
    expect(within(panel).getByText('Próximo Paso tiene su propia página.')).toBeInTheDocument()
  })
})

describe('CatalogoTalleresClient — Nuevo taller', () => {
  it('validates in neutral Spanish and creates through createTallerAbstract', async () => {
    createTallerAbstractMock.mockResolvedValue({ ok: true, tallerId: 't-new', slug: 'nuevo' })
    render(<CatalogoTalleresClient {...props({ puedeCrear: true })} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuevo taller' })[0]!)
    const panel = await screen.findByRole('dialog')
    await waitFor(() => expect(window.location.search).toBe('?nuevo=1'))

    fireEvent.click(within(panel).getByRole('button', { name: 'Crear taller' }))
    expect(await within(panel).findByText('El nombre debe tener al menos 2 caracteres.')).toBeInTheDocument()
    expect(within(panel).getByText('Elige un nodo del árbol.')).toBeInTheDocument()
    expect(createTallerAbstractMock).not.toHaveBeenCalled()

    fireEvent.change(within(panel).getByLabelText('Nombre *'), { target: { value: 'Mujer de Hoy II' } })
    fireEvent.change(within(panel).getByLabelText('Equipo *'), { target: { value: 'eq-9' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear taller' }))
    await waitFor(() =>
      expect(createTallerAbstractMock).toHaveBeenCalledWith({
        nombre: 'Mujer de Hoy II',
        descripcion: null,
        modalidad_default: 'periodo_general',
        regimen: 'temporada',
        slug: undefined,
        equipoId: 'eq-9',
        parentEquipoId: undefined,
      }),
    )
    await waitFor(() => expect(exitoMock).toHaveBeenCalledWith('Taller creado.'))
    expect(refreshMock).toHaveBeenCalled()
  })

  it('ignores ?nuevo=1 without puedeCrear', () => {
    render(<CatalogoTalleresClient {...props({ nuevoInicial: true })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('CatalogoTalleresClient — Mis grupos, empty state and language', () => {
  it('shows «Mis grupos» (the nav anchor mis-grupos-heading) with taller, edición and próxima clase', () => {
    render(<CatalogoTalleresClient {...props({ misGrupos: [MI_GRUPO] })} />)
    const titulo = screen.getByRole('heading', { name: 'Mis grupos' })
    expect(titulo).toHaveAttribute('id', 'mis-grupos-heading')
    const seccion = titulo.closest('section') as HTMLElement
    expect(within(seccion).getByText('Grupo A')).toBeInTheDocument()
    expect(within(seccion).getByText('Matrimonio sobre la Roca · Septiembre 2026')).toBeInTheDocument()
    // Two copies: one line under the name on phones, one trailing column from md (CSS shows one).
    expect(within(seccion).getAllByText('Próxima clase: mar 24 nov')).toHaveLength(2)
  })

  it('omits «Mis grupos» when the viewer leads no grupo', () => {
    render(<CatalogoTalleresClient {...props()} />)
    expect(screen.queryByRole('heading', { name: 'Mis grupos' })).not.toBeInTheDocument()
  })

  it('a member with nothing to see gets the empty state pointing at Explorar', () => {
    render(
      <CatalogoTalleresClient
        {...props({ catalogo: [], grupos: {}, misTalleres: [], pestanas: { pendientes: false, temporadas: false, reportes: false } })}
      />,
    )
    expect(screen.getByText('Aún no hay talleres')).toBeInTheDocument()
    expect(screen.getByText('Explora los talleres abiertos para inscribirte.')).toBeInTheDocument()
  })

  it('uses neutral Spanish with «tú», never voseo', async () => {
    const { container } = render(<CatalogoTalleresClient {...props({ puedeCrear: true, misGrupos: [MI_GRUPO], tallerInicial: 'mujer-de-hoy' })} />)
    await screen.findByRole('dialog')
    const texto = `${container.textContent ?? ''} ${document.body.textContent ?? ''}`
    expect(texto).not.toMatch(/Tocá|tenés|Explorá|Elegí|Necesitás|para vos|dejás|acá\b|inscripto/)
  })
})
