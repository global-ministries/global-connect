/**
 * PastillasFiltro — the shared count pills that refine a list (etapa, quick
 * filters). One look everywhere: label, then the count; the pressed pill uses
 * the same brand tint as the KPI filter cards.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'

describe('PastillaFiltro', () => {
  it('is a pressable button named by its label and count', async () => {
    const onClick = jest.fn()
    render(<PastillaFiltro etiqueta="Activo" cantidad={12} activa={false} onClick={onClick} />)
    const boton = screen.getByRole('button', { name: 'Activo 12' })
    expect(boton).toHaveAttribute('aria-pressed', 'false')
    expect(boton).toHaveAttribute('type', 'button')
    await userEvent.click(boton)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('marks the active pill pressed, with the brand tint of the KPI cards', () => {
    render(<PastillaFiltro etiqueta="En pausa" cantidad={0} activa onClick={() => {}} />)
    const boton = screen.getByRole('button', { name: 'En pausa 0' })
    expect(boton).toHaveAttribute('aria-pressed', 'true')
    expect(boton).toHaveClass('border-brand', 'bg-brand-tint')
  })

  it('draws a status dot before the label when given a tono, without changing its name', () => {
    render(<PastillaFiltro etiqueta="Sin turno" cantidad={2} tono="danger" activa={false} onClick={() => {}} />)
    const boton = screen.getByRole('button', { name: 'Sin turno 2' })
    const punto = boton.querySelector('[data-punto]')
    expect(punto).toHaveClass('bg-danger')
    expect(punto?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(boton.firstElementChild).toContainElement(punto as HTMLElement)
  })

  it('has no dot without a tono', () => {
    render(<PastillaFiltro etiqueta="Activo" cantidad={12} activa={false} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Activo 12' }).querySelector('[data-punto]')).toBeNull()
  })
})

describe('PastillaFiltro without a count', () => {
  it('shows only the label, which is its accessible name', () => {
    render(<PastillaFiltro etiqueta="Por mes" activa onClick={() => {}} />)
    const boton = screen.getByRole('button', { name: 'Por mes' })
    expect(boton).toHaveAttribute('aria-pressed', 'true')
    expect(boton).toHaveTextContent(/^Por mes$/)
  })
})

describe('GrupoPastillas', () => {
  it('groups the pills under an accessible name', () => {
    render(
      <GrupoPastillas etiqueta="Filtrar por etapa">
        <PastillaFiltro etiqueta="Todas" cantidad={3} activa onClick={() => {}} />
        <PastillaFiltro etiqueta="Activo" cantidad={3} activa={false} onClick={() => {}} />
      </GrupoPastillas>,
    )
    expect(within(screen.getByRole('group', { name: 'Filtrar por etapa' })).getAllByRole('button')).toHaveLength(2)
  })
})
