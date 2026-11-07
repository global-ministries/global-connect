/**
 * @jest-environment node
 *
 * The QR of the Próximo Paso announcement points at /proximo-paso
 * (odd/tasks/proximo-paso.md T2, S3): a visitor without a session must reach
 * it. Only that exact path is public; deeper paths and the talleres screens
 * keep sending a visitor without a session to the login.
 */

const getUserMock = jest.fn()

jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: getUserMock } }),
}))
jest.mock('@sentry/nextjs', () => ({ addBreadcrumb: jest.fn() }))
jest.mock('next/server', () => ({
  NextResponse: {
    next: () => ({ type: 'next', cookies: { set: jest.fn(), delete: jest.fn() } }),
    redirect: (url: URL | string) => ({ type: 'redirect', url: String(url), cookies: { set: jest.fn(), delete: jest.fn() } }),
  },
}))

import { isPublicPath, middleware } from '@/middleware'

function peticion(path: string) {
  return { url: `https://global.test${path}`, cookies: { getAll: () => [], set: jest.fn() } } as never
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: null }, error: null })
})

describe('/proximo-paso is public', () => {
  it('is a public path, without checking the session', async () => {
    expect(isPublicPath('/proximo-paso')).toBe(true)
    const respuesta = (await middleware(peticion('/proximo-paso'))) as unknown as { type: string }
    expect(respuesta.type).toBe('next')
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it.each(['/proximo-paso/otra', '/proximo-pasoX', '/talleres/explorar', '/talleres/mi-recorrido'])(
    'keeps %s behind the login',
    async (path) => {
      expect(isPublicPath(path)).toBe(false)
      const respuesta = (await middleware(peticion(path))) as unknown as { type: string; url: string }
      expect(respuesta.type).toBe('redirect')
      expect(new URL(respuesta.url).searchParams.get('redirect')).toBe(path)
    },
  )
})
