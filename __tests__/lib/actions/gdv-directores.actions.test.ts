/**
 * /grupos-vida/directores server actions.
 *
 * Every action is gated to admin and pastor (a director general is refused, so
 * they cannot widen their own scope), returns `{ success, error? }`, and
 * revalidates the page. The admin client is replaced by a recorder: a Proxy
 * that logs every chained call and resolves, when awaited, with whatever the
 * test's responder returns for that table.
 */
import {
  agregarDirectorGeneral,
  asignarTodosLosSegmentosDG,
  buscarPersonasParaDirectorGeneral,
  cambiarAlcanceDG,
  marcarDirectoresDG,
} from '@/lib/actions/gdv-directores.actions'

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
const SEG_2 = '22222222-2222-4222-8222-222222222223'
const SEG_3 = '22222222-2222-4222-8222-222222222224'
const ROL_DG = '33333333-3333-4333-8333-333333333333'
const DE_A = '44444444-4444-4444-8444-444444444441'
const DE_B = '44444444-4444-4444-8444-444444444442'
const DE_C = '44444444-4444-4444-8444-444444444443'

type Result = { data: unknown; error: null | { message: string; code?: string } }
interface Op {
  readonly method: string
  readonly args: unknown[]
}
interface Call {
  readonly table: string
  readonly ops: Op[]
}

let calls: Call[]
let responder: (call: Call) => Result

const ok = (data: unknown = null): Result => ({ data, error: null })
const fallo = (message: string, code?: string): Result => ({ data: null, error: { message, code } })

function recorder() {
  return {
    from: (table: string) => {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const builder: unknown = new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === 'then') {
              return (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
                Promise.resolve(responder(call)).then(resolve, reject)
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

const opsDe = (table: string, method: string) =>
  calls.filter((c) => c.table === table).flatMap((c) => c.ops.filter((o) => o.method === method))
const escritura = () => calls.filter((c) => c.ops.some((o) => ['insert', 'update', 'delete', 'upsert'].includes(o.method)))
const tiene = (call: Call, method: string, ...args: unknown[]) =>
  call.ops.some((o) => o.method === method && JSON.stringify(o.args) === JSON.stringify(args))

function comoRoles(roles: string[] | null) {
  getUserWithRoles.mockResolvedValue(roles === null ? null : { user: { id: 'auth-1' }, roles })
}

beforeEach(() => {
  calls = []
  responder = () => ok([])
  createSupabaseServerClient.mockReset().mockResolvedValue({})
  createSupabaseAdminClient.mockReset().mockImplementation(() => recorder())
  getUserWithRoles.mockReset()
  revalidatePath.mockReset()
  comoRoles(['admin'])
})

/** Responders that let each action run to success. */
const acciones = [
  {
    nombre: 'agregarDirectorGeneral',
    ejecutar: () => agregarDirectorGeneral(U),
    responder: (c: Call): Result =>
      c.table === 'roles_sistema' ? ok({ id: ROL_DG }) : c.table === 'usuarios' ? ok({ id: U }) : ok([]),
  },
  {
    nombre: 'cambiarAlcanceDG',
    ejecutar: () => cambiarAlcanceDG(U, SEG, 'directores'),
    responder: (): Result => ok([{ id: 'fila' }]),
  },
  {
    nombre: 'marcarDirectoresDG',
    ejecutar: () => marcarDirectoresDG(U, SEG, [DE_A]),
    responder: (c: Call): Result => (c.table === 'segmento_lideres' ? ok([{ id: DE_A }]) : ok([])),
  },
  {
    nombre: 'asignarTodosLosSegmentosDG',
    ejecutar: () => asignarTodosLosSegmentosDG(U),
    responder: (c: Call): Result => (c.table === 'segmentos' ? ok([{ id: SEG }]) : ok([])),
  },
  {
    nombre: 'buscarPersonasParaDirectorGeneral',
    ejecutar: () => buscarPersonasParaDirectorGeneral('maria'),
    responder: (): Result => ok([]),
  },
]

describe.each(acciones)('$nombre — gate', ({ ejecutar, responder: responderOk }) => {
  it('is refused without a session and reads nothing', async () => {
    comoRoles(null)
    const res = await ejecutar()
    expect(res).toMatchObject({ success: false, error: 'No autenticado' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('is refused to a director general, who could otherwise widen their own scope', async () => {
    comoRoles(['director-general'])
    const res = await ejecutar()
    expect(res).toMatchObject({ success: false, error: 'No autorizado' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it.each([['director-etapa'], ['lider'], ['miembro']])('is refused to the role %s', async (rol) => {
    comoRoles([rol])
    expect(await ejecutar()).toMatchObject({ success: false, error: 'No autorizado' })
  })

  it.each([['admin'], ['pastor']])('is allowed to the role %s', async (rol) => {
    comoRoles([rol])
    responder = responderOk
    const res = await ejecutar()
    expect(res.success).toBe(true)
  })

  it('a person with director-general plus admin keeps the admin permission', async () => {
    comoRoles(['director-general', 'admin'])
    responder = responderOk
    expect((await ejecutar()).success).toBe(true)
  })
})

describe('agregarDirectorGeneral', () => {
  const conRol = (rolDeLaPersona: unknown): ((c: Call) => Result) => (c) => {
    if (c.table === 'roles_sistema') return ok({ id: ROL_DG })
    if (c.table === 'usuarios') return ok({ id: U })
    if (c.table === 'usuario_roles') return ok(rolDeLaPersona)
    return ok([])
  }

  it('adds the director-general role row', async () => {
    responder = conRol([])
    const res = await agregarDirectorGeneral(U)

    expect(res).toEqual({ success: true })
    expect(opsDe('usuario_roles', 'insert')).toEqual([{ method: 'insert', args: [{ usuario_id: U, rol_id: ROL_DG }] }])
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida/directores')
  })

  it('never removes another role of the person', async () => {
    responder = conRol([])
    await agregarDirectorGeneral(U)
    expect(opsDe('usuario_roles', 'delete')).toEqual([])
    expect(opsDe('usuario_roles', 'update')).toEqual([])
    expect(opsDe('usuario_roles', 'upsert')).toEqual([])
  })

  it('does nothing and succeeds when the person already holds the role', async () => {
    responder = conRol([{ usuario_id: U }])
    const res = await agregarDirectorGeneral(U)
    expect(res).toEqual({ success: true })
    expect(escritura()).toEqual([])
  })

  it('rejects an id that is not a uuid without touching the database', async () => {
    const res = await agregarDirectorGeneral('no-es-uuid')
    expect(res.success).toBe(false)
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('reports an unknown person and writes nothing', async () => {
    responder = (c) => (c.table === 'roles_sistema' ? ok({ id: ROL_DG }) : c.table === 'usuarios' ? ok(null) : ok([]))
    const res = await agregarDirectorGeneral(U)
    expect(res).toMatchObject({ success: false, error: 'Persona no encontrada' })
    expect(escritura()).toEqual([])
  })

  it('reports a failed person lookup as a failure with its message, not as an unknown person', async () => {
    responder = (c) => (c.table === 'usuarios' ? fallo('lookup down') : conRol([])(c))
    const res = await agregarDirectorGeneral(U)
    expect(res).toEqual({ success: false, error: 'lookup down' })
    expect(escritura()).toEqual([])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports the database error', async () => {
    responder = (c) => (c.table === 'usuario_roles' && c.ops.some((o) => o.method === 'insert') ? fallo('boom') : conRol([])(c))
    expect(await agregarDirectorGeneral(U)).toEqual({ success: false, error: 'boom' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('cambiarAlcanceDG', () => {
  it.each([['segmento'], ['directores']] as const)('sets the scope %s for that person and segment only', async (alcance) => {
    responder = () => ok([{ id: 'fila' }])
    const res = await cambiarAlcanceDG(U, SEG, alcance)

    expect(res).toEqual({ success: true })
    const [call] = calls.filter((c) => c.table === 'director_general_segmentos')
    expect(tiene(call, 'update', { alcance })).toBe(true)
    expect(tiene(call, 'eq', 'usuario_id', U)).toBe(true)
    expect(tiene(call, 'eq', 'segmento_id', SEG)).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida/directores')
  })

  it('rejects a scope other than segmento or directores without touching the database', async () => {
    const res = await cambiarAlcanceDG(U, SEG, 'todo' as never)
    expect(res.success).toBe(false)
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('does not delete the marks when switching to segmento', async () => {
    responder = () => ok([{ id: 'fila' }])
    await cambiarAlcanceDG(U, SEG, 'segmento')
    expect(calls.filter((c) => c.table === 'dg_directores_etapa')).toEqual([])
    expect(opsDe('director_general_segmentos', 'delete')).toEqual([])
  })

  it('reports that the person does not hold the segment when no row was updated', async () => {
    responder = () => ok([])
    const res = await cambiarAlcanceDG(U, SEG, 'directores')
    expect(res).toMatchObject({ success: false })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports the database error', async () => {
    responder = () => fallo('boom')
    expect(await cambiarAlcanceDG(U, SEG, 'directores')).toEqual({ success: false, error: 'boom' })
  })
})

describe('marcarDirectoresDG', () => {
  /** The segment holds DE_A, DE_B and DE_C; the person currently has DE_A and DE_B marked. */
  function segmentoConMarcas(actuales: string[], delSegmento: string[] = [DE_A, DE_B, DE_C]) {
    responder = (c) => {
      if (c.table === 'segmento_lideres') return ok(delSegmento.map((id) => ({ id })))
      if (c.table === 'dg_directores_etapa' && c.ops.some((o) => o.method === 'select')) {
        return ok(actuales.map((id) => ({ segmento_lider_id: id })))
      }
      return ok(null)
    }
  }

  it('makes the marked set equal to the list: inserts the new ones and deletes the missing ones', async () => {
    segmentoConMarcas([DE_A, DE_B])
    const res = await marcarDirectoresDG(U, SEG, [DE_B, DE_C])

    expect(res).toEqual({ success: true })
    expect(opsDe('dg_directores_etapa', 'insert')).toEqual([
      { method: 'insert', args: [[{ dg_usuario_id: U, segmento_lider_id: DE_C }]] },
    ])
    const borrado = calls.find((c) => c.table === 'dg_directores_etapa' && c.ops.some((o) => o.method === 'delete'))
    expect(borrado).toBeDefined()
    expect(tiene(borrado as Call, 'eq', 'dg_usuario_id', U)).toBe(true)
    expect(tiene(borrado as Call, 'in', 'segmento_lider_id', [DE_A])).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida/directores')
  })

  it('only looks at the directors of that segment, so marks of other segments are never touched', async () => {
    segmentoConMarcas([DE_A])
    await marcarDirectoresDG(U, SEG, [])

    const [lectura] = calls.filter((c) => c.table === 'segmento_lideres')
    expect(tiene(lectura, 'eq', 'segmento_id', SEG)).toBe(true)
    expect(tiene(lectura, 'eq', 'tipo_lider', 'director_etapa')).toBe(true)
    // the delete is limited to the ids read from that segment
    const borrado = calls.find((c) => c.table === 'dg_directores_etapa' && c.ops.some((o) => o.method === 'delete'))
    expect(tiene(borrado as Call, 'in', 'segmento_lider_id', [DE_A])).toBe(true)
  })

  it('an empty list clears the marks of that segment and inserts nothing', async () => {
    segmentoConMarcas([DE_A, DE_B])
    const res = await marcarDirectoresDG(U, SEG, [])
    expect(res).toEqual({ success: true })
    expect(opsDe('dg_directores_etapa', 'insert')).toEqual([])
    const borrado = calls.find((c) => c.table === 'dg_directores_etapa' && c.ops.some((o) => o.method === 'delete'))
    expect(tiene(borrado as Call, 'in', 'segmento_lider_id', [DE_A, DE_B])).toBe(true)
  })

  it('writes nothing when the list already matches', async () => {
    segmentoConMarcas([DE_A, DE_B])
    expect(await marcarDirectoresDG(U, SEG, [DE_B, DE_A])).toEqual({ success: true })
    expect(escritura()).toEqual([])
  })

  it('rejects the id of a director that does not belong to the segment and writes nothing', async () => {
    segmentoConMarcas([DE_A], [DE_A, DE_B]) // DE_C belongs to another segment
    const res = await marcarDirectoresDG(U, SEG, [DE_A, DE_C])

    expect(res).toMatchObject({ success: false })
    expect(escritura()).toEqual([])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('counts a repeated id once', async () => {
    segmentoConMarcas([])
    await marcarDirectoresDG(U, SEG, [DE_A, DE_A])
    expect(opsDe('dg_directores_etapa', 'insert')).toEqual([
      { method: 'insert', args: [[{ dg_usuario_id: U, segmento_lider_id: DE_A }]] },
    ])
  })

  it('rejects ids that are not uuids without touching the database', async () => {
    const res = await marcarDirectoresDG(U, SEG, ['x'])
    expect(res.success).toBe(false)
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('stops and reports the error when the insert fails, before deleting anything', async () => {
    responder = (c) => {
      if (c.table === 'segmento_lideres') return ok([{ id: DE_A }, { id: DE_B }])
      if (c.table === 'dg_directores_etapa' && c.ops.some((o) => o.method === 'select')) return ok([{ segmento_lider_id: DE_A }])
      if (c.ops.some((o) => o.method === 'insert')) return fallo('boom')
      return ok(null)
    }
    const res = await marcarDirectoresDG(U, SEG, [DE_B])
    expect(res).toEqual({ success: false, error: 'boom' })
    expect(opsDe('dg_directores_etapa', 'delete')).toEqual([])
  })
})

describe('asignarTodosLosSegmentosDG', () => {
  it('updates the existing rows to scope segmento and inserts the missing ones', async () => {
    responder = (c) => {
      if (c.table === 'segmentos') return ok([{ id: SEG }, { id: SEG_2 }, { id: SEG_3 }])
      if (c.table === 'director_general_segmentos' && c.ops.some((o) => o.method === 'select')) {
        return ok([{ segmento_id: SEG, alcance: 'directores' }])
      }
      return ok(null)
    }
    const res = await asignarTodosLosSegmentosDG(U)

    expect(res).toEqual({ success: true })
    const actualizado = calls.find((c) => c.ops.some((o) => o.method === 'update'))
    expect(actualizado?.table).toBe('director_general_segmentos')
    expect(tiene(actualizado as Call, 'update', { alcance: 'segmento' })).toBe(true)
    expect(tiene(actualizado as Call, 'eq', 'usuario_id', U)).toBe(true)
    expect(tiene(actualizado as Call, 'in', 'segmento_id', [SEG])).toBe(true)
    expect(opsDe('director_general_segmentos', 'insert')).toEqual([
      {
        method: 'insert',
        args: [
          [
            { usuario_id: U, segmento_id: SEG_2, alcance: 'segmento' },
            { usuario_id: U, segmento_id: SEG_3, alcance: 'segmento' },
          ],
        ],
      },
    ])
    expect(opsDe('director_general_segmentos', 'delete')).toEqual([])
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida/directores')
  })

  it('does not rewrite the rows that already have scope segmento', async () => {
    responder = (c) => {
      if (c.table === 'segmentos') return ok([{ id: SEG }])
      if (c.table === 'director_general_segmentos' && c.ops.some((o) => o.method === 'select')) {
        return ok([{ segmento_id: SEG, alcance: 'segmento' }])
      }
      return ok(null)
    }
    expect(await asignarTodosLosSegmentosDG(U)).toEqual({ success: true })
    expect(escritura()).toEqual([])
  })

  it('reports the database error', async () => {
    responder = (c) => (c.table === 'segmentos' ? ok([{ id: SEG }]) : c.ops.some((o) => o.method === 'insert') ? fallo('boom') : ok([]))
    expect(await asignarTodosLosSegmentosDG(U)).toEqual({ success: false, error: 'boom' })
  })
})

describe('buscarPersonasParaDirectorGeneral', () => {
  const PERSONA = '55555555-5555-4555-8555-555555555555'
  const YA_DG = '66666666-6666-4666-8666-666666666666'

  function catalogo() {
    responder = (c) => {
      if (c.table === 'roles_sistema') {
        return ok([
          { id: ROL_DG, nombre_interno: 'director-general' },
          { id: 'rol-admin', nombre_interno: 'admin' },
          { id: 'rol-lider', nombre_interno: 'lider' },
        ])
      }
      if (c.table === 'usuario_roles' && c.ops.some((o) => o.method === 'eq')) return ok([{ usuario_id: YA_DG }])
      if (c.table === 'usuario_roles') {
        return ok([
          { usuario_id: PERSONA, rol_id: 'rol-admin' },
          { usuario_id: PERSONA, rol_id: 'rol-lider' },
        ])
      }
      if (c.table === 'usuarios') {
        return ok([{ id: PERSONA, nombre: 'María', apellido: 'Pacheco', email: 'secreto@example.com', auth_id: 'x' }])
      }
      return ok([])
    }
  }

  it('returns only id, name and current role labels', async () => {
    catalogo()
    const res = await buscarPersonasParaDirectorGeneral('mar')

    expect(res).toEqual({
      success: true,
      data: [{ id: PERSONA, nombre: 'María Pacheco', roles: ['Administrador', 'Líder'] }],
    })
  })

  it('excludes the people who already hold the role, and limits the results', async () => {
    catalogo()
    await buscarPersonasParaDirectorGeneral('mar')

    const [busqueda] = calls.filter((c) => c.table === 'usuarios')
    expect(busqueda.ops.some((o) => o.method === 'not' && JSON.stringify(o.args).includes(YA_DG))).toBe(true)
    expect(tiene(busqueda, 'limit', 8)).toBe(true)
    expect(escritura()).toEqual([])
  })

  it('does not search for fewer than two characters', async () => {
    const res = await buscarPersonasParaDirectorGeneral(' a ')
    expect(res).toEqual({ success: true, data: [] })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('strips characters that would break the filter', async () => {
    catalogo()
    await buscarPersonasParaDirectorGeneral('ma,(r)%ia')
    const [busqueda] = calls.filter((c) => c.table === 'usuarios')
    const filtros = busqueda.ops.filter((o) => o.method === 'or').map((o) => String(o.args[0]))
    expect(filtros.length).toBeGreaterThan(0)
    for (const filtro of filtros) expect(filtro).toMatch(/^nombre\.ilike\.%[^,()%]+%,apellido\.ilike\.%[^,()%]+%$/)
  })

  it('reports the database error', async () => {
    responder = () => fallo('boom')
    expect(await buscarPersonasParaDirectorGeneral('mar')).toEqual({ success: false, error: 'boom' })
  })
})
