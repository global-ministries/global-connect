/**
 * /dps/programacion (RSC, odd/tasks/dps-asistencia-pco.md, T11; S6.4): the
 * plans of the year of ?anio= (else this year in Caracas) from
 * dps_planes_rango, and whether the caller edits (dps_puede_planificar).
 * Whoever does not see DPS gets a 404; a failed read shows its error. S12.3:
 * the four lists by position (dps_lista_leer) feed the suggestions of the
 * Productor, Host, Comunicador and Cantantes cells. The client island is
 * mocked to read its props.
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
jest.mock('@/lib/platform/ninos/fecha', () => ({ hoyEnCaracas: () => '2026-11-04' }))

const getUser = jest.fn()
type Respuesta = { data: unknown; error: unknown }
let respuestas: Record<string, Respuesta> = {}
const rpc = jest.fn(async (nombre: string, args?: { p_lista?: string }) => respuestas[args?.p_lista ? `${nombre}:${args.p_lista}` : nombre] ?? { data: null, error: null })
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }) }))

const recibidas: unknown[] = []
jest.mock('@/components/dps/programacion-client', () => ({
  ProgramacionClient: (props: unknown) => {
    recibidas.push(props)
    return <div data-testid="isla" />
  },
}))

import DpsProgramacionPage, { metadata } from '@/app/(auth)/dps/programacion/page'

const PLAN = { id: 'p1', fecha: '2026-11-08', tipo: 'domingo', titulo: null, semana: null, serie: null, horarios: ['09:15'], llegada: '07:00', campos: {} }
const ultima = () => recibidas[recibidas.length - 1] as Record<string, unknown>
const pagina = async (query: Record<string, string> = {}) => render(await DpsProgramacionPage({ searchParams: Promise.resolve(query) }))

beforeEach(() => {
  jest.clearAllMocks()
  recibidas.length = 0
  isDreamTeamEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  respuestas = { dps_planes_rango: { data: [PLAN], error: null }, dps_puede_planificar: { data: true, error: null } }
})

describe('/dps/programacion', () => {
  it('reads this year and says whether the caller edits', async () => {
    await pagina()
    expect(metadata).toEqual({ title: 'Programación — DPS' })
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2026-01-01', p_hasta: '2026-12-31' })
    expect(rpc).toHaveBeenCalledWith('dps_puede_planificar', undefined)
    expect(screen.getByTestId('isla')).toBeInTheDocument()
    expect(ultima()).toMatchObject({ anio: 2026, hoy: '2026-11-04', editable: true, error: null })
    expect((ultima().planes as { id: string }[]).map((p) => p.id)).toEqual(['p1'])
  })

  it('hands the island the four lists by position; a list that fails reads empty (S12.3)', async () => {
    const ANA = { persona_id: '11111111-1111-4111-8111-111111111111', nombre: 'Ana Pérez', iniciales: 'AP' }
    respuestas['dps_lista_leer:hosts'] = { data: { lista: 'hosts', puede_editar: false, personas: [ANA] }, error: null }
    respuestas['dps_lista_leer:cantantes'] = { data: null, error: { message: 'boom' } }
    await pagina()
    for (const lista of ['productores', 'hosts', 'comunicadores', 'cantantes']) expect(rpc).toHaveBeenCalledWith('dps_lista_leer', { p_lista: lista })
    const listas = ultima().listas as Record<string, { personas: unknown[] }>
    expect(listas.hosts).toEqual({ lista: 'hosts', puedeEditar: false, personas: [{ personaId: ANA.persona_id, nombre: 'Ana Pérez', iniciales: 'AP' }] })
    expect(listas.cantantes).toEqual({ lista: 'cantantes', puedeEditar: false, personas: [] })
    expect(listas.productores.personas).toEqual([])
  })

  it('reads the year of ?anio=, and ignores a malformed one', async () => {
    await pagina({ anio: '2027' })
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2027-01-01', p_hasta: '2027-12-31' })
    expect(ultima()).toMatchObject({ anio: 2027 })
    await pagina({ anio: '27x' })
    expect(ultima()).toMatchObject({ anio: 2026 })
  })

  it('is read-only for whoever sees DPS without planning it (S6)', async () => {
    respuestas.dps_puede_planificar = { data: false, error: null }
    await pagina()
    expect(ultima()).toMatchObject({ editable: false })
    respuestas.dps_puede_planificar = { data: null, error: { message: 'boom' } }
    await pagina()
    expect(ultima()).toMatchObject({ editable: false })
  })

  it('shows the error when the year cannot be read', async () => {
    respuestas.dps_planes_rango = { data: null, error: { code: 'XX000', message: 'boom' } }
    await pagina()
    expect(ultima()).toMatchObject({ planes: [], error: 'No se pudo cargar la programación. Actualiza la página.' })
  })

  it('is a 404 for someone who does not see DPS, or with Dream Team off; asks to sign in without a session', async () => {
    respuestas.dps_planes_rango = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    await expect(pagina()).rejects.toThrow('NEXT_NOT_FOUND')
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(pagina()).rejects.toThrow('NEXT_NOT_FOUND')
    isDreamTeamEnabled.mockReturnValue(true)
    getUser.mockResolvedValueOnce({ data: { user: null } })
    await expect(pagina()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})
