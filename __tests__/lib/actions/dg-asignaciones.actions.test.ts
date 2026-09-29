/**
 * The pre-existing write actions on director general assignments
 * (asignarSegmentoDG, desasignarSegmentoDG, asignarDEaDG, desasignarDEaDG) are
 * server actions callable by anyone with a session, and they write with the
 * admin client. They used to admit the director-general role, which let a
 * director general widen their own scope; they are now gated to admin and
 * pastor and revalidate the /grupos-vida/directores page.
 */
import { asignarSegmentoDG, desasignarSegmentoDG } from '@/lib/actions/dg-segmentos.actions'
import { asignarDEaDG, desasignarDEaDG } from '@/lib/actions/dg-directores.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const getUserWithRoles = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

const U = '11111111-1111-4111-8111-111111111111'
const SEG = '22222222-2222-4222-8222-222222222222'
const DE = '44444444-4444-4444-8444-444444444441'

/** Any chained insert/delete/eq resolves without error. */
function adminOk() {
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'delete', 'eq']) builder[m] = jest.fn(() => builder)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
  return { from: jest.fn(() => builder) }
}

const acciones = [
  ['asignarSegmentoDG', () => asignarSegmentoDG({ usuarioId: U, segmentoId: SEG })],
  ['desasignarSegmentoDG', () => desasignarSegmentoDG({ usuarioId: U, segmentoId: SEG })],
  ['asignarDEaDG', () => asignarDEaDG({ dgUsuarioId: U, segmentoLiderId: DE })],
  ['desasignarDEaDG', () => desasignarDEaDG({ dgUsuarioId: U, segmentoLiderId: DE })],
] as const

describe.each(acciones)('%s', (_nombre, ejecutar) => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset().mockResolvedValue({})
    createSupabaseAdminClient.mockReset().mockImplementation(() => adminOk())
    getUserWithRoles.mockReset()
    revalidatePath.mockReset()
  })

  it('refuses a director general and writes nothing', async () => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'a' }, roles: ['director-general'] })
    const res = await ejecutar()
    expect(res).toMatchObject({ success: false, error: 'No autorizado' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('refuses a request without a session', async () => {
    getUserWithRoles.mockResolvedValue(null)
    expect(await ejecutar()).toMatchObject({ success: false, error: 'No autenticado' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it.each([['admin'], ['pastor']])('lets the role %s write and revalidates the new page', async (rol) => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'a' }, roles: [rol] })
    expect(await ejecutar()).toEqual({ success: true })
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida/directores')
  })
})
