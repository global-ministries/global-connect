/**
 * @jest-environment jsdom
 *
 * R3f (odd/tasks/talleres-rediseno.md, S1, S2) — «Inscribir a alguien»: a
 * header button from md and a FAB on phones open the existing
 * InscribirPersonaForm in a panel, which closes after a successful
 * inscription.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const exitoMock = jest.fn()
let formProps: Record<string, unknown> = {}

jest.mock('@/components/talleres/inscribir-persona-form', () => ({
  InscribirPersonaForm: (p: Record<string, unknown>) => {
    formProps = p
    return (
      <button type="button" onClick={() => (p.onInscrita as () => void)()}>
        simular inscripción
      </button>
    )
  },
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: exitoMock, error: jest.fn(), info: jest.fn() }),
}))

import { InscribirAlguien } from '@/components/talleres/edicion/inscribir-alguien'

const PROPS = { tallerSlug: 'mujer-de-hoy', edicionId: 'e-1', cohorteId: 'c-1', tipo: 'individual' as const }

describe('InscribirAlguien', () => {
  it('opens the form from the header button with the edición data and closes it after inscribing', async () => {
    render(<InscribirAlguien {...PROPS} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Inscribir a alguien' })[0])
    const panel = await screen.findByRole('dialog')
    expect(panel).toHaveTextContent('Busca a la persona por nombre, apellido o correo.')
    expect(formProps).toMatchObject(PROPS)
    fireEvent.click(screen.getByRole('button', { name: 'simular inscripción' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(exitoMock).toHaveBeenCalledWith('Inscripción creada.')
  })

  it('offers the same action as a phone FAB', async () => {
    render(<InscribirAlguien {...PROPS} />)
    const botones = screen.getAllByRole('button', { name: 'Inscribir a alguien' })
    expect(botones).toHaveLength(2)
    fireEvent.click(botones[1])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
