/**
 * Role gate: creating, editing and deleting a segment is admin only, the same
 * as the page offers it.
 *
 * eliminarSegmento — the server-side guard. A segment with any group row (active,
 * pending, inactive or soft-deleted), any segmento_lideres row or any
 * director_general_segmentos row is refused with a clear message, whatever the
 * interface did, and nothing is deleted. The database foreign keys stay as the
 * last line: their error is answered with a clear message, never a raw one.
 * Note: director_general_segmentos cascades on delete, so without this guard
 * deleting a segment would silently drop the general directors' assignments.
 */
import { crearSegmento, editarSegmento, eliminarSegmento } from '@/lib/actions/segmentos.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const getUserWithRoles = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

const SEG = '22222222-2222-4222-8222-222222222222'

let tablas: Record<string, unknown[]>
let lecturas: { table: string; ops: { method: string; args: unknown[] }[] }[]
let errorLectura: string | null
let errorBorrado: { code?: string; message: string } | null
const eqBorrado = jest.fn()
const from = jest.fn()
let escrituras: { method: 'insert' | 'update'; row: unknown }[]

/** Chain of an insert or update: `.eq().select().single()` resolves with the saved row. */
function cadenaDeEscritura() {
  const cadena: Record<string, unknown> = {}
  cadena.eq = () => cadena
  cadena.select = () => cadena
  cadena.single = () => Promise.resolve({ data: { id: SEG }, error: null })
  return cadena
}

/** The admin client is a recorder: awaiting a chain resolves with the fixture rows of the table. */
function adminRecorder() {
  return {
    from: (table: string) => {
      const call = { table, ops: [] as { method: string; args: unknown[] }[] }
      lecturas.push(call)
      const builder: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'then') {
              return (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) =>
                Promise.resolve(
                  errorLectura === table ? { data: null, error: { message: 'boom' } } : { data: tablas[table] ?? [], error: null },
                ).then(resolve, reject)
            }
            return (...args: unknown[]) => {
              call.ops.push({ method: String(prop), args })
              return builder
            }
          },
        },
      )
      return builder
    },
  }
}

beforeEach(() => {
  tablas = { segmentos: [{ nombre: 'Matrimonios' }], grupos: [], segmento_lideres: [], director_general_segmentos: [] }
  lecturas = []
  errorLectura = null
  errorBorrado = null
  eqBorrado.mockReset().mockImplementation(() => Promise.resolve({ error: errorBorrado }))
  escrituras = []
  from.mockReset().mockImplementation(() => ({
    delete: () => ({ eq: eqBorrado }),
    insert: (row: unknown) => {
      escrituras.push({ method: 'insert', row })
      return cadenaDeEscritura()
    },
    update: (row: unknown) => {
      escrituras.push({ method: 'update', row })
      return cadenaDeEscritura()
    },
  }))
  createSupabaseServerClient.mockReset().mockResolvedValue({ from })
  createSupabaseAdminClient.mockReset().mockImplementation(() => adminRecorder())
  getUserWithRoles.mockReset().mockResolvedValue({ user: { id: 'a' }, roles: ['admin'] })
  revalidatePath.mockReset()
})

const grupo = (extra: Record<string, unknown> = {}) => ({
  activo: true,
  eliminado: false,
  estado_aprobacion: 'aprobado',
  ...extra,
})

describe.each([
  ['crearSegmento', () => crearSegmento({ nombre: 'Jóvenes' })],
  ['editarSegmento', () => editarSegmento(SEG, { nombre: 'Jóvenes' })],
  ['eliminarSegmento', () => eliminarSegmento(SEG)],
])('%s — admin only', (_nombre, ejecutar) => {
  it('lets an admin through', async () => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'a' }, roles: ['admin'] })
    expect(await ejecutar()).toMatchObject({ success: true })
  })

  it.each([['pastor'], ['director-general'], ['director-etapa'], ['lider']])('refuses the role %s and writes nothing', async (rol) => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'a' }, roles: [rol] })
    expect(await ejecutar()).toEqual({ success: false, error: 'No autorizado' })
    expect(from).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('lets a person with several roles through when admin is among them', async () => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'a' }, roles: ['pastor', 'admin'] })
    expect(await ejecutar()).toMatchObject({ success: true })
  })

  it('refuses a request without a session', async () => {
    getUserWithRoles.mockResolvedValue(null)
    expect(await ejecutar()).toEqual({ success: false, error: 'No autenticado' })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('crearSegmento and editarSegmento — columns', () => {
  // public.segmentos has only id, nombre and campus_id: sending any other column fails the write.
  it('creates a segment sending only the name', async () => {
    expect(await crearSegmento({ nombre: '  Jóvenes  ', descripcion: 'ignorada' } as never)).toMatchObject({ success: true })
    expect(escrituras).toEqual([{ method: 'insert', row: { nombre: '  Jóvenes  ' } }])
  })

  it('edits a segment sending only the name', async () => {
    expect(await editarSegmento(SEG, { nombre: 'Jóvenes', descripcion: 'ignorada' } as never)).toMatchObject({ success: true })
    expect(escrituras).toEqual([{ method: 'update', row: { nombre: 'Jóvenes' } }])
  })
})

describe('eliminarSegmento — role gate (unchanged)', () => {
  it('refuses a request without a session and reads nothing', async () => {
    getUserWithRoles.mockResolvedValue(null)
    expect(await eliminarSegmento(SEG)).toEqual({ success: false, error: 'No autenticado' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('refuses a role outside the allowed ones and deletes nothing', async () => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'a' }, roles: ['lider'] })
    expect(await eliminarSegmento(SEG)).toEqual({ success: false, error: 'No autorizado' })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('eliminarSegmento — guard', () => {
  it('deletes a segment with nothing attached and revalidates the list', async () => {
    expect(await eliminarSegmento(SEG)).toEqual({ success: true })
    expect(from).toHaveBeenCalledWith('segmentos')
    expect(eqBorrado).toHaveBeenCalledWith('id', SEG)
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida/segmentos')
  })

  it('looks for what is attached to this segment only, in the three tables', async () => {
    await eliminarSegmento(SEG)
    for (const tabla of ['grupos', 'segmento_lideres', 'director_general_segmentos']) {
      const lectura = lecturas.find((l) => l.table === tabla)
      expect(lectura?.ops).toContainEqual({ method: 'eq', args: ['segmento_id', SEG] })
    }
  })

  it('refuses a segment with active groups with the count and does not delete', async () => {
    tablas.grupos = [grupo(), grupo()]
    expect(await eliminarSegmento(SEG)).toEqual({
      success: false,
      error: 'No se puede eliminar Matrimonios: tiene 2 grupos activos.',
    })
    expect(from).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['an inactive group', { grupos: [grupo({ activo: false })] }],
    ['a pending group', { grupos: [grupo({ activo: false, estado_aprobacion: 'pendiente' })] }],
    ['a soft-deleted group', { grupos: [grupo({ eliminado: true })] }],
    ['a leader row', { segmento_lideres: [{ id: 'sl', segmento_id: SEG, tipo_lider: 'lider' }] }],
    ['a director de etapa row', { segmento_lideres: [{ id: 'sl', segmento_id: SEG, tipo_lider: 'director_etapa' }] }],
    ['a general director row', { director_general_segmentos: [{ segmento_id: SEG }] }],
  ] as const)('refuses a segment that only has %s', async (_nombre, filas) => {
    Object.assign(tablas, filas)
    const res = await eliminarSegmento(SEG)
    expect(res).toMatchObject({ success: false })
    expect((res as { error: string }).error).toMatch(/^No se puede eliminar Matrimonios: tiene /)
    expect(from).not.toHaveBeenCalled()
  })

  it('does not delete when a read of the guard fails', async () => {
    errorLectura = 'grupos'
    const res = await eliminarSegmento(SEG)
    expect(res).toMatchObject({ success: false })
    expect(from).not.toHaveBeenCalled()
  })

  it('answers a foreign key violation with a clear message, not the raw database error', async () => {
    errorBorrado = { code: '23503', message: 'update or delete on table "segmentos" violates foreign key constraint "x"' }
    const res = await eliminarSegmento(SEG)
    expect(res).toEqual({ success: false, error: 'No se puede eliminar el segmento: tiene información asociada.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('keeps returning the database message for any other delete error', async () => {
    errorBorrado = { code: '42501', message: 'permission denied' }
    expect(await eliminarSegmento(SEG)).toEqual({ success: false, error: 'permission denied' })
  })
})
