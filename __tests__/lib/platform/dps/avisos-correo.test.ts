/**
 * @jest-environment node
 *
 * T16b (odd/tasks/dps-asistencia-pco.md, S14.1, S14.2, S14.4, S14.5) — the
 * e-mail outbox of the DPS notices: lease → register the confirm links →
 * one e-mail per person (HTML + text, Reply-To the planner, idempotency key
 * `dps-avisos/<row id>`) → record each result; people without an e-mail get
 * no row to send; a retried row derives the same link and key; one failure
 * never stops the rest; the confirm page reads and confirms through the
 * service RPCs. Every person is fictitious.
 */
import { isValidElement } from 'react'

import {
  claveIdempotencia,
  confirmarEnlace,
  consultarEnlace,
  despacharCorreosDps,
  direccionResponder,
  ejecutarJobDps,
  enviarCorreosDps,
  esTokenConFormato,
  hashToken,
  leerServicioEnlace,
  parseFilasCorreo,
  prepararCorreo,
  tokenConfirmar,
  urlConfirmar,
  urlPlan,
  type ClienteAdminDps,
  type CorreoDps,
} from '@/lib/platform/dps/avisos-correo'

jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))

// The drain logs row ids of what failed; keep the output clean.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  jest.restoreAllMocks()
})

const BASE = 'https://connect.example'
const SECRETO = 'secreto-de-prueba'
const PLAN = '11111111-1111-4111-8111-111111111111'
const PLAN2 = '22222222-2222-4222-8222-222222222222'
const AVISO = '33333333-3333-4333-8333-333333333333'
const AVISO2 = '44444444-4444-4444-8444-444444444444'
const AVISO3 = '55555555-5555-4555-8555-555555555555'

const rol = (nombre: string, equipo = 'Producción Creativa') => ({ origen: 'puesto', puesto_id: null, columna: null, nombre, equipo, direccion: equipo, automatico: false })
const servicio = (planId: string, fecha: string, extra: Record<string, unknown> = {}) => ({
  plan_id: planId,
  fecha,
  tipo: 'domingo',
  titulo: null,
  semana: 4,
  serie: { nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: null },
  roles: [rol('Comunicador')],
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  estado: 'pendiente',
  motivo: null,
  respondido_at: null,
  cambio: false,
  quitado: false,
  visto_at: null,
  antes: { roles: null, fecha: null, horarios: null, llegada: null },
  enviado_at: '2026-11-09T22:42:00Z',
  enviado_por: 'Andrés Valero',
  ...extra,
})
const bloque = (avisoId: string, version: number, aviso: string, confirmar: boolean, s: Record<string, unknown>) => ({ ...s, aviso_id: avisoId, version, aviso, confirmar })

function filaAvisos(id: string, bloques: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id,
    tipo: 'avisos',
    email: 'valentina@example.test',
    nombre: 'Valentina',
    responder_nombre: 'Andrés Valero',
    responder_email: 'andres@example.test',
    datos: { bloques, avisos: bloques.length },
    intentos: 1,
    ...extra,
  }
}

const FILA_NO_PUEDE = {
  id: 'f-np',
  tipo: 'no_puede',
  email: 'andres@example.test',
  nombre: 'Andrés',
  responder_nombre: 'Óscar Rivas',
  responder_email: 'oscar@example.test',
  datos: {
    ...servicio(PLAN, '2026-11-15', {
      roles: [rol('Cámara 2', 'Video')],
      estado: 'no_puede',
      motivo: 'Estoy de viaje a Mérida.',
      respondido_at: '2026-11-13T01:14:00Z',
    }),
    aviso_id: AVISO,
    persona: 'Óscar Rivas',
    puestos: [
      {
        nombre: 'Cámara 2',
        equipo: 'Video',
        cantidad: 3,
        cubiertos: 2,
        personas: [
          { nombre: 'Daniela Montes', estado: 'confirmo' },
          { nombre: 'Óscar Rivas', estado: 'no_puede' },
          { nombre: 'Esteban Yánez', estado: 'pendiente' },
        ],
      },
    ],
  },
  intentos: 1,
}

function cliente(filas: unknown[], { errorReclamo, errorTokens }: { errorReclamo?: string; errorTokens?: string } = {}) {
  const rpc = jest.fn((nombre: string): Promise<{ data: unknown; error: { message: string } | null }> => {
    if (nombre === 'dps_avisos_correos_reclamar') {
      return Promise.resolve(errorReclamo ? { data: null, error: { message: errorReclamo } } : { data: filas, error: null })
    }
    if (nombre === 'dps_avisos_tokens_registrar' && errorTokens) return Promise.resolve({ data: null, error: { message: errorTokens } })
    return Promise.resolve({ data: 1, error: null })
  })
  return { client: { rpc } as unknown as ClienteAdminDps, rpc }
}

const opciones = (enviarCorreo: (c: CorreoDps) => Promise<{ success: boolean; error?: string }>) => ({ enviarCorreo, urlBase: BASE, secreto: SECRETO, pausaMs: 0 })

describe('confirm links', () => {
  it('derive the same 43-character token for the same notice version, another for the next version', () => {
    const a = tokenConfirmar(AVISO, 1, SECRETO)
    expect(esTokenConFormato(a)).toBe(true)
    expect(tokenConfirmar(AVISO, 1, SECRETO)).toBe(a)
    expect(tokenConfirmar(AVISO, 2, SECRETO)).not.toBe(a)
    expect(tokenConfirmar(AVISO2, 1, SECRETO)).not.toBe(a)
    expect(tokenConfirmar(AVISO, 1, 'otro')).not.toBe(a)
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(esTokenConFormato('corto')).toBe(false)
    expect(esTokenConFormato(`${a}/x`)).toBe(false)
  })

  it('point the plan e-mail at /dps/plan?plan=<id>', () => {
    expect(urlPlan(`${BASE}/`, PLAN)).toBe(`${BASE}/dps/plan?plan=${PLAN}`)
  })

  it('format Reply-To as name and address, without characters that break the header', () => {
    expect(direccionResponder('Andrés Valero', 'andres@example.test')).toBe('Andrés Valero <andres@example.test>')
    expect(direccionResponder('Ana "La" <Jefa>', 'ana@example.test')).toBe('Ana La Jefa <ana@example.test>')
    expect(direccionResponder(null, 'ana@example.test')).toBe('ana@example.test')
    expect(direccionResponder('Ana', null)).toBeNull()
  })
})

describe('parseFilasCorreo', () => {
  it('keeps the rows with id, tipo and e-mail', () => {
    const filas = parseFilasCorreo([filaAvisos('f1', []), { id: 'f2', tipo: 'avisos', email: null, datos: {} }, { id: 'f3', tipo: 'otro', email: 'x@y.z' }, null])
    expect(filas.map((f) => [f.id, f.tipo, f.email, f.responderEmail])).toEqual([['f1', 'avisos', 'valentina@example.test', 'andres@example.test']])
    expect(parseFilasCorreo(null)).toEqual([])
  })
})

describe('prepararCorreo (avisos)', () => {
  it('builds ONE e-mail with every notice of the send, a link only for those that ask for an answer', () => {
    const [fila] = parseFilasCorreo([
      filaAvisos('f1', [
        bloque(AVISO, 1, 'nueva', true, servicio(PLAN, '2026-11-15')),
        bloque(AVISO2, 3, 'cambio', false, servicio(PLAN2, '2026-11-29', { estado: 'confirmo', horarios: ['11:30'], antes: { roles: null, fecha: null, horarios: ['09:00', '11:30'], llegada: null } })),
        bloque(AVISO3, 2, 'quitado', false, servicio('66666666-6666-4666-8666-666666666666', '2026-11-22', { quitado: true, roles: [rol('Host')] })),
      ]),
    ])
    const p = prepararCorreo(fila, BASE, SECRETO)!
    expect(p.tokens).toEqual([{ hash: hashToken(tokenConfirmar(AVISO, 1, SECRETO)), aviso_id: AVISO, version: 1 }])
    expect(p.correo).toMatchObject({
      to: 'valentina@example.test',
      subject: 'Novedades de tus servicios · domingos 15, 22 y 29',
      replyTo: 'Andrés Valero <andres@example.test>',
      idempotencyKey: 'dps-avisos/f1',
    })
    expect(isValidElement(p.correo.template)).toBe(true)
    expect(p.correo.text).toContain(`Confirmar (un toque, sin iniciar sesión):\n${BASE}/dps/confirmar/${tokenConfirmar(AVISO, 1, SECRETO)}`)
    expect(p.correo.text).toContain(`No puedo (abre Global Connect para escribir el motivo):\n${BASE}/mis-servicios/${PLAN}#no-puedo`)
    expect(p.correo.text).toContain(`Ver o cambiar mi respuesta:\n${BASE}/mis-servicios/${PLAN2}`)
    expect(p.correo.text).toContain(`Ver mis servicios:\n${BASE}/mis-servicios`)
    expect(p.correo.text.match(/\/dps\/confirmar\//g)).toHaveLength(1)
  })

  it('drops a row whose notices cannot be read, and goes without Reply-To when the planner has no e-mail', () => {
    expect(prepararCorreo(parseFilasCorreo([filaAvisos('f1', [{ aviso: 'nueva' }])])[0], BASE, SECRETO)).toBeNull()
    const [fila] = parseFilasCorreo([filaAvisos('f2', [bloque(AVISO, 1, 'nueva', true, servicio(PLAN, '2026-11-15'))], { responder_email: null })])
    expect(prepararCorreo(fila, BASE, SECRETO)!.correo.replyTo).toBeNull()
  })
})

describe('prepararCorreo (no_puede)', () => {
  it('writes to the planner, replies to the person who cannot and links the plan (S14.4)', () => {
    const p = prepararCorreo(parseFilasCorreo([FILA_NO_PUEDE])[0], BASE, SECRETO)!
    expect(p.tokens).toEqual([])
    expect(p.correo).toMatchObject({
      to: 'andres@example.test',
      subject: 'Óscar Rivas no puede el domingo 15 · Cámara 2',
      replyTo: 'Óscar Rivas <oscar@example.test>',
      idempotencyKey: 'dps-avisos/f-np',
    })
    expect(p.correo.text).toContain(`Buscar reemplazo:\n${BASE}/dps/plan?plan=${PLAN}`)
    expect(p.correo.text).toContain('Motivo: «Estoy de viaje a Mérida.»')
    expect(p.correo.text).toContain('CÁMARA 2: 2 DE 3 (falta 1 persona)')
  })
})

describe('enviarCorreosDps', () => {
  it('registers the links before sending, sends one e-mail per row and records each result', async () => {
    const orden: string[] = []
    const { client, rpc } = cliente([filaAvisos('f1', [bloque(AVISO, 1, 'nueva', true, servicio(PLAN, '2026-11-15'))]), FILA_NO_PUEDE])
    rpc.mockImplementation((nombre: string) => {
      orden.push(nombre)
      return Promise.resolve(
        nombre === 'dps_avisos_correos_reclamar'
          ? { data: [filaAvisos('f1', [bloque(AVISO, 1, 'nueva', true, servicio(PLAN, '2026-11-15'))]), FILA_NO_PUEDE], error: null }
          : { data: 1, error: null },
      )
    })
    const enviar = jest.fn(async (c: CorreoDps) => {
      orden.push(`enviar ${c.idempotencyKey}`)
      return { success: true }
    })

    const r = await enviarCorreosDps(client, { ...opciones(enviar), limite: 10, topeDiario: 30 })

    expect(r).toEqual({ reclamados: 2, enviados: 2, fallidos: 0 })
    expect(rpc).toHaveBeenCalledWith('dps_avisos_correos_reclamar', { p_limite: 10, p_tope_diario: 30 })
    expect(rpc).toHaveBeenCalledWith('dps_avisos_tokens_registrar', { p_tokens: [{ hash: hashToken(tokenConfirmar(AVISO, 1, SECRETO)), aviso_id: AVISO, version: 1 }] })
    expect(orden).toEqual([
      'dps_avisos_correos_reclamar',
      'dps_avisos_tokens_registrar',
      'enviar dps-avisos/f1',
      'dps_avisos_correos_resultado',
      'enviar dps-avisos/f-np',
      'dps_avisos_correos_resultado',
    ])
    expect(rpc).toHaveBeenCalledWith('dps_avisos_correos_resultado', { p_id: 'f1', p_ok: true })
    expect(rpc).toHaveBeenCalledWith('dps_avisos_correos_resultado', { p_id: 'f-np', p_ok: true })
  })

  it('a retried row carries the same idempotency key and the same link: the person never gets two different e-mails', async () => {
    const fila = filaAvisos('f1', [bloque(AVISO, 1, 'nueva', true, servicio(PLAN, '2026-11-15'))])
    const enviados: CorreoDps[] = []
    const enviar = jest.fn(async (c: CorreoDps) => {
      enviados.push(c)
      return enviados.length === 1 ? { success: false, error: 'rate_limit_exceeded' } : { success: true }
    })
    const primero = cliente([fila])
    expect(await enviarCorreosDps(primero.client, opciones(enviar))).toEqual({ reclamados: 1, enviados: 0, fallidos: 1 })
    expect(primero.rpc).toHaveBeenCalledWith('dps_avisos_correos_resultado', { p_id: 'f1', p_ok: false, p_error: 'rate_limit_exceeded' })
    const segundo = cliente([{ ...fila, intentos: 2 }])
    expect(await enviarCorreosDps(segundo.client, opciones(enviar))).toEqual({ reclamados: 1, enviados: 1, fallidos: 0 })
    expect(enviados[1].idempotencyKey).toBe(enviados[0].idempotencyKey)
    expect(enviados[1].text).toBe(enviados[0].text)
  })

  it('sends nothing when the outbox has nothing due (a second send of the same notices queues nothing)', async () => {
    const { client, rpc } = cliente([])
    const enviar = jest.fn()
    expect(await enviarCorreosDps(client, opciones(enviar))).toEqual({ reclamados: 0, enviados: 0, fallidos: 0 })
    expect(enviar).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('does not send an e-mail whose links could not be registered, and keeps going', async () => {
    const { client, rpc } = cliente([filaAvisos('f1', [bloque(AVISO, 1, 'nueva', true, servicio(PLAN, '2026-11-15'))]), FILA_NO_PUEDE], { errorTokens: 'boom' })
    const enviar = jest.fn(async () => ({ success: true }))
    expect(await enviarCorreosDps(client, opciones(enviar))).toEqual({ reclamados: 2, enviados: 1, fallidos: 1 })
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('dps_avisos_correos_resultado', { p_id: 'f1', p_ok: false, p_error: 'tokens: boom' })
  })

  it('records a thrown send and a row it cannot read as failures, never stopping', async () => {
    const { client, rpc } = cliente([filaAvisos('f1', [{ nada: true }]), FILA_NO_PUEDE])
    const enviar = jest.fn(async () => {
      throw new Error('red caída')
    })
    expect(await enviarCorreosDps(client, opciones(enviar))).toEqual({ reclamados: 2, enviados: 0, fallidos: 2 })
    expect(rpc).toHaveBeenCalledWith('dps_avisos_correos_resultado', { p_id: 'f1', p_ok: false, p_error: 'datos_invalidos' })
    expect(rpc).toHaveBeenCalledWith('dps_avisos_correos_resultado', { p_id: 'f-np', p_ok: false, p_error: 'red caída' })
  })

  it('throws when the lease fails or no link key is configured', async () => {
    await expect(enviarCorreosDps(cliente([], { errorReclamo: 'boom' }).client, opciones(jest.fn()))).rejects.toThrow('No se pudieron tomar los correos: boom')
    await expect(enviarCorreosDps(cliente([]).client, { ...opciones(jest.fn()), secreto: '' })).rejects.toThrow('DPS_AVISOS_SECRETO')
  })

  it('uses dps-avisos/<row id> as the key', () => {
    expect(claveIdempotencia('abc')).toBe('dps-avisos/abc')
  })
})

describe('despacharCorreosDps and ejecutarJobDps', () => {
  it('the immediate dispatch never throws', async () => {
    const admin = jest.requireMock('@/lib/supabase/admin') as { createSupabaseAdminClient: jest.Mock }
    admin.createSupabaseAdminClient.mockImplementation(() => {
      throw new Error('sin variables')
    })
    await expect(despacharCorreosDps()).resolves.toBeUndefined()
  })

  it('the daily job runs the reminder and the outbox steps and reports a failed step by name', async () => {
    const ok = await ejecutarJobDps(cliente([]).client, opciones(jest.fn()))
    expect(ok).toEqual({ recordatorio: { activo: false, fecha: null, personas: 0, encolados: 0 }, correos: { reclamados: 0, enviados: 0, fallidos: 0 }, fallos: [] })
    const mal = await ejecutarJobDps(cliente([], { errorReclamo: 'boom' }).client, opciones(jest.fn()))
    expect(mal).toEqual({ recordatorio: { activo: false, fecha: null, personas: 0, encolados: 0 }, correos: null, fallos: ['correos'] })
  })
})

describe('the confirm page RPCs', () => {
  const TOKEN = tokenConfirmar(AVISO, 1, SECRETO)

  it('reads without confirming, and confirms with the button', async () => {
    const { client, rpc } = cliente([])
    rpc.mockResolvedValueOnce({ data: { estado: 'por_confirmar', plan_id: PLAN, fecha: '2026-11-15', roles: [{ nombre: 'Comunicador', equipo: 'Producción Creativa' }], horarios: ['09:00'], llegada: '07:30' }, error: null })
    const leido = await consultarEnlace(client, TOKEN)
    expect(rpc).toHaveBeenLastCalledWith('dps_aviso_token_leer', { p_token: TOKEN })
    expect(leido).toMatchObject({ estado: 'por_confirmar', planId: PLAN, fecha: '2026-11-15', llegada: '07:30', roles: [{ nombre: 'Comunicador', equipo: 'Producción Creativa' }] })
    rpc.mockResolvedValueOnce({ data: { estado: 'confirmado', plan_id: PLAN, fecha: '2026-11-15' }, error: null })
    expect((await confirmarEnlace(client, TOKEN)).estado).toBe('confirmado')
    expect(rpc).toHaveBeenLastCalledWith('dps_aviso_token_confirmar', { p_token: TOKEN })
  })

  it('never asks the database for a malformed token, and reads an RPC failure as error', async () => {
    const { client, rpc } = cliente([])
    expect((await confirmarEnlace(client, 'x')).estado).toBe('invalido')
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect((await consultarEnlace(client, TOKEN)).estado).toBe('error')
  })

  it('reads an unknown answer as invalido and keeps the before of a change', () => {
    expect(leerServicioEnlace({ estado: 'raro' }).estado).toBe('invalido')
    expect(leerServicioEnlace(null).estado).toBe('invalido')
    const cambio = leerServicioEnlace({ estado: 'cambio', plan_id: PLAN, fecha: '2026-11-15', antes: { llegada: '07:30', roles: null, horarios: null, fecha: null }, llegada: '07:00' })
    expect(cambio.antes).toEqual({ roles: null, fecha: null, horarios: null, llegada: '07:30' })
  })
})

// ── T16c: the reminder (S14.3) ────────────────────────────────────────

const ORDEN = [
  { id: 'o1', posicion: 0, tipo: 'encabezado', titulo: 'Servicio', duracion_seg: 0, notas: null, responsable: null, fase: 'servicio' },
  { id: 'o2', posicion: 1, tipo: 'item', titulo: 'Cuenta regresiva', duracion_seg: 300, notas: null, responsable: null, fase: null },
  { id: 'o3', posicion: 2, tipo: 'item', titulo: 'Anuncios', duracion_seg: 300, notas: 'Cena del Señor', responsable: 'Comunicador', fase: null },
]
const EQUIPO = { personas: 34, confirmaron: 29, direcciones: [{ nombre: 'Producción Creativa', personas: 4 }, { nombre: 'Producción Técnica', personas: 30 }] }
const bloqueRecordatorio = (avisoId: string, version: number, confirmar: boolean, s: Record<string, unknown>) => ({
  ...s,
  aviso_id: avisoId,
  version,
  confirmar,
  orden: ORDEN,
  equipo: EQUIPO,
})
const filaRecordatorio = (id: string, bloques: unknown[], dias: unknown = 2) => ({
  id,
  tipo: 'recordatorio',
  email: 'valentina@example.test',
  nombre: 'Valentina',
  responder_nombre: 'Andrés Valero',
  responder_email: 'andres@example.test',
  datos: { bloques, avisos: bloques.length, dias },
  intentos: 1,
})
const PENDIENTE_15 = bloqueRecordatorio(AVISO, 3, true, servicio(PLAN, '2026-11-15'))
const CONFIRMADO_15 = bloqueRecordatorio(AVISO, 3, false, servicio(PLAN, '2026-11-15', { estado: 'confirmo' }))

describe('prepararCorreo (recordatorio)', () => {
  it('parses a reminder row', () => {
    expect(parseFilasCorreo([filaRecordatorio('r1', [PENDIENTE_15])]).map((f) => [f.id, f.tipo])).toEqual([['r1', 'recordatorio']])
  })

  it('a pending one carries the same confirm link as the notice of that version, Reply-To the planner', () => {
    const p = prepararCorreo(parseFilasCorreo([filaRecordatorio('r1', [PENDIENTE_15])])[0], BASE, SECRETO)!
    const token = tokenConfirmar(AVISO, 3, SECRETO)
    expect(p.tokens).toEqual([{ hash: hashToken(token), aviso_id: AVISO, version: 3 }])
    expect(p.correo).toMatchObject({
      to: 'valentina@example.test',
      subject: '¿Puedes servir este domingo 15? Aún no respondes',
      replyTo: 'Andrés Valero <andres@example.test>',
      idempotencyKey: 'dps-avisos/r1',
    })
    expect(isValidElement(p.correo.template)).toBe(true)
    expect(p.correo.text).toContain(`Confirmar (un toque, sin iniciar sesión):\n${urlConfirmar(BASE, token)}`)
    expect(p.correo.text).toContain(`No puedo (abre Global Connect para escribir el motivo):\n${BASE}/mis-servicios/${PLAN}#no-puedo`)
    expect(p.correo.text).toContain('Recibes este recordatorio 2 días antes; tu director puede cambiarlo.')
  })

  it('a confirmed one has no link to confirm, and finds the person\'s part in the order by puesto', () => {
    const p = prepararCorreo(parseFilasCorreo([filaRecordatorio('r2', [CONFIRMADO_15], 3)])[0], BASE, SECRETO)!
    expect(p.tokens).toEqual([])
    expect(p.correo.subject).toBe('Este domingo sirves · Comunicador, llegada 7:30')
    expect(p.correo.text).not.toContain('/dps/confirmar/')
    expect(p.correo.text).toContain('Tu parte: Anuncios a las 9:05 y 11:35 (Cena del Señor · 5 min)')
    expect(p.correo.text).toContain(' 9:05  Anuncios · Cena del Señor (5 min)   ← TÚ')
    expect(p.correo.text).toContain('34 personas · 29 confirmaron')
    expect(p.correo.text).toContain('Recibes este recordatorio 3 días antes')
  })

  it('reads days outside 1–7 as 2 and drops a row it cannot read', () => {
    expect(prepararCorreo(parseFilasCorreo([filaRecordatorio('r3', [CONFIRMADO_15], 30)])[0], BASE, SECRETO)!.correo.text).toContain(
      'Recibes este recordatorio 2 días antes',
    )
    expect(prepararCorreo(parseFilasCorreo([filaRecordatorio('r4', [{ nada: true }])])[0], BASE, SECRETO)).toBeNull()
  })
})

describe('ejecutarJobDps (the reminder step)', () => {
  it('queues today\'s reminders first, then sends them through the outbox within the daily cap', async () => {
    const orden: string[] = []
    const rpc = jest.fn((nombre: string) => {
      orden.push(nombre)
      if (nombre === 'dps_recordatorios_encolar') return Promise.resolve({ data: { activo: true, fecha: '2026-11-15', dias: 2, personas: 2, encolados: 2 }, error: null })
      if (nombre === 'dps_avisos_correos_reclamar') {
        return Promise.resolve({ data: [filaRecordatorio('r1', [PENDIENTE_15]), { ...filaRecordatorio('r2', [CONFIRMADO_15]), email: 'oscar@example.test' }], error: null })
      }
      return Promise.resolve({ data: 1, error: null })
    })
    const enviados: CorreoDps[] = []
    const enviar = jest.fn(async (c: CorreoDps) => {
      enviados.push(c)
      return { success: true }
    })

    const r = await ejecutarJobDps({ rpc } as unknown as ClienteAdminDps, { ...opciones(enviar), topeDiario: 40 })

    expect(r).toEqual({ recordatorio: { activo: true, fecha: '2026-11-15', personas: 2, encolados: 2 }, correos: { reclamados: 2, enviados: 2, fallidos: 0 }, fallos: [] })
    expect(orden.slice(0, 2)).toEqual(['dps_recordatorios_encolar', 'dps_avisos_correos_reclamar'])
    expect(rpc).toHaveBeenCalledWith('dps_avisos_correos_reclamar', { p_limite: 50, p_tope_diario: 40 })
    expect(enviados.map((c) => [c.to, c.idempotencyKey])).toEqual([
      ['valentina@example.test', 'dps-avisos/r1'],
      ['oscar@example.test', 'dps-avisos/r2'],
    ])
    expect(rpc).toHaveBeenCalledWith('dps_avisos_correos_resultado', { p_id: 'r1', p_ok: true })
  })

  it('a failed reminder step never stops the outbox', async () => {
    const rpc = jest.fn((nombre: string) =>
      Promise.resolve(nombre === 'dps_recordatorios_encolar' ? { data: null, error: { message: 'boom' } } : { data: nombre === 'dps_avisos_correos_reclamar' ? [] : 1, error: null }),
    )
    const r = await ejecutarJobDps({ rpc } as unknown as ClienteAdminDps, opciones(jest.fn()))
    expect(r).toEqual({ recordatorio: null, correos: { reclamados: 0, enviados: 0, fallidos: 0 }, fallos: ['recordatorio'] })
  })

  it('switched off, it queues nothing', async () => {
    const rpc = jest.fn((nombre: string) =>
      Promise.resolve(
        nombre === 'dps_recordatorios_encolar'
          ? { data: { activo: false, fecha: null, dias: 2, personas: 0, encolados: 0 }, error: null }
          : { data: nombre === 'dps_avisos_correos_reclamar' ? [] : 1, error: null },
      ),
    )
    const r = await ejecutarJobDps({ rpc } as unknown as ClienteAdminDps, opciones(jest.fn()))
    expect(r.recordatorio).toEqual({ activo: false, fecha: null, personas: 0, encolados: 0 })
  })
})
