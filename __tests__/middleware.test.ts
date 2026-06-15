jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn(),
    redirect: jest.fn(),
  },
}))

import { isPublicPath } from '@/middleware'

describe('middleware public paths', () => {
  it('allows the Supabase token hash confirmation route without an existing session', () => {
    expect(isPublicPath('/auth/confirm')).toBe(true)
  })
})
