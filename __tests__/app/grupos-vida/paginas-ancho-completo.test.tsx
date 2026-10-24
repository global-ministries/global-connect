/**
 * Grupos de Vida forms and detail pages use the whole screen
 * (docs/design-system.md, "Sections and fields"): no 768px form cap, no card
 * wrapped around a form whose sections are already cards, and the event detail
 * lays its blocks out with SeccionesSistema so wide screens show them side by
 * side while the attendance list takes the whole row.
 */
import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/components/forms/GroupEditForm', () => ({ __esModule: true, default: () => <form aria-label="Editar grupo" /> }))
jest.mock('@/components/forms/GroupCreateForm', () => ({ __esModule: true, default: () => <form aria-label="Crear grupo" /> }))
jest.mock('@/components/forms/SeasonForm', () => ({ __esModule: true, default: () => <form aria-label="Temporada" /> }))

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
  rpc: jest.fn(),
  from: jest.fn(),
}
const adminDb = { from: jest.fn() }
const getUserWithRoles = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => supabase }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => adminDb }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (...args: unknown[]) => getUserWithRoles(...args) }))

import CreateGroupPage from '@/app/(auth)/grupos-vida/crear/page'
import EditGroupPage from '@/app/(auth)/grupos-vida/[id]/edit/page'
import EditSeasonPage from '@/app/(auth)/grupos-vida/temporadas/[id]/edit/page'
import AsistenciaEventoPage from '@/app/(auth)/grupos-vida/[id]/asistencia/[eventoId]/page'

/** A chainable query builder that resolves to `result` wherever it is awaited. */
function consulta(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const metodo of ['select', 'eq', 'in', 'or', 'order']) builder[metodo] = () => builder
  builder.single = async () => ({ error: null, ...result })
  builder.maybeSingle = async () => ({ error: null, ...result })
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ error: null, ...result })
  return builder
}

function anchoDe(elemento: HTMLElement) {
  return elemento.closest('[data-ancho]')?.getAttribute('data-ancho')
}

beforeEach(() => {
  jest.clearAllMocks()
  supabase.from.mockImplementation(() => consulta({ data: [] }))
  adminDb.from.mockImplementation(() => consulta({ data: [] }))
})

describe('Crear grupo', () => {
  it('uses the full content width and does not wrap the sectioned form in another card', async () => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'u1' }, roles: ['admin'] })
    render((await CreateGroupPage()) as ReactElement)
    const formulario = await screen.findByRole('form', { name: 'Crear grupo' })
    expect(anchoDe(formulario)).toBe('default')
    expect(formulario.closest('.glass-panel')).toBeNull()
  })

  it('uses the full content width for the no-permission notice', async () => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'u1' }, roles: ['miembro'] })
    render((await CreateGroupPage()) as ReactElement)
    expect(anchoDe(await screen.findByText('No Tienes permisos para crear grupos.'))).toBe('default')
  })
})

describe('Editar grupo', () => {
  it('uses the full content width and does not wrap the sectioned form in another card', async () => {
    supabase.rpc.mockImplementation(async (nombre: string) =>
      nombre === 'obtener_detalle_grupo' ? { data: { id: 'g1', nombre: 'Grupo Uno' }, error: null } : { data: false, error: null },
    )
    supabase.from.mockImplementation(() => consulta({ data: { casa_anfitriona_id: null } }))
    render((await EditGroupPage({ params: Promise.resolve({ id: 'g1' }) })) as ReactElement)

    const formulario = await screen.findByRole('form', { name: 'Editar grupo' })
    expect(anchoDe(formulario)).toBe('default')
    expect(formulario.closest('.glass-panel')).toBeNull()
    expect(screen.getByText(/Este grupo está en modo solo lectura para tu rol/)).toBeInTheDocument()
  })
})

describe('Editar temporada', () => {
  it('uses the full content width and does not wrap the sectioned form in another card', async () => {
    supabase.from.mockImplementation(() => consulta({ data: { id: 't1', nombre: 'Temporada 2026' } }))
    render((await EditSeasonPage({ params: Promise.resolve({ id: 't1' }) })) as ReactElement)
    const formulario = await screen.findByRole('form', { name: 'Temporada' })
    expect(anchoDe(formulario)).toBe('default')
    expect(formulario.closest('.glass-panel')).toBeNull()
  })
})

describe('Detalle de asistencia de un evento', () => {
  function prepararEvento(evento: Record<string, unknown>) {
    supabase.rpc.mockImplementation(async (nombre: string) => {
      if (nombre === 'obtener_evento_grupo') return { data: [evento], error: null }
      if (nombre === 'puede_editar_grupo') return { data: true, error: null }
      if (nombre === 'obtener_asistencia_evento') {
        return {
          data: [
            { usuario_id: 'm1', nombre: 'Ana', apellido: 'Pérez', tipo_presencia: 'presente' },
            { usuario_id: 'm2', nombre: 'Luis', apellido: 'Gómez', tipo_presencia: 'ausente' },
          ],
          error: null,
        }
      }
      return { data: null, error: null }
    })
    supabase.from.mockImplementation(() => consulta({ data: { segmento_id: 's1', segmentos: { nombre: 'Jóvenes' } } }))
  }

  it('lays out its blocks in sections, with the attendance list across the whole row', async () => {
    prepararEvento({
      id: 'e1', grupo_id: 'g1', fecha: '2026-10-18', hora: '19:00', tema: 'Fe', notas: null,
      notas_privadas_lider: 'Llamar a Luis',
    })
    render((await AsistenciaEventoPage({ params: Promise.resolve({ id: 'g1', eventoId: 'e1' }) })) as ReactElement)

    const listado = await screen.findByRole('heading', { name: 'Listado de Asistencia' })
    expect(anchoDe(listado)).toBe('default')
    const secciones = listado.closest('[data-slot="secciones"]') as HTMLElement
    expect(secciones).not.toBeNull()

    const bloqueDe = (elemento: HTMLElement) => Array.from(secciones.children).find((hijo) => hijo.contains(elemento))
    expect(bloqueDe(listado)).toHaveClass('col-span-full')
    expect(bloqueDe(within(secciones).getByText('Tema'))).toBeDefined()
    expect(bloqueDe(within(secciones).getByText('% Asistencia'))).toBeDefined()
    expect(bloqueDe(within(secciones).getByText('Notas privadas del líder'))).toBeDefined()
    // The present and absent lists sit side by side when the card is wide enough.
    const listas = screen.getByText(/Presentes \(1\)/).closest('[data-slot="secciones"]')
    expect(listas).not.toBe(secciones)
    expect(listas).toContainElement(screen.getByText(/Ausentes \(1\)/))
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument()
  })
})
