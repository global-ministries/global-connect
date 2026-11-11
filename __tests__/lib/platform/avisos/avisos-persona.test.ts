/**
 * @jest-environment node
 *
 * T7 (odd/tasks/talleres-reserva-publica.md, S6 S11 S14) — the generic
 * in-app notices (mis_avisos / aviso_marcar_leido) and the manual WhatsApp
 * link.
 */
import {
  cargarMisAvisos,
  contarNoLeidos,
  cuandoAviso,
  marcarAvisoLeido,
  parseAvisos,
  type ClienteAvisos,
} from '@/lib/platform/avisos/avisos-persona'
import { enlaceWhatsappConTexto } from '@/lib/platform/avisos/whatsapp'

const FILA = {
  id: 'a1',
  persona_id: 'p1',
  tipo: 'inscripcion_aprobada',
  titulo: 'Aprobamos tu inscripción',
  cuerpo: 'Tienes tu lugar en Mujer de Hoy.',
  url: '/talleres/mi-recorrido',
  datos: { taller: 'Mujer de Hoy', taller_id: 't1' },
  leido_at: null,
  expira_at: null,
  created_at: '2026-11-10T13:12:00Z',
  clave: 'inscripcion_aprobada:i1:p1',
}

describe('parseAvisos', () => {
  it('maps mis_avisos rows, with the taller as the tag', () => {
    expect(parseAvisos([FILA])).toEqual([
      {
        id: 'a1',
        tipo: 'inscripcion_aprobada',
        titulo: 'Aprobamos tu inscripción',
        cuerpo: 'Tienes tu lugar en Mujer de Hoy.',
        url: '/talleres/mi-recorrido',
        etiqueta: 'Mujer de Hoy',
        leido: false,
        creadoEn: '2026-11-10T13:12:00Z',
      },
    ])
  })

  it('never links outside the app and drops malformed rows', () => {
    const avisos = parseAvisos([
      { ...FILA, id: 'x', url: 'https://evil.example' },
      { ...FILA, id: 'y', url: '//evil.example' },
      { ...FILA, id: null },
      'basura',
    ])
    expect(avisos.map((a) => [a.id, a.url])).toEqual([
      ['x', null],
      ['y', null],
    ])
  })

  it('counts the unread ones', () => {
    const avisos = parseAvisos([FILA, { ...FILA, id: 'a2', leido_at: '2026-11-10T14:00:00Z' }])
    expect(contarNoLeidos(avisos)).toBe(1)
  })
})

describe('RPC calls', () => {
  it('reads mis_avisos and marks one read with aviso_marcar_leido', async () => {
    const rpc = jest.fn((nombre: string) =>
      Promise.resolve(nombre === 'mis_avisos' ? { data: [FILA], error: null } : { data: true, error: null }),
    )
    const client = { rpc } as unknown as ClienteAvisos

    await expect(cargarMisAvisos(client)).resolves.toHaveLength(1)
    await expect(marcarAvisoLeido(client, 'a1')).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('mis_avisos')
    expect(rpc).toHaveBeenCalledWith('aviso_marcar_leido', { p_aviso_id: 'a1' })
  })

  it('a failed read throws; a failed mark is false', async () => {
    const client = { rpc: () => Promise.resolve({ data: null, error: { message: 'jwt expired' } }) } as unknown as ClienteAvisos
    await expect(cargarMisAvisos(client)).rejects.toThrow('jwt expired')
    await expect(marcarAvisoLeido(client, 'a1')).resolves.toBe(false)
  })
})

describe('cuandoAviso', () => {
  it('says Hoy with the Caracas time, Ayer, or the day', () => {
    const ahora = new Date('2026-11-10T20:00:00Z')
    expect(cuandoAviso('2026-11-10T13:12:00Z', ahora)).toMatch(/^Hoy 9:12/)
    expect(cuandoAviso('2026-11-09T15:00:00Z', ahora)).toBe('Ayer')
    expect(cuandoAviso('2026-11-02T15:00:00Z', ahora)).toMatch(/^2 nov/)
    expect(cuandoAviso('no-es-fecha', ahora)).toBe('')
  })
})

describe('enlaceWhatsappConTexto (manual WhatsApp only)', () => {
  it('opens wa.me for a Venezuelan mobile with the text ready', () => {
    expect(enlaceWhatsappConTexto('0414-555-0147', 'Hola Ana, mañana es tu clase.')).toBe(
      'https://wa.me/584145550147?text=Hola%20Ana%2C%20ma%C3%B1ana%20es%20tu%20clase.',
    )
  })

  it('no text, no query; no valid mobile, no link', () => {
    expect(enlaceWhatsappConTexto('04145550147', '  ')).toBe('https://wa.me/584145550147')
    expect(enlaceWhatsappConTexto('02512345678', 'Hola')).toBeNull()
    expect(enlaceWhatsappConTexto(null, 'Hola')).toBeNull()
  })
})
