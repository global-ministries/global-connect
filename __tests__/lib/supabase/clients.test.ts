/**
 * Tests de infraestructura: clientes de Supabase
 * Verifica que los clientes se crean correctamente con las configuraciones esperadas.
 */

// Mock de @supabase/ssr
jest.mock('@supabase/ssr', () => ({
  createBrowserClient: jest.fn(() => ({ auth: {}, from: jest.fn() })),
  createServerClient: jest.fn(() => ({ auth: {}, from: jest.fn() })),
}))

// Mock de @supabase/supabase-js
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: {}, from: jest.fn() })),
}))

// Mock de next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}))

describe('Supabase Clients', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('createClient (browser)', () => {
    it('debe exportar la función createClient', async () => {
      const { createClient } = await import('@/lib/supabase/client')
      expect(typeof createClient).toBe('function')
    })

    it('debe retornar un cliente válido', async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const client = createClient()
      expect(client).toBeDefined()
      expect(client.auth).toBeDefined()
    })
  })

  describe('createSupabaseAdminClient', () => {
    it('debe lanzar error si se llama desde el browser (window existe)', async () => {
      // jsdom ya tiene window — exactamente lo que queremos probar
      jest.resetModules()
      jest.mock('@supabase/supabase-js', () => ({
        createClient: jest.fn(() => ({ auth: {}, from: jest.fn() })),
      }))

      const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
      expect(() => createSupabaseAdminClient()).toThrow('solo puede usarse en el servidor')
    })
  })
})
