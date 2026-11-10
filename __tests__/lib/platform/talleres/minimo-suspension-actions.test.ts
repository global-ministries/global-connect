/**
 * @jest-environment node
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S15 S16) — server actions of
 * the minimum of inscritos. Gate (flag + session), input validation before
 * any RPC, the exact RPC arguments, error translation, revalidation, and
 * the best-effort date-change email after a suspension.
 */

import {
  abrirEdicionIgual,
  confirmarPorTelefono,
  guardarMinimoInscritos,
  leerMinimoInscritos,
  responderCambioFecha,
  suspenderEdicion,
} from '@/lib/platform/talleres/minimo-suspension-actions'

jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: jest.fn(() => true) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/email/send-batch', () => ({ sendEmailBatch: jest.fn() }))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const clientMock = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const revalidateMock = jest.requireMock('next/cache').revalidatePath as jest.Mock
const sendBatchMock = jest.requireMock('@/lib/email/send-batch').sendEmailBatch as jest.Mock

interface Setup {
  enabled?: boolean
  user?: { id: string } | null
  rpc?: { data: unknown; error: { message?: string; code?: string } | null }
  from?: unknown
}

function setup(opts: Setup = {}): { rpc: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.enabled ?? true)
  const rpc = jest.fn().mockResolvedValue(opts.rpc ?? { data: {}, error: null })
  clientMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user } }) },
    rpc,
    from: opts.from,
  })
  return { rpc }
}

beforeEach(() => {
  revalidateMock.mockReset()
  sendBatchMock.mockReset()
})

const SUSPENDER = {
  tallerSlug: 'de-hombre-a-hombre',
  edicionId: 'e-1',
  nuevaFechaInicio: '2027-01-15',
  nuevoCierre: null,
  motivo: ' No se alcanzó el mínimo de inscritos ',
  mensaje: 'Queremos el grupo completo.',
}

const RESPUESTA_SUSPENSION = {
  taller_nombre: 'De Hombre a Hombre',
  fecha_inicio: '2027-01-15',
  cierre_inscripcion: '2027-01-11',
  por_confirmar: 2,
  correos: [
    { persona_id: 'p-1', nombre: 'Pablo Uno', email: 'p1@example.test', confirmar: true },
    { persona_id: 'p-3', nombre: 'Raul Tres', email: 'p3@example.test', confirmar: false },
  ],
}

describe('gate', () => {
  it('flag off → not-found, no RPC', async () => {
    const { rpc } = setup({ enabled: false })
    const r = await suspenderEdicion(SUSPENDER)
    expect(r).toEqual({ ok: false, error: 'not-found', message: 'El módulo de talleres está deshabilitado.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('no session → unauthorized, no RPC', async () => {
    const { rpc } = setup({ user: null })
    const r = await abrirEdicionIgual({ tallerSlug: 's', edicionId: 'e-1', motivo: null })
    expect(r).toEqual({ ok: false, error: 'unauthorized', message: 'Necesitas iniciar sesión.' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('suspenderEdicion', () => {
  it('rejects a malformed date before calling the RPC', async () => {
    const { rpc } = setup()
    const r = await suspenderEdicion({ ...SUSPENDER, nuevaFechaInicio: '15/01/2027' })
    expect(r).toEqual({ ok: false, error: 'invalid-input', message: 'Elige la nueva fecha de la primera clase.' })
    const r2 = await suspenderEdicion({ ...SUSPENDER, mensaje: 'x'.repeat(601) })
    expect(r2.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls the RPC with trimmed text, revalidates and emails the recipients with the DB taller name', async () => {
    const { rpc } = setup({ rpc: { data: RESPUESTA_SUSPENSION, error: null } })
    sendBatchMock.mockResolvedValue({ success: true, errors: [] })

    const r = await suspenderEdicion(SUSPENDER)

    expect(rpc).toHaveBeenCalledWith('talleres_suspender_edicion', {
      p_edicion_id: 'e-1',
      p_nueva_fecha_inicio: '2027-01-15',
      p_nuevo_cierre: null,
      p_motivo: 'No se alcanzó el mínimo de inscritos',
      p_mensaje: 'Queremos el grupo completo.',
    })
    expect(r).toEqual({
      ok: true,
      suspension: { fechaInicio: '2027-01-15', cierreInscripcion: '2027-01-11', porConfirmar: 2, correosEnviados: 2, correosFallidos: 0 },
    })
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/de-hombre-a-hombre/e-1')
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/de-hombre-a-hombre')
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/mi-recorrido')

    expect(sendBatchMock).toHaveBeenCalledTimes(1)
    const [lote, opciones] = sendBatchMock.mock.calls[0]
    expect(opciones).toEqual({ idempotencyKey: 'taller-cambio-fecha:e-1:2027-01-15:0' })
    expect(lote.map((x: { to: string }) => x.to)).toEqual(['p1@example.test', 'p3@example.test'])
    expect(lote[0].subject).toBe('De Hombre a Hombre cambió de fecha: ahora empieza el viernes 15 de enero')
    // The approved inscrito gets the deadline; the pending request does not.
    expect(lote[0].template.props).toMatchObject({ nombre: 'Pablo', limite: 'lunes 11 de enero', mensaje: 'Queremos el grupo completo.' })
    expect(lote[1].template.props.limite).toBeNull()
  })

  it('a failed email never undoes the suspension', async () => {
    setup({ rpc: { data: RESPUESTA_SUSPENSION, error: null } })
    sendBatchMock.mockResolvedValue({ success: false, error: 'rate limit' })
    const r = await suspenderEdicion(SUSPENDER)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.suspension).toMatchObject({ correosEnviados: 0, correosFallidos: 2 })
  })

  it('translates a refusal and sends nothing', async () => {
    setup({ rpc: { data: null, error: { code: 'P0001', message: 'EDICION_NO_BAJO_MINIMO' } } })
    const r = await suspenderEdicion(SUSPENDER)
    expect(r).toEqual({ ok: false, error: 'conflict', message: 'Esta edición no está por debajo del mínimo de inscritos.' })
    expect(sendBatchMock).not.toHaveBeenCalled()
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})

describe('abrirEdicionIgual (S16)', () => {
  it('calls talleres_abrir_igual and revalidates the edición', async () => {
    const { rpc } = setup()
    const r = await abrirEdicionIgual({ tallerSlug: 's', edicionId: 'e-1', motivo: '  Arrancamos  ' })
    expect(rpc).toHaveBeenCalledWith('talleres_abrir_igual', { p_edicion_id: 'e-1', p_motivo: 'Arrancamos' })
    expect(r).toEqual({ ok: true })
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/s/e-1')
  })

  it('anyone but the director or the coordinador gets the S16 message', async () => {
    setup({ rpc: { data: null, error: { code: '42501', message: 'sin_permisos_para_abrir_igual' } } })
    const r = await abrirEdicionIgual({ tallerSlug: 's', edicionId: 'e-1', motivo: null })
    expect(r).toEqual({
      ok: false,
      error: 'forbidden',
      message: 'Solo la dirección y el coordinador del taller pueden abrir por debajo del mínimo.',
    })
  })
})

describe('confirmarPorTelefono', () => {
  it('calls the RPC and revalidates', async () => {
    const { rpc } = setup()
    const r = await confirmarPorTelefono({ tallerSlug: 's', edicionId: 'e-1', inscripcionId: 'i-1' })
    expect(rpc).toHaveBeenCalledWith('talleres_confirmar_por_telefono', { p_inscripcion_id: 'i-1' })
    expect(r).toEqual({ ok: true })
  })

  it('an expired confirmation is explained', async () => {
    setup({ rpc: { data: null, error: { code: 'P0001', message: 'CONFIRMACION_VENCIDA' } } })
    const r = await confirmarPorTelefono({ tallerSlug: 's', edicionId: 'e-1', inscripcionId: 'i-1' })
    expect(r).toEqual({ ok: false, error: 'conflict', message: 'El plazo para confirmar ya venció.' })
  })
})

describe('responderCambioFecha', () => {
  it('mantener → confirmada', async () => {
    const { rpc } = setup()
    const r = await responderCambioFecha({ inscripcionId: 'i-1', respuesta: 'mantener', motivo: 'ignorado' })
    expect(rpc).toHaveBeenCalledWith('talleres_confirmar_cambio_fecha', { p_inscripcion_id: 'i-1', p_respuesta: 'mantener', p_motivo: 'ignorado' })
    expect(r).toEqual({ ok: true, confirmacion: 'confirmada' })
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/mi-recorrido')
  })

  it('no_puedo → no_puede', async () => {
    setup()
    const r = await responderCambioFecha({ inscripcionId: 'i-1', respuesta: 'no_puedo', motivo: ' Viajo ' })
    expect(r).toEqual({ ok: true, confirmacion: 'no_puede' })
  })

  it('an unknown answer never reaches the RPC', async () => {
    const { rpc } = setup()
    // @ts-expect-error — a stale client could send anything
    const r = await responderCambioFecha({ inscripcionId: 'i-1', respuesta: 'quizas' })
    expect(r).toEqual({ ok: false, error: 'invalid-input', message: 'Elige una respuesta.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("someone else's inscription is refused", async () => {
    setup({ rpc: { data: null, error: { code: '42501', message: 'sin_permisos_para_esta_inscripcion' } } })
    const r = await responderCambioFecha({ inscripcionId: 'i-2', respuesta: 'mantener' })
    expect(r).toEqual({ ok: false, error: 'forbidden', message: 'No tienes permisos para esta inscripción.' })
  })
})

describe('mínimo de inscritos (Configuración)', () => {
  function fromLectura(data: unknown) {
    const maybeSingle = jest.fn().mockResolvedValue({ data, error: null })
    const eq = jest.fn().mockReturnValue({ maybeSingle })
    const select = jest.fn().mockReturnValue({ eq })
    return { from: jest.fn().mockReturnValue({ select }), select, eq }
  }

  function fromEscritura(data: unknown) {
    const select = jest.fn().mockResolvedValue({ data, error: null })
    const eq = jest.fn().mockReturnValue({ select })
    const update = jest.fn().mockReturnValue({ eq })
    return { from: jest.fn().mockReturnValue({ update }), update, eq }
  }

  it('reads the current minimum (null = sin mínimo)', async () => {
    const f = fromLectura({ minimo_inscritos: 15 })
    setup({ from: f.from })
    expect(await leerMinimoInscritos('t-1')).toEqual({ ok: true, minimo: 15 })
    expect(f.from).toHaveBeenCalledWith('talleres')
    expect(f.eq).toHaveBeenCalledWith('id', 't-1')
    setup({ from: fromLectura({ minimo_inscritos: null }).from })
    expect(await leerMinimoInscritos('t-1')).toEqual({ ok: true, minimo: null })
  })

  it('saves a valid minimum and revalidates the taller', async () => {
    const f = fromEscritura([{ id: 't-1' }])
    setup({ from: f.from })
    const r = await guardarMinimoInscritos({ tallerId: 't-1', tallerSlug: 's', minimo: 15 })
    expect(r).toEqual({ ok: true })
    expect(f.update).toHaveBeenCalledWith({ minimo_inscritos: 15 })
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/s')
  })

  it('null clears the minimum', async () => {
    const f = fromEscritura([{ id: 't-1' }])
    setup({ from: f.from })
    await guardarMinimoInscritos({ tallerId: 't-1', tallerSlug: 's', minimo: null })
    expect(f.update).toHaveBeenCalledWith({ minimo_inscritos: null })
  })

  it('rejects 0, decimals and huge values without writing', async () => {
    const f = fromEscritura([{ id: 't-1' }])
    setup({ from: f.from })
    for (const minimo of [0, 2.5, 501]) {
      const r = await guardarMinimoInscritos({ tallerId: 't-1', tallerSlug: 's', minimo })
      expect(r).toEqual({
        ok: false,
        error: 'invalid-input',
        message: 'El mínimo de inscritos debe ser un entero entre 1 y 500, o vacío para no tener mínimo.',
      })
    }
    expect(f.update).not.toHaveBeenCalled()
  })

  it('an RLS-empty update (not director) is forbidden', async () => {
    setup({ from: fromEscritura([]).from })
    const r = await guardarMinimoInscritos({ tallerId: 't-1', tallerSlug: 's', minimo: 3 })
    expect(r).toEqual({ ok: false, error: 'forbidden', message: 'No tienes permisos para hacer este cambio.' })
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})
