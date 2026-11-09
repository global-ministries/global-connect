/**
 * /dps/configuracion (RSC, odd/tasks/dps-asistencia-pco.md, T9):
 * reads dps_config_leer, which requires a planner; anyone else gets a 404.
 * Writes are checked by the database (configurators only), so the page hands
 * the island the configuration and the four lists by position (S12.2,
 * dps_lista_leer, each with whether the caller edits it). The island is
 * mocked.
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
let listas: Record<string, { data: unknown; error: unknown }> = {}
const rpc = jest.fn(async (nombre: string, args?: { p_lista?: string }) =>
  nombre === 'dps_lista_leer' ? (listas[args?.p_lista ?? ''] ?? { data: null, error: { message: 'boom' } }) : respuesta,
)
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }) }))

const recibidas: unknown[] = []
jest.mock('@/components/dps/configuracion-client', () => ({
  ConfiguracionClient: (props: unknown) => {
    recibidas.push(props)
    return <div data-testid="isla" />
  },
}))

import DpsConfiguracionPage, { metadata } from '@/app/(auth)/dps/configuracion/page'

const ultima = () => recibidas[recibidas.length - 1] as Record<string, unknown>

beforeEach(() => {
  jest.clearAllMocks()
  recibidas.length = 0
  isDreamTeamEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  respuesta = { data: { horarios: ['09:15'], llegada: '07:00', planificadores: [], pasan_asistencia: [] }, error: null }
  listas = {
    productores: { data: { lista: 'productores', puede_editar: true, personas: [] }, error: null },
    hosts: { data: { lista: 'hosts', puede_editar: false, personas: [] }, error: null },
    comunicadores: { data: { lista: 'comunicadores', puede_editar: false, personas: [] }, error: null },
  }
})

describe('/dps/configuracion', () => {
  it('reads the configuration', async () => {
    render(await DpsConfiguracionPage())
    expect(metadata).toEqual({ title: 'Configuración — DPS' })
    expect(rpc).toHaveBeenCalledWith('dps_config_leer', undefined)
    expect(screen.getByTestId('isla')).toBeInTheDocument()
    expect(ultima()).toMatchObject({ config: { horarios: ['09:15'], llegada: '07:00', planificadores: [], pasanAsistencia: [] }, error: null })
  })

  it('reads the four lists by position; one that fails reads empty and read-only (S12.2)', async () => {
    render(await DpsConfiguracionPage())
    for (const lista of ['productores', 'hosts', 'comunicadores', 'cantantes']) expect(rpc).toHaveBeenCalledWith('dps_lista_leer', { p_lista: lista })
    expect(ultima().listas).toEqual({
      productores: { lista: 'productores', puedeEditar: true, personas: [] },
      hosts: { lista: 'hosts', puedeEditar: false, personas: [] },
      comunicadores: { lista: 'comunicadores', puedeEditar: false, personas: [] },
      cantantes: { lista: 'cantantes', puedeEditar: false, personas: [] },
    })
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
    expect(ultima()).toMatchObject({ config: null, error: 'No se pudo cargar la configuración. Actualiza la página.' })
  })

  it('sends a signed-out visitor to /login', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    await expect(DpsConfiguracionPage()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})
