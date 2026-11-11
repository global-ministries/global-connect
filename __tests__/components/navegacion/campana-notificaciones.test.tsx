import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CampanaNotificaciones, etiquetaCampana } from '@/components/navegacion/campana-notificaciones'
import type { ClienteAvisos } from '@/lib/platform/avisos/avisos-persona'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// The browser client is never built in these tests: every bell gets a fake source.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    throw new Error('no browser client in tests')
  },
}))

type Fila = Record<string, unknown>

function fuente(filas: Fila[] = [], { falla = false }: { falla?: boolean } = {}) {
  const leidos = new Set<string>()
  const rpc = jest.fn((nombre: string, args?: Record<string, unknown>) => {
    if (falla) return Promise.resolve({ data: null, error: { message: 'offline' } })
    if (nombre === 'mis_avisos') {
      return Promise.resolve({
        data: filas.map((f) => (leidos.has(f.id as string) ? { ...f, leido_at: '2026-11-10T15:00:00Z' } : f)),
        error: null,
      })
    }
    if (nombre === 'aviso_marcar_leido') {
      leidos.add(args?.p_aviso_id as string)
      return Promise.resolve({ data: true, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })
  return { cliente: { rpc } as unknown as ClienteAvisos, rpc }
}

const APROBADA: Fila = {
  id: 'a1',
  tipo: 'inscripcion_aprobada',
  titulo: 'Aprobamos tu inscripción',
  cuerpo: 'Tienes tu lugar en Mujer de Hoy.',
  url: '/talleres/mi-recorrido',
  datos: { taller: 'Mujer de Hoy' },
  leido_at: null,
  created_at: '2026-11-10T13:12:00Z',
}
const RECHAZADA: Fila = {
  id: 'a2',
  tipo: 'inscripcion_rechazada',
  titulo: 'Tu inscripción no fue aprobada',
  cuerpo: 'No pudimos aprobar tu inscripción en Parejas.',
  url: null,
  datos: { taller: 'Parejas' },
  leido_at: null,
  created_at: '2026-11-09T13:12:00Z',
}
const LEIDA: Fila = { ...APROBADA, id: 'a3', titulo: 'Recibimos tu solicitud', leido_at: '2026-11-08T10:00:00Z' }

/**
 * The notifications bell (odd/tasks/sistema-diseno-v2.md, S9.9): always
 * visible, a 44px named button, a --brand-strong unread badge, and the empty
 * state until a data source exists.
 */

describe('CampanaNotificaciones', () => {
  it('is a named 44px button with no badge when nothing is unread', async () => {
    await act(async () => {
      render(<CampanaNotificaciones fuente={fuente().cliente} />)
    })

    const campana = screen.getByRole('button', { name: 'Notificaciones' })
    expect(campana).toHaveClass('size-11', 'focus-ring')
    expect(campana).toHaveAttribute('aria-haspopup', 'dialog')
    expect(campana).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('[data-slot="insignia-notificaciones"]')).toBeNull()
  })

  it('opens the empty state and closes with Escape, returning focus', async () => {
    render(<CampanaNotificaciones fuente={fuente().cliente} />)
    const campana = screen.getByRole('button', { name: 'Notificaciones' })

    fireEvent.click(campana)

    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })
    expect(campana).toHaveAttribute('aria-expanded', 'true')
    expect(campana).toHaveAttribute('aria-controls', panel.id)
    expect(await within(panel).findByText('No tenés notificaciones')).toBeInTheDocument()
    expect(within(panel).getByText('Acá vas a ver postulaciones, recordatorios de 1 a 1 y novedades de la app.')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(campana).toHaveFocus()
  })

  it('shows the unread count on a brand-strong badge and in the name', () => {
    render(<CampanaNotificaciones noLeidas={3} />)

    const campana = screen.getByRole('button', { name: 'Notificaciones, 3 sin leer' })
    const insignia = campana.querySelector('[data-slot="insignia-notificaciones"]')
    expect(insignia).toHaveTextContent('3')
    expect(insignia).toHaveClass('bg-brand-strong', 'text-white', 'font-mono', 'tabular-nums')
    expect(insignia).toHaveAttribute('aria-hidden', 'true')
  })

  it('caps the badge at 99+', () => {
    render(<CampanaNotificaciones noLeidas={120} />)
    expect(screen.getByRole('button', { name: 'Notificaciones, 120 sin leer' })).toHaveTextContent('99+')
  })

  it('shows the caller list instead of the empty state', () => {
    render(
      <CampanaNotificaciones noLeidas={1}>
        <ul><li>Nueva postulación</li></ul>
      </CampanaNotificaciones>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' }))

    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })
    expect(within(panel).getByText('Nueva postulación')).toBeInTheDocument()
    expect(within(panel).queryByText('No tenés notificaciones')).not.toBeInTheDocument()
  })

  it('opens a bottom sheet on phone', async () => {
    render(<CampanaNotificaciones presentacion="hoja" fuente={fuente().cliente} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Notificaciones' })).toHaveTextContent('No tenés notificaciones'))
  })
})

describe('CampanaNotificaciones with the person\'s notices (T7)', () => {
  it('reads mis_avisos after mount and badges the unread ones', async () => {
    const { cliente, rpc } = fuente([APROBADA, RECHAZADA, LEIDA])
    render(<CampanaNotificaciones fuente={cliente} />)

    expect(await screen.findByRole('button', { name: 'Notificaciones, 2 sin leer' })).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('mis_avisos')
  })

  it('lists title, body and taller, newest first, unread ones named as such', async () => {
    const { cliente } = fuente([APROBADA, RECHAZADA, LEIDA])
    render(<CampanaNotificaciones fuente={cliente} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 2 sin leer' }))

    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })
    const filas = within(panel).getAllByRole('listitem')
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent('Aprobamos tu inscripción, sin leer')
    expect(filas[0]).toHaveTextContent('Tienes tu lugar en Mujer de Hoy.')
    expect(filas[0]).toHaveTextContent('Mujer de Hoy')
    expect(filas[2]).not.toHaveTextContent('sin leer')
    expect(within(filas[0]).getByRole('link')).toHaveAttribute('href', '/talleres/mi-recorrido')
  })

  it('opening a notice marks it read once and lowers the badge', async () => {
    const { cliente, rpc } = fuente([APROBADA, RECHAZADA])
    render(<CampanaNotificaciones fuente={cliente} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 2 sin leer' }))

    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: /Tu inscripción no fue aprobada/ }))
    })

    expect(rpc).toHaveBeenCalledWith('aviso_marcar_leido', { p_aviso_id: 'a2' })
    expect(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: /Tu inscripción no fue aprobada/ }))
    })
    expect(rpc.mock.calls.filter(([nombre]) => nombre === 'aviso_marcar_leido')).toHaveLength(1)
  })

  it('a notice with a link closes the panel when opened', async () => {
    const { cliente } = fuente([APROBADA])
    render(<CampanaNotificaciones fuente={cliente} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }))

    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Notificaciones' })).getByRole('link'))
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('«Marcar leídos» marks every unread one', async () => {
    const { cliente, rpc } = fuente([APROBADA, RECHAZADA, LEIDA])
    render(<CampanaNotificaciones fuente={cliente} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 2 sin leer' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Marcar leídos' }))
    })

    const marcados = rpc.mock.calls.filter(([nombre]) => nombre === 'aviso_marcar_leido').map(([, args]) => args)
    expect(marcados).toEqual([{ p_aviso_id: 'a1' }, { p_aviso_id: 'a2' }])
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar leídos' })).not.toBeInTheDocument()
  })

  it('a failed load offers a retry instead of a fake empty state', async () => {
    const { cliente, rpc } = fuente([], { falla: true })
    await act(async () => {
      render(<CampanaNotificaciones fuente={cliente} />)
    })
    expect(rpc).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))

    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })
    expect(await within(panel).findByText('No pudimos cargar tus notificaciones')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('shows the list in the phone sheet too', async () => {
    const { cliente } = fuente([APROBADA])
    render(<CampanaNotificaciones presentacion="hoja" fuente={cliente} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }))

    expect(screen.getByRole('dialog', { name: 'Notificaciones' })).toHaveTextContent('Aprobamos tu inscripción')
  })

  it('a caller with its own count or list fetches nothing', () => {
    const { cliente, rpc } = fuente([APROBADA])
    render(<CampanaNotificaciones noLeidas={0} fuente={cliente} />)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('without a browser client (no Supabase config) it is the empty state, never an error', async () => {
    await act(async () => {
      render(<CampanaNotificaciones />)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))
    expect(screen.getByRole('dialog', { name: 'Notificaciones' })).toHaveTextContent('No tenés notificaciones')
  })
})

describe('etiquetaCampana', () => {
  it('names the bell and its unread count', () => {
    expect(etiquetaCampana()).toBe('Notificaciones')
    expect(etiquetaCampana(0)).toBe('Notificaciones')
    expect(etiquetaCampana(2)).toBe('Notificaciones, 2 sin leer')
  })
})
