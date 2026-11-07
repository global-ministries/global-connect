/**
 * The publish review /grupos-vida/planificar/publicar (T8a of
 * odd/tasks/planner-gdv.md; artboard 04; S6–S8, S12, S14, S16, S19, S24):
 * 1 the blockers by kind with links back to the board's alerts, 2 the
 * warnings (allowed), 3 each segment with its directores de etapa and
 * "Terminado por X · fecha" or "Sin terminar · N bloqueos", 4 what
 * publishing does (destination active, the origin of the same cohort closed
 * with its groups archived, other active seasons untouched, attendance
 * kept). "Publicar y activar <temporada>" is disabled with the reason until
 * planner_estado_publicacion says it can; a confirm dialog restates the
 * effects; then planner_publicar runs and the success or the error shows.
 * Unsaved board changes of this user are not included and the page says so.
 * Only admin, pastor and director general open it.
 */
import React from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PublicarTemporada, type PublicarTemporadaProps } from '@/components/grupos-vida/planner/publicar-temporada'
import { claveBorrador, serializarBorrador } from '@/lib/platform/grupos-vida/planner/borrador'
import type { EstadoPublicacion, SegmentoPublicacion } from '@/lib/platform/grupos-vida/planner'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const publicarTemporadaAction = jest.fn()
jest.mock('@/app/(auth)/grupos-vida/planificar/actions', () => ({
  publicarTemporadaAction: (...a: unknown[]) => publicarTemporadaAction(...a),
}))

const TEMPORADA = {
  id: 't-2026-ii',
  nombre: '2026-II',
  fecha_inicio: '2026-10-12',
  fecha_fin: null,
  estado: 'planificacion',
  activa: false,
  cohorte: 'II' as const,
  origen_id: 't-2025-ii',
  origen_nombre: '2025 - II',
}

const MATRIMONIOS: SegmentoPublicacion = {
  id: 'seg-mat',
  nombre: 'Matrimonios',
  grupos: 18,
  bloqueos: 0,
  terminado: true,
  marcado_por: { id: 'u-hector', nombre: 'Héctor Linárez' },
  marcado_en: '2026-11-07T13:40:00Z',
}
const MUJERES: SegmentoPublicacion = { id: 'seg-muj', nombre: 'Mujeres +36', grupos: 9, bloqueos: 8, terminado: false, marcado_por: null, marcado_en: null }

const CERO = { total: 0, sin_lider: 0, sin_director: 0, sin_localidad: 0, persona_en_dos_grupos: 0 }

const estado = (parcial: Partial<EstadoPublicacion> = {}): EstadoPublicacion => ({
  temporada: { id: TEMPORADA.id, nombre: '2026-II', estado: 'planificacion', activa: false, cohorte: 'II' },
  bloqueos: { total: 20, sin_lider: 1, sin_director: 0, sin_localidad: 19, persona_en_dos_grupos: 0 },
  grupos: 27,
  segmentos: [MATRIMONIOS, MUJERES],
  segmentos_con_grupos: 2,
  segmentos_terminados: 1,
  faltan_segmentos: 1,
  rol_puede_publicar: true,
  puede_publicar: false,
  origen: { id: 't-2025-ii', nombre: '2025 - II', estado: 'finalizada', activa: false, grupos_a_archivar: 19 },
  otras_activas: [{ id: 't-2026-i', nombre: '2026-I', cohorte: 'I' }],
  ...parcial,
})

const LISTO = estado({
  bloqueos: CERO,
  segmentos: [MATRIMONIOS, { ...MUJERES, bloqueos: 0, terminado: true, marcado_por: { id: 'u-gladys', nombre: 'Gladys Suárez' }, marcado_en: '2026-11-07T14:15:00Z' }],
  segmentos_terminados: 2,
  faltan_segmentos: 0,
  puede_publicar: true,
})

const props = (parcial: Partial<PublicarTemporadaProps> = {}): PublicarTemporadaProps => ({
  temporada: TEMPORADA,
  usuarioId: 'u-dg',
  estado: estado(),
  bloqueos: [
    ...Array.from({ length: 19 }, (_, i) => ({
      tipo: 'sin_localidad' as const,
      segmento_id: 'seg-mat',
      grupo_id: `g-${i}`,
      grupo_nombre: `Grupo #${i + 1}`,
      usuario_id: null,
      detalle: '',
    })),
    { tipo: 'sin_lider', segmento_id: 'seg-muj', grupo_id: 'g-valientes', grupo_nombre: 'Mujeres Valientes', usuario_id: null, detalle: '' },
  ],
  segmentos: [
    {
      id: 'seg-mat',
      nombre: 'Matrimonios',
      directores: [
        { segmento_lider_id: 'sl1', usuario_id: 'u-hector', nombre: 'Héctor', apellido: 'Linárez' },
        { segmento_lider_id: 'sl2', usuario_id: 'u-nancy', nombre: 'Nancy', apellido: 'Linárez' },
      ],
    },
    { id: 'seg-muj', nombre: 'Mujeres +36', directores: [{ segmento_lider_id: 'sl3', usuario_id: 'u-gladys', nombre: 'Gladys', apellido: 'Suárez' }] },
  ],
  avisos: [
    { id: 'sin_ubicar', titulo: '24 sin ubicar de 2025 - II', cantidad: 24 },
    { id: 'repite_lider', titulo: '6 repiten líder', cantidad: 6 },
  ],
  totalAvisos: 30,
  ...parcial,
})

/** Renders inside act: the page header is lazy (PaginaSistema) and resolves after the first render. */
async function pintar(ui: React.ReactElement) {
  await act(async () => {
    render(ui)
  })
}

const seccion = (nombre: RegExp | string): HTMLElement => screen.getByRole('region', { name: nombre })

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
})

describe('publish review sections', () => {
  it('lists the blockers by kind, with the groups and a link back to the alerts (1)', async () => {
    await pintar(<PublicarTemporada {...props()} />)

    const bloqueos = seccion('1. Lo que bloquea la publicación')
    const localidad = within(bloqueos).getByRole('listitem', { name: '19 grupos sin localidad' })
    expect(within(localidad).getByRole('link', { name: 'Revisar en el tablero' })).toHaveAttribute('href', '/grupos-vida/planificar?temporada=t-2026-ii&alertas=1')
    expect(within(bloqueos).getByRole('listitem', { name: '1 grupo sin Líder' })).toHaveTextContent('Mujeres Valientes')
    const director = within(bloqueos).getByRole('listitem', { name: '0 grupos sin director de etapa' })
    expect(director).toHaveTextContent('Todos los grupos tienen director de etapa')
    expect(within(director).queryByRole('link')).not.toBeInTheDocument()
    expect(within(bloqueos).getByRole('listitem', { name: '0 personas en dos grupos de 2026-II' })).toHaveTextContent('Nadie está en dos grupos')
  })

  it('summarizes the warnings, which do not block (2)', async () => {
    await pintar(<PublicarTemporada {...props()} />)

    const avisos = seccion('2. Avisos')
    expect(avisos).toHaveTextContent('30 avisos · puedes publicar con ellos')
    expect(avisos).toHaveTextContent('24 sin ubicar de 2025 - II')
    expect(avisos).toHaveTextContent('6 repiten líder')
  })

  it('shows each segment with its directors and who marked it finished, or its blockers (3, S14)', async () => {
    await pintar(<PublicarTemporada {...props()} />)

    const segmentos = seccion('3. Segmentos y directores de etapa')
    const matrimonios = within(segmentos).getByRole('listitem', { name: 'Matrimonios' })
    expect(matrimonios).toHaveTextContent('18 grupos')
    expect(matrimonios).toHaveTextContent('Héctor Linárez y Nancy Linárez')
    expect(matrimonios).toHaveTextContent(/Terminado por Héctor Linárez · 7 nov, 9:40\s?a\.\s?m\./)
    const mujeres = within(segmentos).getByRole('listitem', { name: 'Mujeres +36' })
    expect(mujeres).toHaveTextContent('Sin terminar · 8 bloqueos')
    expect(mujeres).toHaveTextContent('Gladys Suárez')
  })

  it('says what publishing does: destination active, origin of the cohort archived, other seasons untouched (4, S19)', async () => {
    await pintar(<PublicarTemporada {...props()} />)

    const efectos = seccion('4. Qué pasa al publicar')
    expect(efectos).toHaveTextContent('2026-II pasa a activa.')
    expect(efectos).toHaveTextContent('Sus 27 grupos quedan activos')
    expect(efectos).toHaveTextContent('2025 - II se cierra.')
    expect(efectos).toHaveTextContent('Sus 19 grupos activos se archivan')
    expect(efectos).toHaveTextContent('2026-I sigue activa: publicar no la toca.')
    expect(efectos).toHaveTextContent('La asistencia se conserva.')
  })

  it('says there is no season to close when the cohort has no origin', async () => {
    await pintar(<PublicarTemporada {...props({ estado: estado({ origen: null, otras_activas: [] }) })} />)

    const efectos = seccion('4. Qué pasa al publicar')
    expect(efectos).toHaveTextContent('No hay otra temporada -II que cerrar.')
    expect(efectos).not.toHaveTextContent('sigue activa')
  })
})

describe('publish button', () => {
  it('stays disabled with the reason while there are blockers or unfinished segments', async () => {
    await pintar(<PublicarTemporada {...props()} />)

    const boton = screen.getByRole('button', { name: 'Publicar y activar 2026-II' })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAccessibleDescription('No puedes publicar todavía: quedan 20 bloqueos y falta 1 segmento por terminar (Mujeres +36).')
  })

  it.each([
    [{ rol_puede_publicar: false, puede_publicar: false }, 'Solo el director general, un pastor o un administrador pueden publicar.'],
    [{ temporada: { id: 't-2026-ii', nombre: '2026-II', estado: 'activa', activa: true, cohorte: 'II' as const }, puede_publicar: false }, '2026-II ya no está en planificación.'],
    [{ grupos: 0, puede_publicar: false }, 'No puedes publicar todavía: 2026-II no tiene grupos.'],
  ])('names the reason %#', async (parcial, motivo) => {
    await pintar(<PublicarTemporada {...props({ estado: { ...LISTO, ...parcial } })} />)

    expect(screen.getByRole('button', { name: 'Publicar y activar 2026-II' })).toHaveAccessibleDescription(motivo)
  })

  it('confirms with the effects, publishes and shows the success with links', async () => {
    publicarTemporadaAction.mockResolvedValue({
      ok: true,
      datos: { temporadaId: 't-2026-ii', nombre: '2026-II', grupos: 27, gruposActivados: 9, origenNombre: '2025 - II', gruposArchivados: 19 },
    })
    await pintar(<PublicarTemporada {...props({ estado: LISTO, bloqueos: [] })} />)

    const boton = screen.getByRole('button', { name: 'Publicar y activar 2026-II' })
    expect(boton).toBeEnabled()
    expect(boton).toHaveAccessibleDescription('Sin bloqueos. Se publica con 30 avisos.')
    await userEvent.click(boton)

    const dialogo = screen.getByRole('alertdialog', { name: '¿Publicar y activar 2026-II?' })
    expect(dialogo).toHaveTextContent('2026-II queda activa con sus 27 grupos. 2025 - II se cierra y sus 19 grupos activos se archivan; 2026-I no se toca. La asistencia se conserva. Esto no se deshace desde «Historial».')
    expect(publicarTemporadaAction).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Publicar y activar' }))

    expect(publicarTemporadaAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii' })
    const exito = await screen.findByRole('status')
    expect(exito).toHaveTextContent('2026-II está activa · 27 grupos activados · 2025 - II archivada con 19 grupos')
    expect(screen.getByRole('link', { name: 'Ir a los grupos' })).toHaveAttribute('href', '/grupos-vida')
    expect(screen.getByRole('link', { name: 'Ver temporadas' })).toHaveAttribute('href', '/grupos-vida/temporadas')
    expect(screen.queryByRole('button', { name: 'Publicar y activar 2026-II' })).not.toBeInTheDocument()
  })

  it('cancels without publishing', async () => {
    await pintar(<PublicarTemporada {...props({ estado: LISTO, bloqueos: [] })} />)

    await userEvent.click(screen.getByRole('button', { name: 'Publicar y activar 2026-II' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))

    expect(publicarTemporadaAction).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows the refusal and keeps the review', async () => {
    publicarTemporadaAction.mockResolvedValue({ ok: false, codigo: '22023', mensaje: 'No se puede publicar: falta 1 segmento por terminar (Mujeres +36).' })
    await pintar(<PublicarTemporada {...props({ estado: LISTO, bloqueos: [] })} />)

    await userEvent.click(screen.getByRole('button', { name: 'Publicar y activar 2026-II' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Publicar y activar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede publicar: falta 1 segmento por terminar (Mujeres +36).')
    expect(screen.getByRole('button', { name: 'Publicar y activar 2026-II' })).toBeEnabled()
  })

  it('says the connection failed when the action throws', async () => {
    publicarTemporadaAction.mockRejectedValue(new Error('network'))
    await pintar(<PublicarTemporada {...props({ estado: LISTO, bloqueos: [] })} />)

    await userEvent.click(screen.getByRole('button', { name: 'Publicar y activar 2026-II' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Publicar y activar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo publicar. Revisa tu conexión e inténtalo de nuevo.')
  })
})

describe('unsaved board changes (S24)', () => {
  it('warns that this user’s unsaved changes are not included until saved', async () => {
    const borrador = {
      siguiente: 2,
      cambios: [{ id: 'c1', descripcion: 'Mover a Ana al banco', segmentos: ['seg-mat'], cambio: { tipo: 'mover' as const, usuarios: ['u-ana'], grupo: null, rol: null } }],
    }
    window.localStorage.setItem(claveBorrador('u-dg', 't-2026-ii'), serializarBorrador(borrador, { usuarioId: 'u-dg', temporadaId: 't-2026-ii' }))
    await pintar(<PublicarTemporada {...props()} />)

    const nota = await screen.findByText(/Tienes 1 cambio sin guardar en el tablero/)
    expect(nota).toHaveTextContent('No se incluye en la publicación hasta que lo guardes.')
    expect(screen.getByRole('link', { name: 'Volver al tablero para guardarlo' })).toHaveAttribute('href', '/grupos-vida/planificar?temporada=t-2026-ii')
  })

  it('says nothing without a draft', async () => {
    await pintar(<PublicarTemporada {...props()} />)

    expect(screen.queryByText(/sin guardar en el tablero/)).not.toBeInTheDocument()
  })
})

// ─── The page (RSC) ───

const redirect = jest.fn((ruta: string) => {
  throw new Error(`redirect:${ruta}`)
})
jest.mock('next/navigation', () => ({ redirect: (ruta: string) => redirect(ruta), useRouter: () => ({ refresh: jest.fn() }) }))
const getUserWithRoles = jest.fn()
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (c: unknown) => getUserWithRoles(c) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: jest.fn(), from: jest.fn() }) }))
const cargarPlanner = jest.fn()
jest.mock('@/lib/platform/grupos-vida/planner/datos', () => ({
  ...jest.requireActual('@/lib/platform/grupos-vida/planner/datos'),
  cargarPlanner: (...a: unknown[]) => cargarPlanner(...a),
}))

describe('publish page', () => {
  const pagina = async (roles: string[], temporada = 't-2026-ii') => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles })
    const { default: PublicarTemporadaPage } = await import('@/app/(auth)/grupos-vida/planificar/publicar/page')
    return PublicarTemporadaPage({ searchParams: Promise.resolve({ temporada }) })
  }

  it.each([['director-etapa'], ['lider'], ['miembro']])('sends a %s to the dashboard without reading anything', async (rol) => {
    await expect(pagina([rol])).rejects.toThrow('redirect:/dashboard')
    expect(cargarPlanner).not.toHaveBeenCalled()
  })

  it('sends someone without a session to the login', async () => {
    getUserWithRoles.mockResolvedValue(null)
    const { default: PublicarTemporadaPage } = await import('@/app/(auth)/grupos-vida/planificar/publicar/page')
    await expect(PublicarTemporadaPage({})).rejects.toThrow('redirect:/login')
  })

  it('opens the review of the requested season for the director general', async () => {
    cargarPlanner.mockResolvedValue({
      tipo: 'listo',
      datos: {
        capacidades: {
          usuario_id: 'u-dg',
          ve_todos_los_segmentos: true,
          puede_publicar: true,
          puede_crear_temporada: true,
          segmentos_editables: [],
          segmentos: props().segmentos,
          temporadas: [TEMPORADA],
        },
        temporada: TEMPORADA,
        grupos: [],
        banco: [],
        bloqueos: [],
        estado: LISTO,
        localidades: [],
        faltantes: [],
      },
    })

    const vista = await pagina(['director-general'])
    // The page header is lazy (PaginaSistema): let it resolve inside act.
    await act(async () => {
      render(vista)
    })

    expect(cargarPlanner).toHaveBeenCalledWith(expect.anything(), 't-2026-ii')
    expect(screen.getByRole('heading', { level: 1, name: 'Revisar y publicar 2026-II' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar y activar 2026-II' })).toBeEnabled()
  })

  it('says the publish state could not be read', async () => {
    cargarPlanner.mockResolvedValue({
      tipo: 'listo',
      datos: { capacidades: { usuario_id: 'u', segmentos: [], temporadas: [] }, temporada: TEMPORADA, grupos: [], banco: [], bloqueos: [], estado: null, localidades: [], faltantes: ['estado_publicacion'] },
    })

    const vista = await pagina(['admin'])
    await act(async () => {
      render(vista)
    })

    expect(screen.getByText('No se pudo leer el estado de publicación de 2026-II. Recarga la página.')).toBeInTheDocument()
  })
})
