/**
 * The admin season actions (T9a of odd/tasks/planner-gdv.md; S19, S20): a new
 * season is born in planning and inactive, and no create or edit can take
 * another season's place in its cohort. The admin-only guard stays.
 */
import { createSeason, updateSeason } from '@/lib/actions/season.actions'

const requireRole = jest.fn()
const createSupabaseAdminClient = jest.fn()
const revalidatePath = jest.fn()
const redirect = jest.fn()

jest.mock('@/lib/auth/requireAuth', () => ({ requireRole: (roles: string | string[]) => requireRole(roles) }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
jest.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))

const TEMPORADAS = [
  { id: 'a1', nombre: '2025 - I', fecha_inicio: '2025-02-10', fecha_fin: '2026-02-08' },
  { id: 'a2', nombre: '2025 - II', fecha_inicio: '2025-10-06', fecha_fin: '2026-10-04' },
  { id: 'a3', nombre: '2026-I', fecha_inicio: '2026-02-16', fecha_fin: '2027-02-05' },
  { id: 'a4', nombre: '2026-II', fecha_inicio: '2026-10-12', fecha_fin: '2027-10-10' },
]

function clienteAdmin({ errorEscritura = null as { message: string } | null } = {}) {
  const single = jest.fn(async () => ({ data: { id: 'nueva' }, error: errorEscritura }))
  const insert = jest.fn(() => ({ select: () => ({ single }) }))
  const eq = jest.fn(async () => ({ error: errorEscritura }))
  const update = jest.fn(() => ({ eq }))
  const select = jest.fn(async () => ({ data: TEMPORADAS, error: null }))
  const from = jest.fn(() => ({ select, insert, update }))
  return { cliente: { from }, from, select, insert, update, eq }
}

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue({ authId: 'auth-1' })
  createSupabaseAdminClient.mockReset()
  revalidatePath.mockReset()
  redirect.mockReset()
})

describe('createSeason', () => {
  it('creates the season in planning and inactive, whatever the caller sends', async () => {
    const db = clienteAdmin()
    createSupabaseAdminClient.mockReturnValue(db.cliente)

    const datos = { nombre: ' 2027   -  I ', fecha_inicio: '2027-02-08', fecha_fin: '2028-02-06', activa: true }
    const resultado = await createSeason(datos as unknown as Parameters<typeof createSeason>[0])

    expect(resultado).toBeUndefined()
    expect(requireRole).toHaveBeenCalledWith('admin')
    expect(db.insert).toHaveBeenCalledWith([
      { nombre: '2027 - I', fecha_inicio: '2027-02-08', fecha_fin: '2028-02-06', activa: false, estado: 'planificacion' },
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida/temporadas')
    expect(redirect).toHaveBeenCalledWith('/grupos-vida/temporadas')
  })

  it.each([
    [{ nombre: 'Temporada 2027', fecha_inicio: '2027-02-08', fecha_fin: '2028-02-06' }, 'nombre'],
    [{ nombre: '2026 ii', fecha_inicio: '2027-10-11', fecha_fin: '2028-10-08' }, 'nombre'],
    [{ nombre: '2026b-I', fecha_inicio: '2026-01-05', fecha_fin: '2027-01-03' }, 'fecha_inicio'],
  ])('refuses a season that would break its cohort, without writing (%#)', async (datos, campo) => {
    const db = clienteAdmin()
    createSupabaseAdminClient.mockReturnValue(db.cliente)

    const resultado = await createSeason(datos)

    expect(resultado).toMatchObject({ campo, error: expect.any(String) })
    expect(db.insert).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('returns the write error instead of throwing it', async () => {
    const db = clienteAdmin({ errorEscritura: { message: 'boom' } })
    createSupabaseAdminClient.mockReturnValue(db.cliente)

    await expect(createSeason({ nombre: '2027-I', fecha_inicio: '2027-02-08', fecha_fin: '2028-02-06' }))
      .resolves.toEqual({ error: 'Error al crear temporada: boom' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('keeps the admin-only guard', async () => {
    requireRole.mockRejectedValue(new Error('No autorizado'))

    await expect(createSeason({ nombre: '2027-I', fecha_inicio: '2027-02-08', fecha_fin: '2028-02-06' })).rejects.toThrow('No autorizado')
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })
})

describe('updateSeason', () => {
  const base = { nombre: '2026-I', fecha_inicio: '2026-02-16', fecha_fin: '2027-02-05', activa: true }

  it('saves a safe edit with the name normalized and keeps activa as sent', async () => {
    const db = clienteAdmin()
    createSupabaseAdminClient.mockReturnValue(db.cliente)

    const resultado = await updateSeason('a3', { ...base, nombre: '2026  -  I', fecha_fin: '2027-02-07' })

    expect(resultado).toBeUndefined()
    expect(requireRole).toHaveBeenCalledWith('admin')
    expect(db.update).toHaveBeenCalledWith({ nombre: '2026 - I', fecha_inicio: '2026-02-16', fecha_fin: '2027-02-07', activa: true })
    expect(db.eq).toHaveBeenCalledWith('id', 'a3')
    expect(redirect).toHaveBeenCalledWith('/grupos-vida/temporadas')
  })

  it.each([
    [{ nombre: 'Temporada 2026' }, 'nombre', 'El nombre debe terminar en la cohorte: I (empieza en febrero) o II (empieza en octubre), por ejemplo «2027 - I».'],
    [{ nombre: '2026 - II' }, 'nombre', '«2026-I» es de la cohorte I: el nombre debe seguir terminando en I.'],
    [{ nombre: '2025.I' }, 'nombre', 'Ya existe una temporada llamada «2025 - I».'],
    [{ fecha_inicio: '2025-02-01' }, 'fecha_inicio', 'La temporada debe empezar después del 2025-02-10, inicio de «2025 - I», la anterior de la cohorte I.'],
  ])('refuses an edit that would move the cohort origin, without writing (%#)', async (cambios, campo, error) => {
    const db = clienteAdmin()
    createSupabaseAdminClient.mockReturnValue(db.cliente)

    await expect(updateSeason('a3', { ...base, ...cambios })).resolves.toEqual({ campo, error })
    expect(db.update).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('refuses moving the earlier season past the next one of its cohort', async () => {
    const db = clienteAdmin()
    createSupabaseAdminClient.mockReturnValue(db.cliente)

    await expect(updateSeason('a1', { nombre: '2025 - I', fecha_inicio: '2026-03-02', fecha_fin: '2027-03-01', activa: false }))
      .resolves.toEqual({ campo: 'fecha_inicio', error: 'La temporada debe empezar antes del 2026-02-16, inicio de «2026-I», la siguiente de la cohorte I.' })
    expect(db.update).not.toHaveBeenCalled()
  })

  it('keeps the admin-only guard', async () => {
    requireRole.mockRejectedValue(new Error('No autorizado'))

    await expect(updateSeason('a3', base)).rejects.toThrow('No autorizado')
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })
})
