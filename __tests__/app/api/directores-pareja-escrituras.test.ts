/**
 * A couple of stage directors (spouses, both director_etapa of the same segment) is ONE
 * director: every write that links or unlinks a group for one spouse does it for the other.
 * Non-couple behavior stays as it was.
 */
import { POST as postDirectoresEtapa } from '@/app/api/segmentos/[segmentoId]/directores-etapa/route'
import { POST as postGruposAsignables } from '@/app/api/segmentos/[segmentoId]/directores-etapa/[directorId]/grupos-asignables/route'
import { editarGrupoPendiente } from '@/lib/actions/solicitudes-grupo.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const getUserWithRoles = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: () => Promise.resolve(body),
    }),
  },
}))

type Fila = Record<string, unknown>
type Escritura = { cliente: string; op: 'insert' | 'delete'; tabla: string }

const authId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const usuarioId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const segmentoId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const directorId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const conyugeId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const g1 = 'g1'
const g2 = 'g2'
const g3 = 'g3'
const g4 = 'g4'
const gAjeno = 'g-ajeno'
const gEliminado = 'g-eliminado'
const directorAjenoId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const otroUsuarioId = '99999999-9999-9999-9999-999999999999'

/** In-memory tables behind a chainable, awaitable query builder that logs writes. */
function crearBase(tablas: Record<string, Fila[]>, cliente: string, escrituras: Escritura[]) {
  return (tabla: string) => {
    const filtros: Array<(f: Fila) => boolean> = []
    let op: 'select' | 'insert' | 'delete' = 'select'
    let payload: Fila[] = []
    let soloConteo = false
    const filas = () => (tablas[tabla] ??= [])
    const ejecutar = () => {
      if (op === 'insert') {
        filas().push(...payload.map((f) => ({ ...f })))
        return { data: null, error: null }
      }
      if (op === 'delete') {
        tablas[tabla] = filas().filter((f) => !filtros.every((fn) => fn(f)))
        return { data: null, error: null }
      }
      const resultado = filas().filter((f) => filtros.every((fn) => fn(f)))
      return soloConteo ? { data: null, count: resultado.length, error: null } : { data: resultado, error: null }
    }
    const query: Record<string, unknown> = {}
    query.select = jest.fn((_cols?: string, opciones?: { head?: boolean }) => {
      soloConteo = Boolean(opciones?.head)
      return query
    })
    query.eq = jest.fn((col: string, valor: unknown) => {
      filtros.push((f) => f[col] === valor)
      return query
    })
    query.in = jest.fn((col: string, valores: unknown[]) => {
      filtros.push((f) => valores.includes(f[col]))
      return query
    })
    query.limit = jest.fn(() => query)
    query.insert = jest.fn((rows: Fila | Fila[]) => {
      op = 'insert'
      payload = Array.isArray(rows) ? rows : [rows]
      escrituras.push({ cliente, op, tabla })
      return query
    })
    query.delete = jest.fn(() => {
      op = 'delete'
      escrituras.push({ cliente, op, tabla })
      return query
    })
    query.maybeSingle = jest.fn(async () => ({ data: (ejecutar().data as Fila[] | null)?.[0] ?? null, error: null }))
    query.single = query.maybeSingle
    query.then = (resolve: (v: unknown) => unknown) => Promise.resolve(ejecutar()).then(resolve)
    return query
  }
}

function enlaces(tablas: Record<string, Fila[]>, director: string) {
  return (tablas.director_etapa_grupos ?? [])
    .filter((f) => f.director_etapa_id === director)
    .map((f) => f.grupo_id as string)
    .sort()
}

function escenario(opciones: { conyuge: string | null; enlaces?: Fila[] }) {
  const tablas: Record<string, Fila[]> = {
    segmento_lideres: [
      { id: directorId, segmento_id: segmentoId, tipo_lider: 'director_etapa', usuario_id: usuarioId },
      { id: directorAjenoId, segmento_id: 'otro-segmento', tipo_lider: 'director_etapa', usuario_id: otroUsuarioId },
      { id: conyugeId, segmento_id: segmentoId, tipo_lider: 'director_etapa', usuario_id: otroUsuarioId },
    ],
    grupos: [
      ...[g1, g2, g3, g4].map((id) => ({ id, segmento_id: segmentoId, eliminado: false })),
      { id: gAjeno, segmento_id: 'otro-segmento', eliminado: false },
      { id: gEliminado, segmento_id: segmentoId, eliminado: true },
    ],
    usuarios: [{ id: usuarioId, auth_id: authId }, { id: otroUsuarioId, auth_id: 'otro-auth' }],
    director_etapa_grupos: (opciones.enlaces ?? []).map((f) => ({ ...f })),
    solicitudes_grupo: [{ id: 'sol1', tipo: 'activacion_grupo', estado: 'pendiente', solicitado_por: usuarioId, grupo_id: g1 }],
  }
  const escrituras: Escritura[] = []
  const tablasUsuario: string[] = []
  const rpcAdmin = jest.fn(async () => ({ data: opciones.conyuge, error: null }))
  const rpcUsuario = jest.fn(async () => ({ data: null, error: { message: 'could not find the function' } }))
  const usuario = {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: authId } }, error: null })) },
    rpc: rpcUsuario,
    from: jest.fn((tabla: string) => {
      tablasUsuario.push(tabla)
      return crearBase(tablas, 'usuario', escrituras)(tabla)
    }),
  }
  const admin = { rpc: rpcAdmin, from: jest.fn(crearBase(tablas, 'admin', escrituras)) }
  createSupabaseServerClient.mockResolvedValue(usuario)
  createSupabaseAdminClient.mockReturnValue(admin)
  return { tablas, escrituras, tablasUsuario, rpcAdmin, rpcUsuario }
}

const peticion = (cuerpo: unknown) => ({ json: async () => cuerpo }) as unknown as Request

beforeEach(() => {
  jest.clearAllMocks()
  getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['admin'] })
})

describe('POST /api/segmentos/[segmentoId]/directores-etapa (assign or remove a group)', () => {
  const contexto = { params: { segmentoId } }
  const llamar = (accion: 'agregar' | 'quitar', grupoId = g1, director = directorId) =>
    postDirectoresEtapa(
      peticion({ director_etapa_segmento_lider_id: director, grupo_id: grupoId, accion }),
      contexto,
    )
  const soloAdmin = (escrituras: Escritura[]) =>
    escrituras.every((w) => w.cliente === 'admin' && w.tabla === 'director_etapa_grupos')

  it('links the group to both spouses of a couple, writing with the admin client', async () => {
    const e = escenario({ conyuge: conyugeId })

    const respuesta = await llamar('agregar')

    expect(respuesta.status).toBe(200)
    expect(enlaces(e.tablas, directorId)).toEqual([g1])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g1])
    await expect(respuesta.json()).resolves.toMatchObject({ ok: true, asignaciones: [{ grupo_id: g1 }] })
    expect(e.escrituras.length).toBeGreaterThan(0)
    expect(soloAdmin(e.escrituras)).toBe(true)
  })

  it('does not duplicate a link the spouse already has', async () => {
    const e = escenario({ conyuge: conyugeId, enlaces: [{ director_etapa_id: conyugeId, grupo_id: g1 }] })

    await llamar('agregar')

    expect(enlaces(e.tablas, directorId)).toEqual([g1])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g1])
  })

  it('removes the group from both spouses of a couple', async () => {
    const e = escenario({
      conyuge: conyugeId,
      enlaces: [
        { director_etapa_id: directorId, grupo_id: g1 },
        { director_etapa_id: conyugeId, grupo_id: g1 },
        { director_etapa_id: conyugeId, grupo_id: g2 },
      ],
    })

    const respuesta = await llamar('quitar')

    expect(respuesta.status).toBe(200)
    expect(enlaces(e.tablas, directorId)).toEqual([])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g2])
    expect(soloAdmin(e.escrituras)).toBe(true)
  })

  it('only touches the director when there is no spouse', async () => {
    const e = escenario({ conyuge: null, enlaces: [{ director_etapa_id: conyugeId, grupo_id: g1 }] })

    await llamar('agregar')
    expect(enlaces(e.tablas, directorId)).toEqual([g1])
    await llamar('quitar')
    expect(enlaces(e.tablas, directorId)).toEqual([])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g1])
  })

  it('lets a director-etapa act on their own couple row', async () => {
    const e = escenario({ conyuge: conyugeId })
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['director-etapa'] })

    const respuesta = await llamar('agregar')

    expect(respuesta.status).toBe(200)
    expect(enlaces(e.tablas, directorId)).toEqual([g1])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g1])
    expect(soloAdmin(e.escrituras)).toBe(true)
  })

  it('never calls the asignar_director_etapa_a_grupo RPC nor reads or writes links with the user client', async () => {
    const e = escenario({ conyuge: conyugeId })

    await llamar('agregar')
    await llamar('quitar')

    expect(e.rpcUsuario).not.toHaveBeenCalled()
    expect(e.rpcAdmin).not.toHaveBeenCalledWith('asignar_director_etapa_a_grupo', expect.anything())
    expect(e.tablasUsuario).not.toContain('director_etapa_grupos')
  })

  it('returns 401 for an unauthenticated caller', async () => {
    const e = escenario({ conyuge: conyugeId })
    getUserWithRoles.mockResolvedValue(null)

    expect((await llamar('agregar')).status).toBe(401)
    expect(e.escrituras).toEqual([])
  })

  it('returns 403 for a role without permission', async () => {
    const e = escenario({ conyuge: conyugeId })
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['lider'] })

    expect((await llamar('agregar')).status).toBe(403)
    expect(e.escrituras).toEqual([])
  })

  it('returns 403 when a director-etapa acts on another director', async () => {
    const e = escenario({ conyuge: null })
    getUserWithRoles.mockResolvedValue({ user: { id: 'otro-auth' }, roles: ['director-etapa'] })

    expect((await llamar('agregar')).status).toBe(403)
    expect(e.escrituras).toEqual([])
  })

  it('returns 403 for a director of another segment', async () => {
    const e = escenario({ conyuge: null })

    expect((await llamar('agregar', g1, directorAjenoId)).status).toBe(403)
    expect(e.escrituras).toEqual([])
  })

  it('returns 404 for an unknown director', async () => {
    escenario({ conyuge: null })

    expect((await llamar('agregar', g1, 'no-existe')).status).toBe(404)
  })

  it.each([gAjeno, gEliminado, 'no-existe'])('rejects the group %s that is not an active group of the segment', async (grupo) => {
    const e = escenario({ conyuge: conyugeId })

    expect((await llamar('agregar', grupo)).status).toBe(400)
    expect(e.escrituras).toEqual([])
  })

  it('keeps rejecting invalid actions', async () => {
    escenario({ conyuge: null })
    const invalida = await postDirectoresEtapa(
      peticion({ director_etapa_segmento_lider_id: directorId, grupo_id: g1, accion: 'otra' }),
      contexto,
    )
    expect(invalida.status).toBe(400)
  })
})

describe('POST grupos-asignables (merge / replace)', () => {
  const contexto = { params: { segmentoId, directorId } }
  const llamar = (cuerpo: unknown) => postGruposAsignables(peticion(cuerpo), contexto)

  it('merge adds the missing links to both spouses', async () => {
    const e = escenario({ conyuge: conyugeId, enlaces: [{ director_etapa_id: directorId, grupo_id: g1 }] })

    const respuesta = await llamar({ agregar: [g1, g2] })

    expect(respuesta.status).toBe(200)
    expect(enlaces(e.tablas, directorId)).toEqual([g1, g2])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g1, g2])
    await expect(respuesta.json()).resolves.toMatchObject({ ok: true, modo: 'merge', agregados: 1, quitados: 0, totalAsignados: 2 })
    expect(e.escrituras.length).toBeGreaterThan(0)
    expect(e.escrituras.every((w) => w.cliente === 'admin')).toBe(true)
  })

  it('merge removes the requested groups from both spouses', async () => {
    const e = escenario({
      conyuge: conyugeId,
      enlaces: [
        { director_etapa_id: directorId, grupo_id: g1 },
        { director_etapa_id: directorId, grupo_id: g2 },
        { director_etapa_id: conyugeId, grupo_id: g1 },
        { director_etapa_id: conyugeId, grupo_id: g2 },
      ],
    })

    const respuesta = await llamar({ quitar: [g1] })

    expect(enlaces(e.tablas, directorId)).toEqual([g2])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g2])
    await expect(respuesta.json()).resolves.toMatchObject({ agregados: 0, quitados: 1, totalAsignados: 1 })
  })

  it('replace makes both spouses end with exactly the requested groups', async () => {
    const e = escenario({
      conyuge: conyugeId,
      enlaces: [
        { director_etapa_id: directorId, grupo_id: g1 },
        { director_etapa_id: directorId, grupo_id: g2 },
        { director_etapa_id: conyugeId, grupo_id: g2 },
        { director_etapa_id: conyugeId, grupo_id: g3 },
      ],
    })

    const respuesta = await llamar({ modo: 'replace', agregar: [g2, g4] })

    expect(respuesta.status).toBe(200)
    expect(enlaces(e.tablas, directorId)).toEqual([g2, g4])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g2, g4])
    await expect(respuesta.json()).resolves.toMatchObject({ modo: 'replace', agregados: 1, quitados: 1, totalAsignados: 2 })
  })

  it('leaves a non-couple director alone and does not touch other directors', async () => {
    const e = escenario({
      conyuge: null,
      enlaces: [
        { director_etapa_id: directorId, grupo_id: g1 },
        { director_etapa_id: conyugeId, grupo_id: g3 },
      ],
    })

    await llamar({ modo: 'replace', agregar: [g2] })

    expect(enlaces(e.tablas, directorId)).toEqual([g2])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g3])
  })

  it('keeps denying callers without a role and groups outside the segment', async () => {
    escenario({ conyuge: conyugeId })
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['lider'] })
    expect((await llamar({ agregar: [g1] })).status).toBe(403)

    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['admin'] })
    expect((await llamar({ agregar: ['otro-segmento'] })).status).toBe(400)
  })
})

describe('editarGrupoPendiente (director link)', () => {
  const editar = () => editarGrupoPendiente({ solicitud_id: 'sol1', director_etapa_segmento_lider_id: directorId })

  it('replaces the director link and also links the spouse of a couple', async () => {
    const e = escenario({ conyuge: conyugeId, enlaces: [{ director_etapa_id: 'otro', grupo_id: g1 }] })

    await expect(editar()).resolves.toEqual({ success: true })

    expect(enlaces(e.tablas, 'otro')).toEqual([])
    expect(enlaces(e.tablas, directorId)).toEqual([g1])
    expect(enlaces(e.tablas, conyugeId)).toEqual([g1])
  })

  it('links only the director when there is no spouse', async () => {
    const e = escenario({ conyuge: null })

    await expect(editar()).resolves.toEqual({ success: true })

    expect(enlaces(e.tablas, directorId)).toEqual([g1])
    expect(e.tablas.director_etapa_grupos).toHaveLength(1)
  })

  it('only clears the links when the director is set to null', async () => {
    const e = escenario({ conyuge: conyugeId, enlaces: [{ director_etapa_id: directorId, grupo_id: g1 }] })

    await editarGrupoPendiente({ solicitud_id: 'sol1', director_etapa_segmento_lider_id: null })

    expect(e.tablas.director_etapa_grupos).toEqual([])
    expect(e.rpcAdmin).not.toHaveBeenCalled()
  })

  it('keeps the current links when the spouse lookup fails (nothing is deleted)', async () => {
    const e = escenario({ conyuge: conyugeId, enlaces: [{ director_etapa_id: 'otro', grupo_id: g1 }] })
    e.rpcAdmin.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } } as never)

    await expect(editar()).rejects.toBeTruthy()

    expect(enlaces(e.tablas, 'otro')).toEqual([g1])
    expect(e.escrituras.filter((w) => w.tabla === 'director_etapa_grupos')).toEqual([])
  })
})
