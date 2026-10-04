import { render, screen } from '@testing-library/react'
import PaginaVinculoPendiente from '@/app/auth/vinculo-pendiente/page'

describe('vinculo pendiente page', () => {
  it('tells the person a director must approve the account', () => {
    render(<PaginaVinculoPendiente />)
    expect(screen.getByText('Tu cuenta está pendiente de aprobación por tu director')).toBeInTheDocument()
  })
})
