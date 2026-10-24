/**
 * Entry of the public registration page (/ninos/registro), odd/tasks/ninos-registro-pasos.md R2:
 * account holders go to their profile instead of creating a new pre-registration.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { EntradaRegistro } from '@/components/ninos/registro/entrada-registro'

const campus = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Campus Uno' }]

describe('EntradaRegistro', () => {
  it('shows the wizard with a secondary sign-in link that returns to the profile', () => {
    render(<EntradaRegistro conSesion={false} campus={campus} />)

    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument()
    const enlace = screen.getByRole('link', { name: /inicia sesión/i })
    expect(enlace).toHaveAttribute('href', '/?redirect=%2Fperfil')
    expect(screen.getByText(/¿ya tienes cuenta\?/i)).toBeInTheDocument()
  })

  it('sends a signed-in visitor to the profile instead of the wizard', () => {
    render(<EntradaRegistro conSesion campus={campus} />)

    expect(screen.getByRole('heading', { name: 'Ya tienes sesión iniciada' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ir a mi perfil/i })).toHaveAttribute('href', '/perfil')
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
  })

  it('lets a signed-in visitor register another family anyway, without the sign-in link', () => {
    render(<EntradaRegistro conSesion campus={campus} />)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar otra familia' }))

    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /inicia sesión/i })).not.toBeInTheDocument()
  })
})
