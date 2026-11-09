/**
 * @jest-environment node
 *
 * T3a (odd/tasks/ninos-checkin-pco.md, S10): the print agent's loop with injected
 * fetch and printer fakes. Contract: docs/ninos/impresion.md (Agent API).
 */
import { crearAgente, esperaTrasError, etiquetasDePrueba, leerConfig } from '@/tools/agente-impresion/agente'

const TOKEN = 'a'.repeat(64)
const SERVIDOR = 'https://app.ejemplo.org'
const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

type Llamada = { url: string; method: string; headers: Record<string, string>; body?: unknown }

const trabajo = (id: string) => ({
  id,
  tipo: 'nino',
  intentos: 1,
  created_at: '2026-11-08T13:05:00Z',
  payload: {
    nombre: 'Valentina', apellido: 'Rodríguez Peña', codigo: '4827', salon: 'Salón 3 años',
    area: 'waumba', alergias: true, fecha: '2026-11-08', servicio: 'Segundo servicio', hora: '11:00',
  },
})

function fakeFetch(respuestaGet: { status: number; body?: unknown } | Error) {
  const llamadas: Llamada[] = []
  const fetch = jest.fn(async (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
    const method = init.method ?? 'GET'
    llamadas.push({ url, method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined })
    if (method === 'GET') {
      if (respuestaGet instanceof Error) throw respuestaGet
      return { ok: respuestaGet.status < 300, status: respuestaGet.status, json: async () => respuestaGet.body }
    }
    const b = JSON.parse(init.body as string)
    return { ok: true, status: 200, json: async () => ({ id: b.id, estado: b.estado }) }
  })
  return { fetch, llamadas }
}

function agente(fetch: unknown, imprimir: unknown) {
  const lineas: string[] = []
  const a = crearAgente({
    config: { servidor: SERVIDOR, token: TOKEN, impresora: 'Xprinter', intervaloMs: 2000, modo: 'tspl', gapMm: 2 },
    fetch: fetch as never,
    imprimir: imprimir as never,
    log: (...args: unknown[]) => lineas.push(args.join(' ')),
    dormir: async () => {},
  })
  return { a, lineas }
}

const estacion = (ancho: number | null, alto: number | null) => ({ id: 'e1', nombre: 'Mesa Waumba', ancho_mm: ancho, alto_mm: alto, dpi: 203 })
const reportes = (ll: Llamada[]) => ll.filter((l) => l.method === 'POST').map((l) => l.body)

describe('crearAgente().ciclo', () => {
  it('claims with the Bearer token, prints each job raw and reports it as impresa', async () => {
    const { fetch, llamadas } = fakeFetch({ status: 200, body: { estacion: estacion(102, 51), trabajos: [trabajo(ID1), trabajo(ID2)] } })
    const imprimir = jest.fn(async () => {})
    const { a, lineas } = agente(fetch, imprimir)

    const r = await a.ciclo()

    expect(r).toEqual({ estado: 'ok', reclamados: 2, impresas: 2, errores: 0 })
    expect(llamadas[0]).toMatchObject({ url: `${SERVIDOR}/api/ninos/impresion/agente?max=10`, method: 'GET' })
    expect(llamadas[0].headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(imprimir).toHaveBeenCalledTimes(2)
    const [bytes, impresora] = imprimir.mock.calls[0] as unknown as [Buffer, string]
    expect(impresora).toBe('Xprinter')
    expect(bytes.toString('latin1').startsWith('SIZE 102 mm,51 mm\r\n')).toBe(true)
    expect(reportes(llamadas)).toEqual([{ id: ID1, estado: 'impresa' }, { id: ID2, estado: 'impresa' }])
    const log = lineas.join('\n')
    expect(log).not.toContain(TOKEN)
    expect(log).not.toMatch(/Valentina|Rodríguez|4827/)
  })

  it('reports a printer failure as error with a message free of label data', async () => {
    const { fetch, llamadas } = fakeFetch({ status: 200, body: { estacion: estacion(50, 30), trabajos: [trabajo(ID1)] } })
    const imprimir = jest.fn(async () => { throw new Error('lp_salida_1: lp: The printer or class does not exist.') })
    const { a } = agente(fetch, imprimir)

    expect(await a.ciclo()).toEqual({ estado: 'ok', reclamados: 1, impresas: 0, errores: 1 })
    expect(reportes(llamadas)).toEqual([{ id: ID1, estado: 'error', error: 'lp_salida_1: lp: The printer or class does not exist.' }])
  })

  it('S10: prints at 102 × 51 mm while the station has no size, and says so once', async () => {
    const { fetch, llamadas } = fakeFetch({ status: 200, body: { estacion: estacion(null, null), trabajos: [trabajo(ID1), trabajo(ID2)] } })
    const imprimir = jest.fn(async () => {})
    const { a, lineas } = agente(fetch, imprimir)

    expect(await a.ciclo()).toEqual({ estado: 'ok', reclamados: 2, impresas: 2, errores: 0 })
    await a.ciclo()
    const [bytes] = imprimir.mock.calls[0] as unknown as [Buffer]
    expect(bytes.toString('latin1').startsWith('SIZE 102 mm,51 mm\r\n')).toBe(true)
    expect(reportes(llamadas).slice(0, 2)).toEqual([{ id: ID1, estado: 'impresa' }, { id: ID2, estado: 'impresa' }])
    expect(lineas.filter((l) => l.includes('102 × 51 mm') && /sin medidas/i.test(l))).toHaveLength(1)
  })

  it('prints at the station size when it has one', async () => {
    const { fetch } = fakeFetch({ status: 200, body: { estacion: estacion(57, 32), trabajos: [trabajo(ID1)] } })
    const imprimir = jest.fn(async () => {})
    await agente(fetch, imprimir).a.ciclo()
    const [bytes] = imprimir.mock.calls[0] as unknown as [Buffer]
    expect(bytes.toString('latin1').startsWith('SIZE 57 mm,32 mm\r\n')).toBe(true)
  })

  it('returns no_autorizado on 401 and prints nothing', async () => {
    const { fetch, llamadas } = fakeFetch({ status: 401, body: { error: { code: '401' } } })
    const imprimir = jest.fn(async () => {})
    const { a } = agente(fetch, imprimir)

    expect(await a.ciclo()).toEqual({ estado: 'no_autorizado', reclamados: 0, impresas: 0, errores: 0 })
    expect(imprimir).not.toHaveBeenCalled()
    expect(reportes(llamadas)).toEqual([])
  })

  it('returns error_red when the server cannot be reached or answers 5xx', async () => {
    expect((await agente(fakeFetch(new TypeError('fetch failed')).fetch, jest.fn()).a.ciclo()).estado).toBe('error_red')
    expect((await agente(fakeFetch({ status: 500 }).fetch, jest.fn()).a.ciclo()).estado).toBe('error_red')
  })

  it('does not print a job twice when its report failed and the server hands it out again', async () => {
    const body = { estacion: estacion(102, 51), trabajos: [trabajo(ID1)] }
    let falla = true
    const fetch = jest.fn(async (_url: string, init: { method?: string; body?: string }) => {
      if ((init.method ?? 'GET') === 'GET') return { ok: true, status: 200, json: async () => body }
      if (falla) { falla = false; throw new TypeError('fetch failed') }
      return { ok: true, status: 200, json: async () => JSON.parse(init.body as string) }
    })
    const imprimir = jest.fn(async () => {})
    const { a } = agente(fetch, imprimir)

    await a.ciclo()
    await a.ciclo()

    expect(imprimir).toHaveBeenCalledTimes(1)
    const posts = fetch.mock.calls.filter(([, i]) => i.method === 'POST').map(([, i]) => JSON.parse(i.body as string))
    expect(posts.length).toBeGreaterThanOrEqual(2)
    expect(posts.every((b) => b.id === ID1 && b.estado === 'impresa')).toBe(true)
  })
})

describe('crearAgente().ejecutar', () => {
  it('stops with a clear message and exit code 1 on 401', async () => {
    const { a, lineas } = agente(fakeFetch({ status: 401 }).fetch, jest.fn())
    expect(await a.ejecutar()).toBe(1)
    expect(lineas.join('\n')).toMatch(/token/i)
    expect(lineas.join('\n')).not.toContain(TOKEN)
  })

  it('stops cleanly (exit code 0) when detener() is called', async () => {
    const { fetch } = fakeFetch({ status: 200, body: { estacion: estacion(102, 51), trabajos: [] } })
    const { a } = agente(fetch, jest.fn())
    let vueltas = 0
    const original = a.ciclo
    a.ciclo = async () => { if (++vueltas === 3) a.detener(); return original() }
    expect(await a.ejecutar()).toBe(0)
    expect(vueltas).toBe(3)
  })
})

describe('esperaTrasError', () => {
  it('doubles the wait after each network error, capped at 30 s', () => {
    expect(esperaTrasError(0)).toBe(2000)
    expect(esperaTrasError(2000)).toBe(4000)
    expect(esperaTrasError(16000)).toBe(30000)
    expect(esperaTrasError(30000)).toBe(30000)
  })
})

describe('leerConfig', () => {
  const archivo = JSON.stringify({ servidor: `${SERVIDOR}/`, token: TOKEN, impresora: 'Xprinter' })

  it('reads the file, applies defaults and lets env vars override it', () => {
    expect(leerConfig({ texto: archivo, env: {} })).toEqual({ servidor: SERVIDOR, token: TOKEN, impresora: 'Xprinter', intervaloMs: 2000, modo: 'tspl', gapMm: 2 })
    const env = { GC_AGENTE_TOKEN: 'b'.repeat(64), GC_AGENTE_IMPRESORA: 'Otra', GC_AGENTE_INTERVALO_MS: '5000' }
    expect(leerConfig({ texto: archivo, env })).toMatchObject({ token: 'b'.repeat(64), impresora: 'Otra', intervaloMs: 5000 })
    expect(leerConfig({ texto: null, env: { GC_AGENTE_SERVIDOR: SERVIDOR, GC_AGENTE_TOKEN: TOKEN, GC_AGENTE_IMPRESORA: 'X' } })).toMatchObject({ impresora: 'X' })
  })

  it('rejects a missing or malformed token without echoing it', () => {
    expect(() => leerConfig({ texto: JSON.stringify({ servidor: SERVIDOR, impresora: 'X' }), env: {} })).toThrow(/token/)
    try {
      leerConfig({ texto: JSON.stringify({ servidor: SERVIDOR, token: 'secreto-corto', impresora: 'X' }), env: {} })
      throw new Error('no lanzó')
    } catch (e) {
      expect(String(e)).toMatch(/token/)
      expect(String(e)).not.toContain('secreto-corto')
    }
    expect(() => leerConfig({ texto: JSON.stringify({ servidor: 'ftp://x', token: TOKEN, impresora: 'X' }), env: {} })).toThrow(/servidor/)
    expect(() => leerConfig({ texto: JSON.stringify({ servidor: SERVIDOR, token: TOKEN, impresora: 'X', modo: 'zpl' }), env: {} })).toThrow(/modo/)
  })
})

describe('etiquetasDePrueba', () => {
  it('has a child with allergy, a name with ñ and accents and a parent label', () => {
    const ts = etiquetasDePrueba('2026-11-08')
    expect(ts.map((t: { tipo: string }) => t.tipo)).toEqual(['nino', 'nino', 'representante'])
    expect(ts.some((t) => (t.payload as { alergias?: boolean }).alergias === true)).toBe(true)
    expect(JSON.stringify(ts)).toMatch(/ñ/)
  })

  it('shows both visit marks (S9.3)', () => {
    const visitas = etiquetasDePrueba('2026-11-08').map((t) => (t.payload as { visita?: string | null }).visita ?? null)
    expect(visitas).toEqual(['primera', 'visitante', null])
  })
})
