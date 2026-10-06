/**
 * @jest-environment node
 *
 * Dream Team — POST /api/dream-team/usuarios (register a new person and assign
 * them, T7/T9) and GET /api/dream-team/usuarios/cedula (representative lookup).
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))

import { POST } from '@/app/api/dream-team/usuarios/route'
import { GET as GET_CEDULA } from '@/app/api/dream-team/usuarios/cedula/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock

const writeCap = { key: 'dream_team.director.coordinate', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const readCap = { key: 'dream_team.metrics.read', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const EQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CAMPUS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

let rpc: jest.Mock

function setup(caps: Record<string, unknown>[], rpcAnswer: { data?: unknown; error?: unknown } = {}, user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn().mockResolvedValue({ data: rpcAnswer.data ?? null, error: rpcAnswer.error ?? null })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  resolveSession.mockResolvedValue(user ? { personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: caps } : null)
}

const base = { equipoId: EQ, rolId: ROL, nombre: ' Ana ', apellido: 'Pérez', genero: 'Femenino', estadoCivil: 'Soltero' }

function post(body: unknown, cookie?: string) {
  return POST(new NextRequest(new URL('http://localhost/api/dream-team/usuarios'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: cookie ? { cookie } : {},
  }))
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

describe('POST /api/dream-team/usuarios', () => {
  it('404 when the flag is off', async () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'off'; setup([writeCap])
    expect((await post({ ...base, cedula: '12345678' })).status).toBe(404)
  })
  it('401 without a session', async () => { setup([], {}, null); expect((await post({ ...base, cedula: '1234567' })).status).toBe(401) })
  it('403 without a write capability', async () => { setup([readCap]); expect((await post({ ...base, cedula: '1234567' })).status).toBe(403) })

  it('400 without a cedula and without a birth date, before any RPC', async () => {
    setup([writeCap])
    const res = await post({ ...base, cedula: '  ' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/fecha de nacimiento/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('201 creates: normalized cedula, the selected campus from the cookie, the representative', async () => {
    setup([writeCap], { data: { resultado: 'creada', persona_id: 'new-1', nombre: 'Ana Pérez', servicio_id: 'srv-1' } })
    const res = await post({ ...base, cedula: 'V-12.345.678', representanteId: REP, representanteTipo: 'tutor', bautizado: true }, `gc_campus_activo=${CAMPUS}`)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ resultado: 'creada', personaId: 'new-1', nombre: 'Ana Pérez', servicioId: 'srv-1' })
    expect(rpc).toHaveBeenCalledWith('dream_team_registrar_persona', expect.objectContaining({
      p_equipo_id: EQ, p_rol_id: ROL, p_nombre: 'Ana', p_cedula: '12345678', p_campus_id: CAMPUS,
      p_representante_id: REP, p_representante_tipo: 'tutor', p_bautizado: true,
    }))
  })

  it('ignores a cookie that is not a uuid (the function falls back to the principal campus)', async () => {
    setup([writeCap], { data: { resultado: 'creada', persona_id: 'n', nombre: 'A P', servicio_id: 's' } })
    await post({ ...base, fechaNacimiento: '2017-01-01' }, 'gc_campus_activo=nope')
    expect(rpc.mock.calls[0][1].p_campus_id).toBeUndefined()
  })

  it('200 existente when the cedula is already held', async () => {
    setup([writeCap], { data: { resultado: 'existente', persona_id: 'old-1', nombre: 'Ana Vieja' } })
    const res = await post({ ...base, cedula: '12345678' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ resultado: 'existente', personaId: 'old-1', nombre: 'Ana Vieja' })
  })

  it('200 coincidencias with the namesakes', async () => {
    setup([writeCap], { data: { resultado: 'coincidencias', candidatos: [{ id: 'x', nombre: 'Ana', apellido: 'Pérez', fecha_nacimiento: '2017-01-01' }] } })
    const res = await post({ ...base, fechaNacimiento: '2017-01-01' })
    expect(res.status).toBe(200)
    expect((await res.json()).candidatos).toEqual([{ id: 'x', nombre: 'Ana', apellido: 'Pérez', fechaNacimiento: '2017-01-01' }])
  })

  it('403 when the function refuses the equipo (42501)', async () => {
    setup([writeCap], { error: { code: '42501', message: 'sin_autoridad' } })
    expect((await post({ ...base, cedula: '12345678' })).status).toBe(403)
  })

  it('422 with a Spanish message for a 22023', async () => {
    setup([writeCap], { error: { code: '22023', message: 'representante_no_encontrado' } })
    const res = await post({ ...base, cedula: '12345678' })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('Representante no encontrado')
  })

  it('500 without leaking the database detail', async () => {
    setup([writeCap], { error: { code: 'XX000', message: 'boom secret' } })
    const res = await post({ ...base, cedula: '12345678' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/)
  })
})

describe('GET /api/dream-team/usuarios/cedula', () => {
  const get = (q: string) => GET_CEDULA(new NextRequest(new URL(`http://localhost/api/dream-team/usuarios/cedula?cedula=${encodeURIComponent(q)}`)))

  it('403 without a write capability', async () => { setup([readCap]); expect((await get('12345678')).status).toBe(403) })

  it('finds by the normalized cedula', async () => {
    setup([writeCap], { data: [{ id: REP, nombre: 'Rep', apellido: 'Uno' }] })
    const res = await get('V-12.345.678')
    expect(await res.json()).toEqual({ persona: { id: REP, nombre: 'Rep', apellido: 'Uno' } })
    expect(rpc).toHaveBeenCalledWith('dream_team_persona_por_cedula', { p_cedula: '12345678' })
  })

  it('answers null for a blank cedula without calling the database', async () => {
    setup([writeCap])
    expect(await (await get('  ')).json()).toEqual({ persona: null })
    expect(rpc).not.toHaveBeenCalled()
  })
})
