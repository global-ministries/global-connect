/**
 * The built-in close button of sheets and dialogs is a 44px target with the
 * control radius, a visible focus ring and a Spanish accessible name.
 */
import { render, screen } from '@testing-library/react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

function esperarBotonCerrar() {
  const boton = screen.getByRole('button', { name: 'Cerrar' })
  expect(boton).toHaveClass('size-11', 'rounded-xl', 'focus-visible:ring-2')
  expect(boton.className).not.toContain('rounded-xs')
  // The icon stays small; the hit area is the button.
  expect(boton.querySelector('svg')).toHaveClass('size-4')
  expect(screen.queryByText('Close')).toBeNull()
}

describe('overlay close buttons', () => {
  it('dialog', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Descripción</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    esperarBotonCerrar()
  })

  it('dialog without the close button keeps working', () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Descripción</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull()
  })

  it('sheet', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Título</SheetTitle>
          <SheetDescription>Descripción</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    esperarBotonCerrar()
  })
})
