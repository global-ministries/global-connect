/**
 * Touch targets of the reservation segmented controls (S8, design-system rule
 * 9): the V / E cédula switch and Sexo keep ControlSegmentado's own height
 * (44px on a coarse pointer); the flow only sets their width.
 */
import { render, screen } from '@testing-library/react'

import { CampoCedula, CamposFicha } from '@/components/talleres/reserva/piezas'
import { fichaVacia } from '@/lib/platform/talleres/reserva-publica'

function sinAlturaForzada(grupo: HTMLElement) {
  expect(grupo.className).not.toMatch(/min-h-/)
  for (const boton of Array.from(grupo.querySelectorAll('button'))) {
    expect(boton.className).toContain('pointer-coarse:min-h-11')
  }
}

describe('reservation segmented controls', () => {
  it('the V / E cédula switch keeps the 44px coarse-pointer height', () => {
    render(<CampoCedula id="cedula" etiqueta="Cédula" tipo="V" onTipo={() => {}} valor="" onCambio={() => {}} />)
    const grupo = screen.getByRole('group', { name: 'Tipo de cédula' })
    sinAlturaForzada(grupo)
    expect(grupo.className).toContain('[&>button]:w-10')
  })

  it('Sexo keeps the 44px coarse-pointer height', () => {
    render(<CamposFicha prefijo="p" ficha={fichaVacia('15598745')} errores={{}} onCambio={() => {}} conContacto cedulaFija="V-15598745" />)
    const grupo = screen.getByRole('group', { name: 'Sexo' })
    sinAlturaForzada(grupo)
    expect(grupo.className).toContain('[&>button]:flex-1')
  })
})
