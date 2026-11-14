/**
 * /dps/confirmar/[token] (RSC, public; odd/tasks/dps-asistencia-pco.md,
 * T16b; S14.2, S14.5) — opening the link reads the notice through the
 * service client (dps_aviso_token_leer) and NEVER confirms: link scanners
 * open it too. A malformed token never reaches the database. The button's
 * server action confirms (dps_aviso_token_confirmar). Not indexed, no
 * referrer. The client island is mocked to read its props.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
jest.mock('next/navigation', () => ({ notFound: () => notFound() }))

const isDreamTeamEnabled = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({ isDreamTeamEnabled: () => isDreamTeamEnabled() }))

const rpc = jest.fn()
const createSupabaseAdminClient = jest.fn(() => ({ rpc }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))

const recibidas: { token: string; inicial: { estado: string; fecha: string | null }; onConfirmar: (t: string) => Promise<{ estado: string }> }[] = []
jest.mock('@/components/dps/confirmar-servicio', () => ({
  ConfirmarServicio: (props: (typeof recibidas)[number]) => {
    recibidas.push(props)
    return <div data-testid="isla">{props.inicial.estado}</div>
  },
}))

import ConfirmarPage, { metadata } from '@/app/(public)/dps/confirmar/[token]/page'
import { confirmarServicioPorEnlace } from '@/app/(public)/dps/confirmar/[token]/actions'

const TOKEN = 'k7Qm2x'.padEnd(43, 'A')
const PLAN = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  jest.clearAllMocks()
  recibidas.length = 0
  isDreamTeamEnabled.mockReturnValue(true)
  rpc.mockResolvedValue({ data: { estado: 'por_confirmar', plan_id: PLAN, fecha: '2026-11-15', roles: [], horarios: ['09:00'], llegada: '07:30' }, error: null })
})

async function abrir(token: string) {
  render(await ConfirmarPage({ params: Promise.resolve({ token }) }))
  return recibidas[recibidas.length - 1]
}

describe('/dps/confirmar/[token]', () => {
  it('reads the notice with the token and does not confirm', async () => {
    const props = await abrir(TOKEN)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('dps_aviso_token_leer', { p_token: TOKEN })
    expect(props.token).toBe(TOKEN)
    expect(props.inicial).toMatchObject({ estado: 'por_confirmar', fecha: '2026-11-15' })
    expect(screen.getByTestId('isla')).toHaveTextContent('por_confirmar')
  })

  it('never asks the database for a malformed token', async () => {
    const props = await abrir('corto')
    expect(rpc).not.toHaveBeenCalled()
    expect(props.inicial.estado).toBe('invalido')
  })

  it('shows the error state when the service client cannot be built', async () => {
    createSupabaseAdminClient.mockImplementationOnce(() => {
      throw new Error('sin variables')
    })
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const props = await abrir(TOKEN)
    error.mockRestore()
    expect(props.inicial.estado).toBe('error')
  })

  it('is not found while Dream Team is off', async () => {
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(ConfirmarPage({ params: Promise.resolve({ token: TOKEN }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('is not indexed and sends no referrer', () => {
    expect(metadata).toMatchObject({ robots: { index: false, follow: false }, referrer: 'no-referrer' })
  })

  it('confirms only from the button (the server action)', async () => {
    const props = await abrir(TOKEN)
    expect(props.onConfirmar).toBe(confirmarServicioPorEnlace)
    rpc.mockResolvedValueOnce({ data: { estado: 'confirmado', plan_id: PLAN, fecha: '2026-11-15' }, error: null })
    expect((await confirmarServicioPorEnlace(TOKEN)).estado).toBe('confirmado')
    expect(rpc).toHaveBeenLastCalledWith('dps_aviso_token_confirmar', { p_token: TOKEN })
    expect((await confirmarServicioPorEnlace('x')).estado).toBe('invalido')
  })
})
