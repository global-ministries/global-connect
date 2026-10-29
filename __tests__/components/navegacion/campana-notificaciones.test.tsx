import { fireEvent, render, screen, within } from '@testing-library/react'

import { CampanaNotificaciones, etiquetaCampana } from '@/components/navegacion/campana-notificaciones'

/**
 * The notifications bell (odd/tasks/sistema-diseno-v2.md, S9.9): always
 * visible, a 44px named button, a --brand-strong unread badge, and the empty
 * state until a data source exists.
 */

describe('CampanaNotificaciones', () => {
  it('is a named 44px button with no badge when nothing is unread', () => {
    render(<CampanaNotificaciones />)

    const campana = screen.getByRole('button', { name: 'Notificaciones' })
    expect(campana).toHaveClass('size-11', 'focus-ring')
    expect(campana).toHaveAttribute('aria-haspopup', 'dialog')
    expect(campana).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('[data-slot="insignia-notificaciones"]')).toBeNull()
  })

  it('opens the empty state and closes with Escape, returning focus', () => {
    render(<CampanaNotificaciones />)
    const campana = screen.getByRole('button', { name: 'Notificaciones' })

    fireEvent.click(campana)

    const panel = screen.getByRole('dialog', { name: 'Notificaciones' })
    expect(campana).toHaveAttribute('aria-expanded', 'true')
    expect(campana).toHaveAttribute('aria-controls', panel.id)
    expect(within(panel).getByText('No tenés notificaciones')).toBeInTheDocument()
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

  it('opens a bottom sheet on phone', () => {
    render(<CampanaNotificaciones presentacion="hoja" />)
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
