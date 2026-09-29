/**
 * Server loader of /grupos-vida/directores.
 *
 * It reads with the admin client only AFTER checking the caller's role (admin,
 * pastor or director-general), builds the view model from the rows, and for a
 * director general returns only their own card, read-only, and only the stage
 * directors of their own segments. The admin client is a recorder: a Proxy that
 * logs the chained calls and resolves, when awaited, with the fixture rows of
 * the table.
 */
import { cargarVistaDirectores } from '@/lib/platform/grupos-vida/directores-datos'

const createSupabaseAdminClient = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))

const ROL = { dg: 'rol-dg', admin: 'rol-admin', pastor: 'rol-pastor', etapa: 'rol-etapa' }

const SEG_A = 'seg-a'
const SEG_B = 'seg-b'
const U_MARIA = 'u-maria' // director general, segment A
const U_EDUARDO = 'u-eduardo' // director general + admin, both segments
const U_ANA = 'u-ana' // stage director of A
const U_BEA = 'u-bea' // stage director of B
const U_SIN = 'u-sin' // holds the role director-etapa, no segmento_lideres row

let tablas: Record<string, unknown[]>
let llamadas: { table: string; ops: { method: string; args: unknown[] }[] }[]
let error: { table: string; message: string } | null

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
                Promise.resolve(
                  error?.table === table ? { data: null, error: { message: error.message } } : { data: tablas[table] ?? [], error: null },
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
  llamadas = []
  error = null
  tablas = {
    roles_sistema: [
      { id: ROL.dg, nombre_interno: 'director-general' },
      { id: ROL.admin, nombre_interno: 'admin' },
      { id: ROL.pastor, nombre_interno: 'pastor' },
      { id: ROL.etapa, nombre_interno: 'director-etapa' },
      { id: 'rol-lider', nombre_interno: 'lider' },
    ],
    segmentos: [
      { id: SEG_A, nombre: 'Matrimonios' },
      { id: SEG_B, nombre: 'Mujeres +36' },
    ],
    grupos: [
      { id: 'g1', segmento_id: SEG_A, activo: true, eliminado: false, estado_aprobacion: 'aprobado' },
      { id: 'g2', segmento_id: SEG_A, activo: true, eliminado: false, estado_aprobacion: 'aprobado' },
      { id: 'g3', segmento_id: SEG_B, activo: true, eliminado: false, estado_aprobacion: 'aprobado' },
    ],
    segmento_lideres: [
      { id: 'sl-ana', usuario_id: U_ANA, segmento_id: SEG_A, tipo_lider: 'director_etapa' },
      { id: 'sl-bea', usuario_id: U_BEA, segmento_id: SEG_B, tipo_lider: 'director_etapa' },
    ],
    director_etapa_grupos: [
      { director_etapa_id: 'sl-ana', grupo_id: 'g1' },
      { director_etapa_id: 'sl-bea', grupo_id: 'g3' },
    ],
    director_general_segmentos: [
      { usuario_id: U_MARIA, segmento_id: SEG_A, alcance: 'directores' },
      { usuario_id: U_EDUARDO, segmento_id: SEG_A, alcance: 'segmento' },
      { usuario_id: U_EDUARDO, segmento_id: SEG_B, alcance: 'segmento' },
    ],
    dg_directores_etapa: [{ dg_usuario_id: U_MARIA, segmento_lider_id: 'sl-ana' }],
    usuario_roles: [
      { usuario_id: U_MARIA, rol_id: ROL.dg },
      { usuario_id: U_EDUARDO, rol_id: ROL.dg },
      { usuario_id: U_EDUARDO, rol_id: ROL.admin },
      { usuario_id: U_SIN, rol_id: ROL.etapa },
    ],
    usuarios: [
      { id: U_MARIA, nombre: 'María', apellido: 'Pacheco', auth_id: 'auth-maria', direccion_id: null },
      { id: U_EDUARDO, nombre: 'Eduardo', apellido: 'Durán', auth_id: 'auth-eduardo', direccion_id: null },
      { id: U_ANA, nombre: 'Ana', apellido: 'Álvarez', auth_id: 'auth-ana', direccion_id: 'dir-ana' },
      { id: U_BEA, nombre: 'Bea', apellido: null, auth_id: null, direccion_id: null },
      { id: U_SIN, nombre: 'Sin', apellido: 'Segmento', auth_id: null, direccion_id: null },
    ],
    direcciones: [{ id: 'dir-ana', parroquia_id: 'par-1' }],
    parroquias: [{ id: 'par-1', municipio_id: 'mun-1' }],
    municipios: [{ id: 'mun-1', nombre: 'Cabudare' }],
  }
  createSupabaseAdminClient.mockReset().mockImplementation(() => recorder())
})

describe('cargarVistaDirectores — gate', () => {
  it.each([[['lider']], [['director-etapa']], [['miembro']], [[]]])('returns no data and reads nothing for the roles %j', async (roles) => {
    const res = await cargarVistaDirectores({ authId: 'auth-x', roles })
    expect(res).toBeNull()
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it.each([[['admin']], [['pastor']], [['admin', 'pastor', 'director-general']]])('loads for the roles %j', async (roles) => {
    const res = await cargarVistaDirectores({ authId: 'auth-x', roles })
    expect(res).not.toBeNull()
    expect(res?.soloLectura).toBe(false)
  })
})

describe('cargarVistaDirectores — admin and pastor', () => {
  it('builds every card and every stage director from the rows', async () => {
    const vista = await cargarVistaDirectores({ authId: 'auth-x', roles: ['admin'] })

    expect(vista?.generales.map((g) => [g.nombre, g.otroRol, g.editable])).toEqual([
      ['Eduardo Durán', 'Administrador', true],
      ['María Pacheco', null, true],
    ])
    expect(vista?.etapa.map((f) => [f.nombre, f.segmentoNombre, f.ciudad, f.tieneCuenta, f.gruposActivos])).toEqual([
      ['Ana Álvarez', 'Matrimonios', 'Cabudare', true, 1],
      ['Bea', 'Mujeres +36', null, false, 1],
    ])
    const maria = vista?.generales.find((g) => g.usuarioId === U_MARIA)
    expect(maria?.segmentos[0]).toMatchObject({ alcance: 'directores', gruposVisibles: 1 })
  })

  it('builds the Por ordenar strip from the whole platform', async () => {
    const vista = await cargarVistaDirectores({ authId: 'auth-x', roles: ['pastor'] })
    expect(vista?.porOrdenar.map((i) => [i.tipo, i.cantidad])).toEqual([
      ['grupos-activos-sin-director', 1], // g2 has no director
      ['personas-sin-segmento', 1],
    ])
  })

  it('only reads; it never writes', async () => {
    await cargarVistaDirectores({ authId: 'auth-x', roles: ['admin'] })
    const metodos = llamadas.flatMap((c) => c.ops.map((o) => o.method))
    expect(metodos).not.toEqual(expect.arrayContaining(['insert']))
    expect(metodos.filter((m) => ['insert', 'update', 'delete', 'upsert'].includes(m))).toEqual([])
  })

  it('throws when a read fails, instead of showing partial numbers', async () => {
    error = { table: 'grupos', message: 'boom' }
    await expect(cargarVistaDirectores({ authId: 'auth-x', roles: ['admin'] })).rejects.toThrow(/grupos.*boom/)
  })
})

describe('cargarVistaDirectores — director general (read-only)', () => {
  it('returns only their own card, flagged read-only, with their own segments and no strip', async () => {
    const vista = await cargarVistaDirectores({ authId: 'auth-maria', roles: ['director-general'] })

    expect(vista?.soloLectura).toBe(true)
    expect(vista?.generales.map((g) => [g.nombre, g.editable])).toEqual([['María Pacheco', false]])
    expect(vista?.generales[0].segmentosDisponibles).toEqual([])
    expect(vista?.porOrdenar).toEqual([])
    // María only holds segment A: no stage director of segment B, no chip for it
    expect(vista?.etapa.map((f) => f.nombre)).toEqual(['Ana Álvarez'])
    expect(vista?.segmentos.map((s) => s.id)).toEqual([SEG_A])
    expect(vista?.totales).toEqual({ generales: 1, etapa: 1 })
  })

  it('does not report "todos" for a director general who holds only some segments', async () => {
    const vista = await cargarVistaDirectores({ authId: 'auth-maria', roles: ['director-general'] })
    expect(vista?.generales[0].todos).toBe(false)
  })

  it('returns an empty view when the director general holds no segment', async () => {
    tablas.director_general_segmentos = []
    const vista = await cargarVistaDirectores({ authId: 'auth-maria', roles: ['director-general'] })
    expect(vista?.etapa).toEqual([])
    expect(vista?.segmentos).toEqual([])
    expect(vista?.generales[0].resumen).toBe('Sin segmentos asignados')
  })

  it('returns an empty view when the account is not linked to a person', async () => {
    const vista = await cargarVistaDirectores({ authId: 'auth-desconocido', roles: ['director-general'] })
    expect(vista).toMatchObject({ soloLectura: true, generales: [], etapa: [], segmentos: [], porOrdenar: [] })
  })

  it('a person who is director general and admin is not read-only', async () => {
    const vista = await cargarVistaDirectores({ authId: 'auth-eduardo', roles: ['director-general', 'admin'] })
    expect(vista?.soloLectura).toBe(false)
    expect(vista?.generales).toHaveLength(2)
  })
})
