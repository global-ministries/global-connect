/**
 * Server loader of /grupos-vida/segmentos.
 *
 * It reads with the admin client only AFTER checking the caller's role, keeps
 * who sees what (admin and pastor every segment, a director general only theirs,
 * a director de etapa only theirs, nobody else), reads each table once (no N+1)
 * and builds the list with the pure view model. The admin client is a recorder:
 * a Proxy that logs the chained calls and resolves, when awaited, with the
 * fixture rows of the table.
 */
import { cargarVistaSegmentos } from '@/lib/platform/grupos-vida/segmentos-datos'

const createSupabaseAdminClient = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))

const SEG_MAT = 'seg-mat'
const SEG_MUJ = 'seg-muj'
const SEG_VACIO = 'seg-vacio'
const U_DG = 'u-dg'
const U_DE = 'u-de'

let tablas: Record<string, unknown[]>
let llamadas: { table: string; ops: { method: string; args: unknown[] }[] }[]
let error: string | null

function recorder() {
  return {
    from: (table: string) => {
      const call = { table, ops: [] as { method: string; args: unknown[] }[] }
      llamadas.push(call)
      const builder: unknown = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'then') {
              return (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) =>
                Promise.resolve(error === table ? { data: null, error: { message: 'boom' } } : { data: tablas[table] ?? [], error: null }).then(
                  resolve,
                  reject,
                )
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
  llamadas = []
  error = null
  tablas = {
    usuarios: [{ id: U_DG }],
    segmentos: [
      { id: SEG_MAT, nombre: 'Matrimonios' },
      { id: SEG_MUJ, nombre: 'Mujeres +36' },
      { id: SEG_VACIO, nombre: 'Nuevo' },
    ],
    grupos: [
      { id: 'g1', segmento_id: SEG_MAT, activo: true, eliminado: false, estado_aprobacion: 'aprobado' },
      { id: 'g2', segmento_id: SEG_MAT, activo: false, eliminado: false, estado_aprobacion: 'pendiente' },
      { id: 'g3', segmento_id: SEG_MUJ, activo: true, eliminado: false, estado_aprobacion: 'aprobado' },
    ],
    segmento_lideres: [
      { id: 'sl-1', segmento_id: SEG_MAT, tipo_lider: 'director_etapa', usuario_id: U_DE },
      { id: 'sl-2', segmento_id: SEG_MUJ, tipo_lider: 'director_etapa', usuario_id: 'u-otro' },
    ],
    director_etapa_grupos: [{ director_etapa_id: 'sl-1', grupo_id: 'g1' }],
    director_general_segmentos: [{ usuario_id: U_DG, segmento_id: SEG_MAT }],
  }
  createSupabaseAdminClient.mockReset().mockImplementation(() => recorder())
})

const nombres = (r: Awaited<ReturnType<typeof cargarVistaSegmentos>>) => r?.vista.filas.map((f) => f.nombre)

describe('cargarVistaSegmentos — gate', () => {
  it.each([[['lider']], [['miembro']], [[]]])('returns no data and reads nothing for the roles %j', async (roles) => {
    expect(await cargarVistaSegmentos({ authId: 'auth-x', roles })).toBeNull()
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })
})

describe('cargarVistaSegmentos — who sees what', () => {
  it('shows every segment to an admin, who can manage', async () => {
    const res = await cargarVistaSegmentos({ authId: 'auth-x', roles: ['admin'] })
    expect(nombres(res)).toEqual(['Matrimonios', 'Mujeres +36', 'Nuevo'])
    expect(res?.puedeGestionar).toBe(true)
  })

  it('shows every segment to a pastor, who cannot manage', async () => {
    const res = await cargarVistaSegmentos({ authId: 'auth-x', roles: ['pastor'] })
    expect(nombres(res)).toEqual(['Matrimonios', 'Mujeres +36', 'Nuevo'])
    expect(res?.puedeGestionar).toBe(false)
  })

  it('keeps admin first when the person also is a director general', async () => {
    const res = await cargarVistaSegmentos({ authId: 'auth-x', roles: ['director-general', 'admin'] })
    expect(nombres(res)).toHaveLength(3)
  })

  it('shows a director general only the segments they hold', async () => {
    const res = await cargarVistaSegmentos({ authId: 'auth-dg', roles: ['director-general'] })
    expect(nombres(res)).toEqual(['Matrimonios'])
    expect(res?.puedeGestionar).toBe(false)
    expect(llamadas.find((l) => l.table === 'usuarios')?.ops).toContainEqual({ method: 'eq', args: ['auth_id', 'auth-dg'] })
  })

  it('shows a director general without a users row no segment', async () => {
    tablas.usuarios = []
    expect(nombres(await cargarVistaSegmentos({ authId: 'auth-dg', roles: ['director-general'] }))).toEqual([])
  })

  it('shows a director de etapa only the segments where they are director de etapa', async () => {
    tablas.usuarios = [{ id: U_DE }]
    const res = await cargarVistaSegmentos({ authId: 'auth-de', roles: ['director-etapa'] })
    expect(nombres(res)).toEqual(['Matrimonios'])
  })

  it('does not treat another leader type as a director de etapa', async () => {
    tablas.usuarios = [{ id: 'u-lider' }]
    tablas.segmento_lideres = [{ id: 'sl-9', segmento_id: SEG_MUJ, tipo_lider: 'lider', usuario_id: 'u-lider' }]
    expect(nombres(await cargarVistaSegmentos({ authId: 'auth-l', roles: ['director-etapa'] }))).toEqual([])
  })
})

describe('cargarVistaSegmentos — data', () => {
  it('builds the counts and the footer from the rows', async () => {
    const res = await cargarVistaSegmentos({ authId: 'auth-x', roles: ['admin'] })
    const mat = res?.vista.filas.find((f) => f.id === SEG_MAT)
    expect(mat).toMatchObject({ directores: 1, gruposActivos: 1, gruposPendientes: 1, sinDirector: 0 })
    expect(mat?.bloqueo).toMatch(/^No se puede eliminar Matrimonios: tiene 1 grupo activo, 1 otro grupo, 1 líder asignado y 1 director general asignado\./)
    expect(res?.vista.filas.find((f) => f.id === SEG_VACIO)?.bloqueo).toBeNull()
    expect(res?.vista.pie).toBe('3 segmentos · 2 directores de etapa · 2 grupos activos')
  })

  it('reads each table once, whatever the number of segments', async () => {
    await cargarVistaSegmentos({ authId: 'auth-x', roles: ['admin'] })
    const porTabla = llamadas.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.table]: (acc[l.table] ?? 0) + 1 }), {})
    expect(porTabla).toEqual({
      segmentos: 1,
      grupos: 1,
      segmento_lideres: 1,
      director_etapa_grupos: 1,
      director_general_segmentos: 1,
    })
  })

  it('reads the groups without filtering out deleted rows: they still block a deletion', async () => {
    await cargarVistaSegmentos({ authId: 'auth-x', roles: ['admin'] })
    const ops = llamadas.find((l) => l.table === 'grupos')?.ops.map((o) => o.method)
    expect(ops).not.toContain('eq')
    expect(ops).not.toContain('neq')
  })

  it('throws instead of showing partial numbers when a read fails', async () => {
    error = 'grupos'
    await expect(cargarVistaSegmentos({ authId: 'auth-x', roles: ['admin'] })).rejects.toThrow('Error al leer grupos: boom')
  })
})
