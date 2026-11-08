/**
 * /dream-team/dps/configuracion (RSC, odd/tasks/dps-asistencia-pco.md, T9):
 * reads dps_config_leer, which requires a planner; anyone else gets a 404.
 * Writes are checked by the database (configurators only), so the page hands
 * the island the configuration and nothing else. The island is mocked.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))

const isDreamTeamEnabled = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({ isDreamTeamEnabled: () => isDreamTeamEnabled() }))

const getUser = jest.fn()
let respuesta: { data: unknown; error: unknown } = { data: null, error: null }
const rpc = jest.fn(async () => respuesta)
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }) }))

const recibidas: unknown[] = []
jest.mock('@/components/dream-team/dps/configuracion-client', () => ({
  ConfiguracionClient: (props: unknown) => {
    recibidas.push(props)
    return <div data-testid="isla" />
  },
}))

import DpsConfiguracionPage, { metadata } from '@/app/(auth)/dream-team/dps/configuracion/page'

const ultima = () => recibidas[recibidas.length - 1] as Record<string, unknown>

beforeEach(() => {
  jest.clearAllMocks()
  recibidas.length = 0
  isDreamTeamEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  respuesta = { data: { horarios: ['09:15'], llegada: '07:00', planificadores: [], pasan_asistencia: [] }, error: null }
})

describe('/dream-team/dps/configuracion', () => {
  it('reads the configuration', async () => {
    render(await DpsConfiguracionPage())
    expect(metadata).toEqual({ title: 'Configuración — DPS' })
    expect(rpc).toHaveBeenCalledWith('dps_config_leer', undefined)
    expect(screen.getByTestId('isla')).toBeInTheDocument()
    expect(ultima()).toEqual({ config: { horarios: ['09:15'], llegada: '07:00', planificadores: [], pasanAsistencia: [] }, error: null })
  })

  it('is a 404 for someone who does not plan, or with Dream Team off', async () => {
    respuesta = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    await expect(DpsConfiguracionPage()).rejects.toThrow('NEXT_NOT_FOUND')
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(DpsConfiguracionPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('hands a failed read to the island', async () => {
    respuesta = { data: null, error: { code: 'XX000', message: 'boom' } }
    render(await DpsConfiguracionPage())
    expect(ultima()).toEqual({ config: null, error: 'No se pudo cargar la configuración. Actualiza la página.' })
  })

  it('sends a signed-out visitor to /login', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    await expect(DpsConfiguracionPage()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})
