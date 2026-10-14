/**
 * R3b — the dashboard points an adult parent to Mis hijos, and during a
 * precheck window offers "Voy en camino" right there.
 */
import { render, screen } from '@testing-library/react'

import { TarjetaMisHijosDashboard } from '@/components/dashboard/TarjetaMisHijosDashboard'
import { cargarMisHijosDashboard } from '@/app/(auth)/dashboard/mis-hijos-dashboard'
import { parseMisHijos } from '@/lib/platform/ninos/mis-hijos'
import type { MisPrechecks } from '@/lib/platform/ninos/precheck'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: jest.fn() }) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/platform/ninos/fecha', () => ({ hoyEnCaracas: () => '2026-10-11' }))

const createServer = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock

const base = {
  apellido: 'Pérez', fecha_nacimiento: '2021-05-05', genero: 'Masculino', edad: 5, tiene_ficha: true, grado: null,
  alergias: null, necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
  autoriza_imagen: null, escolarizado: null, autorizados: [], otros_padres: [], puede_editar_identidad: true,
}
const filasHijos = [{ ...base, id: 'h1', nombre: 'Luis' }, { ...base, id: 'h2', nombre: 'Eva' }]
const hijos = parseMisHijos(filasHijos)
const sinVentana: MisPrechecks = { servicios: [], avisos: [] }
const enVentana: MisPrechecks = {
  servicios: [{ turnoId: 't1', nombre: 'Primer servicio', hora: '09:00:00', campus: 'Centro' }],
  avisos: [],
}

describe('TarjetaMisHijosDashboard', () => {
  it('is hidden without children', () => {
    const { container } = render(<TarjetaMisHijosDashboard hijos={[]} prechecks={enVentana} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('links to the Mis hijos section, with no Voy en camino outside the window', () => {
    render(<TarjetaMisHijosDashboard hijos={hijos} prechecks={sinVentana} />)
    expect(screen.getByRole('heading', { name: 'Mis hijos' })).toBeInTheDocument()
    expect(screen.getByText(/Luis y Eva/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a mis hijos' })).toHaveAttribute('href', '/perfil#mis-hijos')
    expect(screen.queryByRole('button', { name: 'Voy en camino' })).not.toBeInTheDocument()
  })

  it('offers Voy en camino during a precheck window', () => {
    render(<TarjetaMisHijosDashboard hijos={hijos} prechecks={enVentana} />)
    expect(screen.getByRole('button', { name: 'Voy en camino' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a mis hijos' })).toBeInTheDocument()
  })
})

describe('cargarMisHijosDashboard', () => {
  function setup({
    user = { id: 'auth-1' } as object | null,
    fechaNacimiento = '1990-01-01' as string | null,
    hijosData = filasHijos as unknown,
    hijosError = null as unknown,
    prechecksData = { servicios: [{ turno_id: 't1', nombre: 'Primer servicio', hora: '09:00:00', campus: 'Centro' }], avisos: [] } as unknown,
  } = {}) {
    const rpc = jest.fn((nombre: string) =>
      Promise.resolve(
        nombre === 'ninos_mis_hijos' ? { data: hijosData, error: hijosError } : { data: prechecksData, error: null },
      ),
    )
    createServer.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
    const maybeSingle = jest.fn().mockResolvedValue({ data: { fecha_nacimiento: fechaNacimiento }, error: null })
    const eq = jest.fn(() => ({ maybeSingle }))
    const select = jest.fn(() => ({ eq }))
    createAdmin.mockReturnValue({ from: jest.fn(() => ({ select })) })
    return { rpc, eq }
  }

  beforeEach(() => jest.clearAllMocks())

  it('loads the children and the precheck window of an adult parent', async () => {
    const { rpc, eq } = setup()
    const datos = await cargarMisHijosDashboard()
    expect(eq).toHaveBeenCalledWith('auth_id', 'auth-1')
    expect(rpc).toHaveBeenCalledWith('ninos_mis_hijos')
    expect(rpc).toHaveBeenCalledWith('ninos_mis_prechecks')
    expect(datos?.hijos.map((h) => h.id)).toEqual(['h1', 'h2'])
    expect(datos?.prechecks.servicios).toHaveLength(1)
  })

  it('never shows it to a minor', async () => {
    const { rpc } = setup({ fechaNacimiento: '2010-06-01' })
    expect(await cargarMisHijosDashboard()).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('is empty for a parent without children, without a session, or on failure', async () => {
    setup({ hijosData: [] })
    expect(await cargarMisHijosDashboard()).toBeNull()
    setup({ user: null })
    expect(await cargarMisHijosDashboard()).toBeNull()
    createServer.mockRejectedValue(new Error('boom'))
    expect(await cargarMisHijosDashboard()).toBeNull()
  })

  it('hides the card quietly and logs when the children RPC fails', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    setup({ hijosError: { message: 'rpc down' } })
    expect(await cargarMisHijosDashboard()).toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Mis hijos'), 'rpc down')
    log.mockRestore()
  })

  it('hides the card quietly and logs when loading throws', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    createServer.mockRejectedValue(new Error('boom'))
    expect(await cargarMisHijosDashboard()).toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Mis hijos'), expect.any(Error))
    log.mockRestore()
  })
})
