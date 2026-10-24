/**
 * @jest-environment jsdom
 *
 * T7 (odd/tasks/uno-a-uno.md) — /mis-uno-a-uno: the "Supervisión" tab only
 * for whoever supervises (S7.1, uno_a_uno_acceso().supervisa), opened with
 * ?vista=supervision; the schedule buttons only for whoever leads someone.
 */

import type { ReactElement, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'

import MisUnoAUnoPage from '@/app/(auth)/mis-uno-a-uno/page'

const rpc = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(async () => ({ rpc })),
}))
jest.mock('@/app/(auth)/mis-uno-a-uno/actions', () => ({
  agendarUnoAUno: jest.fn(),
  registrarUnoAUno: jest.fn(),
  registrarSinAgenda: jest.fn(),
  reprogramarUnoAUno: jest.fn(),
  cancelarUnoAUno: jest.fn(),
}))
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

type Resultado = { data: unknown; error: { message: string } | null }

const ok = (data: unknown): Resultado => ({ data, error: null })
const fallo: Resultado = { data: null, error: { message: 'boom' } }

const LIDER = {
  usuario_id: 'l-2',
  nombre: 'Pedro',
  apellido: 'Ruiz',
  contextos: ['GDV: Norte'],
  dirigidos: 3,
  realizados: 0,
  agendados: 0,
  ultimo_realizado: null,
}
const DIRIGIDO = { usuario_id: 'd-1', nombre: 'Luis', apellido: 'Gómez', conyuge_id: null, contextos: ['GDV: Norte'] }

function setup(respuestas: Partial<Record<string, Resultado>>): void {
  const base: Record<string, Resultado> = {
    uno_a_uno_acceso: ok({ lidera: false, supervisa: false, participa: true }),
    mis_dirigidos: ok([]),
    mis_uno_a_uno: ok([]),
    uno_a_uno_supervision_lideres: ok([LIDER]),
    uno_a_uno_supervision: ok([]),
    ...respuestas,
  }
  rpc.mockReset().mockImplementation(async (nombre: string) => base[nombre])
}

async function renderPage(vista?: string): Promise<void> {
  const ui = (await MisUnoAUnoPage({ searchParams: Promise.resolve(vista ? { vista } : {}) })) as ReactElement
  render(ui)
}

const supervisa = ok({ lidera: true, supervisa: true, participa: false })

function llamadas(): string[] {
  return rpc.mock.calls.map((c) => c[0] as string)
}

describe('MisUnoAUnoPage — tabs (S7.1)', () => {
  it('shows no tabs to someone who does not supervise', async () => {
    setup({})
    await renderPage()
    expect(screen.queryByRole('navigation', { name: 'Vistas de Mis 1 a 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Próximos' })).toBeInTheDocument()
  })

  it('ignores ?vista=supervision for someone who does not supervise', async () => {
    setup({})
    await renderPage('supervision')
    expect(screen.getByRole('region', { name: 'Próximos' })).toBeInTheDocument()
    expect(llamadas()).not.toContain('uno_a_uno_supervision')
    expect(llamadas()).not.toContain('uno_a_uno_supervision_lideres')
  })

  it('shows no tabs when the access check fails (fails closed)', async () => {
    setup({ uno_a_uno_acceso: fallo })
    await renderPage('supervision')
    expect(screen.queryByRole('navigation', { name: 'Vistas de Mis 1 a 1' })).not.toBeInTheDocument()
    expect(llamadas()).not.toContain('uno_a_uno_supervision')
  })

  it('shows both tabs to a supervisor, "Mis 1 a 1" first and current', async () => {
    setup({ uno_a_uno_acceso: supervisa })
    await renderPage()
    const mis = screen.getByRole('link', { name: 'Mis 1 a 1' })
    const supervision = screen.getByRole('link', { name: 'Supervisión' })
    expect(mis).toHaveAttribute('href', '/mis-uno-a-uno')
    expect(mis).toHaveAttribute('aria-current', 'page')
    expect(supervision).toHaveAttribute('href', '/mis-uno-a-uno?vista=supervision')
    expect(supervision).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('region', { name: 'Próximos' })).toBeInTheDocument()
  })
})

describe('MisUnoAUnoPage — Supervisión (S7.2, S7.4)', () => {
  it('loads the leaders over 30 days and the 1:1s of the last 90 days', async () => {
    setup({ uno_a_uno_acceso: supervisa })
    const antes = Date.now()
    await renderPage('supervision')
    expect(rpc).toHaveBeenCalledWith('uno_a_uno_supervision_lideres', { p_dias: 30 })
    const args = rpc.mock.calls.find((c) => c[0] === 'uno_a_uno_supervision')?.[1] as { p_desde: string }
    const dias = (antes - new Date(args.p_desde).getTime()) / 86_400_000
    expect(Math.round(dias)).toBe(90)
    expect(llamadas()).not.toContain('mis_uno_a_uno')
  })

  it('shows the supervision view with "Supervisión" current and no schedule buttons', async () => {
    setup({ uno_a_uno_acceso: supervisa, mis_dirigidos: ok([DIRIGIDO]) })
    await renderPage('supervision')
    expect(screen.getByRole('link', { name: 'Supervisión' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('listitem', { name: 'Pedro Ruiz' })).toHaveTextContent('Sin 1 a 1 en 30 días')
    expect(screen.queryByRole('button', { name: /agendar 1 a 1/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Próximos' })).not.toBeInTheDocument()
  })

  it.each(['uno_a_uno_supervision', 'uno_a_uno_supervision_lideres'])(
    'shows an error when %s fails',
    async (nombre) => {
      setup({ uno_a_uno_acceso: supervisa, [nombre]: fallo })
      await renderPage('supervision')
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No pudimos cargar la supervisión. Recarga la página para intentarlo de nuevo.',
      )
    },
  )
})

describe('MisUnoAUnoPage — Mis 1 a 1 (preserved)', () => {
  it('offers Agendar and Registrar sin agenda only to whoever leads someone', async () => {
    setup({ uno_a_uno_acceso: supervisa, mis_dirigidos: ok([DIRIGIDO]) })
    await renderPage()
    expect(screen.getByRole('button', { name: /agendar 1 a 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /registrar sin agenda/i })).toBeInTheDocument()
  })

  it('offers no schedule button to someone who only takes part', async () => {
    setup({})
    await renderPage()
    expect(screen.queryByRole('button', { name: /agendar 1 a 1/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /registrar sin agenda/i })).not.toBeInTheDocument()
  })

  it('shows the load error of the own 1:1s', async () => {
    setup({ mis_uno_a_uno: fallo })
    await renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tus 1 a 1.')
  })
})
