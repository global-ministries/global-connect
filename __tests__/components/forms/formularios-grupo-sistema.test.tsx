/**
 * @jest-environment jsdom
 *
 * ui-areas-formularios — the season and group forms label every control and
 * keep their submit action in the system action footer.
 */

import { render, screen, within } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/actions/season.actions', () => ({ createSeason: jest.fn(), updateSeason: jest.fn() }))
jest.mock('@/lib/actions/group.actions', () => ({ createGroup: jest.fn() }))
jest.mock('@/components/modals/SelectLeaderModal', () => ({ __esModule: true, default: () => null }))

import SeasonForm from '@/components/forms/SeasonForm'
import GroupCreateForm from '@/components/forms/GroupCreateForm'

function pieDeAcciones(container: HTMLElement) {
  const pie = container.querySelector('[data-slot="pie-acciones"]')
  if (!(pie instanceof HTMLElement)) throw new Error('Missing action footer')
  return pie
}

describe('SeasonForm on the design system', () => {
  beforeAll(() => {
    // The Radix switch measures itself; jsdom has no ResizeObserver.
    global.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  it('labels every control, the active switch included', () => {
    render(<SeasonForm />)

    for (const etiqueta of ['Nombre de la Temporada *', 'Fecha de Inicio *', 'Fecha de Fin *']) {
      expect(screen.getByLabelText(etiqueta)).toBeTruthy()
    }
    expect(screen.getByRole('switch', { name: '¿Activa?' })).toBeTruthy()
  })

  it.each([
    [undefined, 'Crear Temporada'],
    [{ id: 't1', nombre: 'T', fecha_inicio: '2026-01-01', fecha_fin: '2026-06-01', activa: true }, 'Guardar Cambios'],
  ])('keeps the submit action in the footer (%#)', (initialData, texto) => {
    const { container } = render(<SeasonForm initialData={initialData} />)

    const botones = within(pieDeAcciones(container)).getAllByRole('button')
    expect(botones.map((b) => b.textContent)).toEqual([texto])
    expect(botones[0].getAttribute('type')).toBe('submit')
  })
})

describe('GroupCreateForm on the design system', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch
  })

  it('labels the optional leader group and keeps the submit action in the footer', () => {
    const { container } = render(<GroupCreateForm temporadas={[]} segmentos={[]} />)

    expect(screen.getByRole('group', { name: 'Líder Inicial (opcional)' })).toBeTruthy()
    expect(screen.getByLabelText('Director de Etapa')).toBeTruthy()
    const botones = within(pieDeAcciones(container)).getAllByRole('button')
    expect(botones.map((b) => b.textContent)).toEqual(['Crear Grupo y Continuar'])
  })

  it('shows the director de etapa note as a static notice', () => {
    render(<GroupCreateForm temporadas={[]} segmentos={[]} userRoles={['director-etapa']} />)

    expect(screen.getByText(/pendiente de aprobación/).closest('[role="alert"]')).toBeNull()
  })
})
