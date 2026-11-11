/**
 * @jest-environment jsdom
 *
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the ediciones of the v2
 * taller page (artboard design/talleres-interior/22): Abiertas · En curso ·
 * Cerradas over one ListaResponsiva, each row opening its edición page.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'

const pushMock = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { EdicionesTaller } from '@/components/talleres/taller/ediciones-taller'
import { AbrirEdicionProvider } from '@/components/talleres/taller/abrir-edicion'
import type { CatalogoEdicion } from '@/lib/platform/talleres/catalogo'
import { rutaEdicion } from '@/lib/platform/talleres/rutas'

jest.mock('@/components/talleres/open-edicion-form', () => ({
  OpenEdicionForm: ({ abierto }: { abierto: boolean }) => (abierto ? <div role="dialog">Formulario</div> : null),
}))

function edicion(parcial: Partial<CatalogoEdicion> & Pick<CatalogoEdicion, 'id' | 'estado'>): CatalogoEdicion {
  return {
    nombre_snapshot: `Edición ${parcial.id}`,
    tipo: 'individual',
    total_inscripciones: 0,
    temporada_id: null,
    fecha_inicio: '2026-09-01',
    fecha_fin: '2026-09-22',
    ...parcial,
  }
}

const EDICIONES: CatalogoEdicion[] = [
  edicion({ id: 'nov', nombre_snapshot: 'Edición nov 2026', estado: 'abierto', fecha_inicio: '2026-11-24', total_inscripciones: 14 }),
  edicion({ id: 'feb', nombre_snapshot: 'Edición feb 2027', estado: 'borrador', fecha_inicio: '2027-02-09', fecha_fin: null }),
  edicion({ id: 'oct', nombre_snapshot: 'Edición oct 2026', estado: 'en_curso', fecha_inicio: '2026-10-08', total_inscripciones: 1 }),
  edicion({ id: 'abr', nombre_snapshot: 'Edición abr 2026', estado: 'cerrado', fecha_inicio: '2026-04-07' }),
  edicion({ id: 'jul', nombre_snapshot: 'Edición jul 2026', estado: 'cerrado', fecha_inicio: '2026-07-14' }),
  edicion({ id: 'ene', nombre_snapshot: 'Edición ene 2026', estado: 'cancelado', fecha_inicio: '2026-01-13' }),
]

function filasVisibles(): string[] {
  const tabla = screen.getByRole('table', { name: 'Ediciones de Mujer de Hoy' })
  return within(tabla)
    .getAllByRole('button', { name: /^Abrir / })
    .map((b) => b.getAttribute('aria-label') ?? '')
}

beforeEach(() => pushMock.mockReset())

describe('EdicionesTaller', () => {
  it('splits the ediciones into Abiertas · En curso · Cerradas with their counts, Abiertas first', () => {
    render(<EdicionesTaller tallerSlug="mujer-de-hoy" tallerNombre="Mujer de Hoy" ediciones={EDICIONES} />)
    const grupo = screen.getByRole('group', { name: 'Mostrar ediciones' })
    const botones = within(grupo).getAllByRole('button')
    expect(botones.map((b) => b.textContent)).toEqual(['Abiertas 2', 'En curso 1', 'Cerradas 3'])
    expect(botones[0]).toHaveAttribute('aria-pressed', 'true')
    // Abiertas = abierto + borrador, the closest first.
    expect(filasVisibles()).toEqual(['Abrir Edición nov 2026', 'Abrir Edición feb 2027'])
  })

  it('shows En curso and Cerradas (cerrado + cancelado, most recent first) when their segment is pressed', () => {
    render(<EdicionesTaller tallerSlug="mujer-de-hoy" tallerNombre="Mujer de Hoy" ediciones={EDICIONES} />)
    fireEvent.click(screen.getByRole('button', { name: 'En curso 1' }))
    expect(screen.getByRole('button', { name: 'En curso 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(filasVisibles()).toEqual(['Abrir Edición oct 2026'])
    fireEvent.click(screen.getByRole('button', { name: 'Cerradas 3' }))
    expect(filasVisibles()).toEqual(['Abrir Edición jul 2026', 'Abrir Edición abr 2026', 'Abrir Edición ene 2026'])
    expect(screen.getByText(/la más reciente primero/)).toBeInTheDocument()
  })

  it('shows each row with its estado words, dates and inscritos', () => {
    render(<EdicionesTaller tallerSlug="mujer-de-hoy" tallerNombre="Mujer de Hoy" ediciones={EDICIONES} />)
    const tabla = screen.getByRole('table', { name: 'Ediciones de Mujer de Hoy' })
    expect(within(tabla).getAllByText('Abierta').length).toBeGreaterThan(0)
    expect(within(tabla).getAllByText('Borrador').length).toBeGreaterThan(0)
    expect(within(tabla).getAllByText(/→/).length).toBeGreaterThan(0)
    expect(within(tabla).getByText('14')).toBeInTheDocument()
  })

  it('opens the edición page when a row is chosen', () => {
    render(<EdicionesTaller tallerSlug="mujer-de-hoy" tallerNombre="Mujer de Hoy" ediciones={EDICIONES} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Edición nov 2026' }))
    expect(pushMock).toHaveBeenCalledWith(rutaEdicion('mujer-de-hoy', 'nov'))
  })

  it('starts on the first segment that has ediciones', () => {
    render(
      <EdicionesTaller
        tallerSlug="mujer-de-hoy"
        tallerNombre="Mujer de Hoy"
        ediciones={EDICIONES.filter((e) => e.estado === 'cerrado')}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cerradas 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(filasVisibles()).toHaveLength(2)
  })

  it('says an empty segment is empty and points at the others', () => {
    render(
      <EdicionesTaller
        tallerSlug="mujer-de-hoy"
        tallerNombre="Mujer de Hoy"
        ediciones={EDICIONES.filter((e) => e.estado === 'cerrado')}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'En curso 0' }))
    expect(screen.getByText('Ninguna edición en curso')).toBeInTheDocument()
    expect(screen.getByText('Cambia de pestaña para ver las demás ediciones.')).toBeInTheDocument()
  })

  it('with no ediciones: an empty state, no segments, and «Abrir edición» only for who may open one', () => {
    const { unmount } = render(<EdicionesTaller tallerSlug="mujer-de-hoy" tallerNombre="Mujer de Hoy" ediciones={[]} />)
    expect(screen.getByText('Este taller todavía no tiene ediciones')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Mostrar ediciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir edición' })).not.toBeInTheDocument()
    unmount()

    render(
      <AbrirEdicionProvider formulario={{} as never}>
        <EdicionesTaller tallerSlug="mujer-de-hoy" tallerNombre="Mujer de Hoy" ediciones={[]} />
      </AbrirEdicionProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Abrir edición' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Formulario')
  })

  it('uses neutral Spanish (no voseo)', () => {
    const { container } = render(<EdicionesTaller tallerSlug="mujer-de-hoy" tallerNombre="Mujer de Hoy" ediciones={[]} />)
    expect(container.textContent).not.toMatch(/\b(tocá|tenés|podés|usá|creá|acá)\b/i)
  })
})
