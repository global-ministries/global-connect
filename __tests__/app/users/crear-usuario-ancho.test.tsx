/**
 * /users/create uses the whole screen: the page is not capped at the
 * deprecated 768px form width.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    rpc: async () => ({ data: true, error: null }),
  }),
}))
jest.mock('@/components/forms/UserCreateForm', () => function UserCreateForm() {
  return <form aria-label="Nuevo miembro" />
})
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))

import CreateUserPage from '@/app/(auth)/users/create/page'

describe('/users/create width', () => {
  it('renders the form at full page width', async () => {
    const { container } = render(await CreateUserPage())

    expect(await screen.findByRole('form', { name: 'Nuevo miembro' })).toBeInTheDocument()
    expect(container.querySelector('[data-ancho="form"]')).toBeNull()
  })
})
