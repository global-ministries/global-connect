/**
 * @jest-environment node
 *
 * P4 (odd/tasks/ninos-precheck.md) — "¿Vienen hoy?" in the QR wizard: the
 * token handed back by the create, the notice behind
 * POST /api/ninos/preregistro/aviso and the pre-registrations in "Llegando".
 */
import { etiquetaServicio, parseAvisoPreregistro, parseSolicitudAviso } from '@/lib/platform/ninos/preregistro-aviso'
import { avisarLlegada, crearPreregistro, hashIp, hashToken } from '@/lib/platform/ninos/preregistro-servidor'
import { parseLlegando, parsePreregistrosLlegando } from '@/lib/platform/ninos/precheck'

const HOY = '2026-10-26'
const CAMPUS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PRE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TURNO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TOKEN = 'A'.repeat(43)

const cuerpo = () => ({
  campusId: CAMPUS,
  padre: { nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234', email: '', cedula: '' },
  hijos: [{ nombre: 'Sofía', apellido: 'Pérez', fechaNacimiento: '2021-03-04', genero: 'Femenino', grado: '' }],
  autorizados: [],
  sitioWeb: '',
})

describe('crearPreregistro with a notice token', () => {
  it('stores only the token hash and hands the token back with today\'s services', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { estado: 'ok', id: PRE, servicios: [{ turno_id: TURNO, nombre: 'Domingo 9:00', hora: '09:00:00' }] },
      error: null,
    })
    const r = await crearPreregistro({ rpc, sal: 's', hoy: HOY, token: () => TOKEN }, cuerpo(), '1.2.3.4')
    expect(rpc).toHaveBeenCalledWith('ninos_preregistro_crear', {
      p_campus_id: CAMPUS,
      p_payload: expect.objectContaining({ padre: expect.objectContaining({ nombre: 'Ana' }) }),
      p_ip_hash: hashIp('1.2.3.4', 's'),
      p_token_hash: hashToken(TOKEN),
    })
    expect(hashToken(TOKEN)).toMatch(/^[0-9a-f]{64}$/)
    expect(r).toEqual({
      status: 200,
      body: { ok: true, aviso: { id: PRE, token: TOKEN, servicios: [{ turnoId: TURNO, nombre: 'Domingo 9:00', hora: '09:00:00' }] } },
    })
  })

  it('answers only ok when no service of today is in its window', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { estado: 'ok', id: PRE, servicios: [] }, error: null })
    expect(await crearPreregistro({ rpc, sal: 's', hoy: HOY, token: () => TOKEN }, cuerpo(), '1.2.3.4')).toEqual({
      status: 200,
      body: { ok: true },
    })
  })

  it('429 when the token create answers limite', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { estado: 'limite' }, error: null })
    expect((await crearPreregistro({ rpc, sal: 's', hoy: HOY, token: () => TOKEN }, cuerpo(), '1.2.3.4')).status).toBe(429)
  })

  it('a fresh random token per pre-registration by default', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { estado: 'ok', id: PRE, servicios: [{ turno_id: TURNO, nombre: 'T', hora: '09:00:00' }] }, error: null })
    const a = await crearPreregistro({ rpc, sal: 's', hoy: HOY }, cuerpo(), '1.2.3.4')
    const b = await crearPreregistro({ rpc, sal: 's', hoy: HOY }, cuerpo(), '1.2.3.4')
    const ta = (a.body.aviso as { token: string }).token
    const tb = (b.body.aviso as { token: string }).token
    expect(ta).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(ta).not.toBe(tb)
  })
})

describe('parseAvisoPreregistro (wizard side)', () => {
  it('reads the notice offer of the create answer', () => {
    expect(
      parseAvisoPreregistro({ ok: true, aviso: { id: PRE, token: TOKEN, servicios: [{ turnoId: TURNO, nombre: 'Domingo 9:00', hora: '09:00:00' }] } }),
    ).toEqual({ id: PRE, token: TOKEN, servicios: [{ turnoId: TURNO, nombre: 'Domingo 9:00', hora: '09:00:00' }] })
  })

  it('no offer (the step is skipped) without services, without a token or for a damaged answer', () => {
    expect(parseAvisoPreregistro({ ok: true })).toBeNull()
    expect(parseAvisoPreregistro({ ok: true, aviso: { id: PRE, token: TOKEN, servicios: [] } })).toBeNull()
    expect(parseAvisoPreregistro({ ok: true, aviso: { id: PRE, servicios: [{ turnoId: TURNO, nombre: 'x', hora: '09:00:00' }] } })).toBeNull()
    expect(parseAvisoPreregistro({ ok: true, aviso: { id: PRE, token: TOKEN, servicios: [{ nombre: 'x' }] } })).toBeNull()
    expect(parseAvisoPreregistro(null)).toBeNull()
  })

  it('labels a service by its start time, or its name without one', () => {
    expect(etiquetaServicio({ turnoId: TURNO, nombre: 'Domingo', hora: '09:00:00' })).toBe('9:00')
    expect(etiquetaServicio({ turnoId: TURNO, nombre: 'Domingo', hora: '11:30:00' })).toBe('11:30')
    expect(etiquetaServicio({ turnoId: TURNO, nombre: 'Domingo', hora: '' })).toBe('Domingo')
  })
})

describe('parseSolicitudAviso', () => {
  it('accepts an id, a token and a turno', () => {
    expect(parseSolicitudAviso({ id: PRE, token: TOKEN, turnoId: TURNO })).toEqual({ id: PRE, token: TOKEN, turnoId: TURNO })
  })

  it('rejects anything else', () => {
    expect(parseSolicitudAviso({ id: 'x', token: TOKEN, turnoId: TURNO })).toBeNull()
    expect(parseSolicitudAviso({ id: PRE, token: 'corto', turnoId: TURNO })).toBeNull()
    expect(parseSolicitudAviso({ id: PRE, token: TOKEN, turnoId: 'x' })).toBeNull()
    expect(parseSolicitudAviso({ id: PRE, token: 'A'.repeat(500), turnoId: TURNO })).toBeNull()
    expect(parseSolicitudAviso('nope')).toBeNull()
  })
})

describe('avisarLlegada (POST /api/ninos/preregistro/aviso)', () => {
  const pedir = { id: PRE, token: TOKEN, turnoId: TURNO }

  it('sends the token hash, never the token, with the IP hash', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'ok', error: null })
    expect(await avisarLlegada({ rpc, sal: 's' }, pedir, '1.2.3.4')).toEqual({ status: 200, body: { ok: true } })
    expect(rpc).toHaveBeenCalledWith('ninos_preregistro_avisar', {
      p_id: PRE,
      p_token_hash: hashToken(TOKEN),
      p_turno_id: TURNO,
      p_ip_hash: hashIp('1.2.3.4', 's'),
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(TOKEN)
  })

  it('400 for a malformed body without touching the database', async () => {
    const rpc = jest.fn()
    expect((await avisarLlegada({ rpc, sal: 's' }, { id: PRE }, '1.2.3.4')).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('429 when rate limited', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'limite', error: null })
    expect((await avisarLlegada({ rpc, sal: 's' }, pedir, '1.2.3.4')).status).toBe(429)
  })

  it.each([
    ['fuera_de_horario', '22023', 409, 'Este servicio ya no recibe avisos. Avísale a la mesa al llegar.'],
    ['ya_avisado', '22023', 409, 'Ya le avisamos a la mesa que vienen a este servicio.'],
    ['sin_autoridad', '42501', 403, 'No pudimos avisar a la mesa. Avísale al llegar.'],
  ])('%s → %i with a plain message', async (message, code, status, texto) => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code, message } })
    expect(await avisarLlegada({ rpc, sal: 's' }, pedir, '1.2.3.4')).toEqual({ status, body: { errores: [texto] } })
  })

  it('500 for anything else, logging only the code', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: `boom ${TOKEN}` } })
    expect((await avisarLlegada({ rpc, sal: 's' }, pedir, '1.2.3.4')).status).toBe(500)
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)
    log.mockRestore()
  })
})

describe('pre-registrations in "Llegando"', () => {
  const lista = [
    { padre: { id: 'p1', nombre: 'Ana', apellido: 'Pérez' }, avisado_at: '2026-10-26T12:00:00Z', hijos: [] },
    {
      tipo: 'preregistro',
      preregistro_id: PRE,
      padre: { nombre: 'Rosa', apellido: 'Qr' },
      avisado_at: '2026-10-26T12:05:00Z',
      hijos: [
        { nombre: 'Sol', apellido: 'Qr', alergias: 'Maní', necesidades_especiales: null },
        { nombre: 'Luz', apellido: 'Qr', alergias: null, necesidades_especiales: 'TEA' },
      ],
    },
    { tipo: 'preregistro', padre: { nombre: 'Sin id' }, hijos: [] },
  ]

  it('parses the pre-registration entries with their alerts', () => {
    expect(parsePreregistrosLlegando(lista)).toEqual([
      {
        preregistroId: PRE,
        padre: { nombre: 'Rosa', apellido: 'Qr' },
        avisadoAt: '2026-10-26T12:05:00Z',
        hijos: [
          { nombre: 'Sol', apellido: 'Qr', alertas: ['Alergias: Maní'] },
          { nombre: 'Luz', apellido: 'Qr', alertas: ['Necesidades especiales: TEA'] },
        ],
      },
    ])
    expect(parsePreregistrosLlegando(null)).toEqual([])
  })

  it('the family list ignores them, as before', () => {
    expect(parseLlegando(lista).map((f) => f.padre.id)).toEqual([])
  })
})
