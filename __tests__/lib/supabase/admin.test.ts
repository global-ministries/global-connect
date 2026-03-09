/**
 * @jest-environment node
 */

/**
 * Tests del admin client de Supabase en entorno Node (servidor).
 * Usa @jest-environment node porque admin client requiere que window NO exista.
 */

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: {}, from: jest.fn() })),
}))

describe('createSupabaseAdminClient (server)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('debe lanzar error si falta SUPABASE_SERVICE_ROLE_KEY', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    jest.resetModules()
    jest.mock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({ auth: {}, from: jest.fn() })),
    }))

    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    expect(() => createSupabaseAdminClient()).toThrow('Faltan variables de entorno')
  })

  it('debe lanzar error si falta SUPABASE_URL', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL

    jest.resetModules()
    jest.mock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({ auth: {}, from: jest.fn() })),
    }))

    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    expect(() => createSupabaseAdminClient()).toThrow('Faltan variables de entorno')
  })

  it('debe crear cliente correctamente con env vars válidas', async () => {
    jest.resetModules()
    jest.mock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({ auth: {}, from: jest.fn() })),
    }))

    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    const client = createSupabaseAdminClient()
    expect(client).toBeDefined()
    expect(client.auth).toBeDefined()
  })

  it('debe llamar a createClient con autoRefreshToken false', async () => {
    jest.resetModules()
    const mockCreateClient = jest.fn(() => ({ auth: {}, from: jest.fn() }))
    jest.mock('@supabase/supabase-js', () => ({
      createClient: mockCreateClient,
    }))

    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    createSupabaseAdminClient()

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-service-role-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      })
    )
  })
})
