/**
 * @jest-environment node
 *
 * N8 — public pre-registration: parser, size limits, honeypot, IP hash and
 * the create flow behind POST /api/ninos/preregistro.
 */
import { LIMITES_PREREGISTRO, formDesdePreregistro, parsePreregistro } from '@/lib/platform/ninos/preregistro'
import { crearPreregistro, hashIp, ipDeSolicitud } from '@/lib/platform/ninos/preregistro-servidor'

const HOY = '2026-10-08'
const CAMPUS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function cuerpo(extra: Record<string, unknown> = {}) {
  return {
    campusId: CAMPUS,
    padre: { nombre: ' Ana ', apellido: 'Pérez', telefono: '0414-555-1234', email: ' ANA@Example.test ', cedula: '' },
    hijos: [
      {
        nombre: 'Sofía', apellido: 'Pérez', fechaNacimiento: '2021-03-04', genero: 'Femenino', grado: '',
        alergias: 'Maní', necesidadesEspeciales: '', habitos: '', puedeComer: true, cambioPanal: null,
        autorizaImagen: false, escolarizado: null,
      },
    ],
    autorizados: [{ nombre: 'Abuela Rosa', telefono: '04141112233', relacion: 'Abuela' }],
    sitioWeb: '',
    ...extra,
  }
}

describe('parsePreregistro', () => {
  it('accepts a valid family and normalizes the payload', () => {
    const r = parsePreregistro(cuerpo(), HOY)
    expect(r).toEqual({
      ok: true,
      honeypot: false,
      campusId: CAMPUS,
      payload: {
        padre: { nombre: 'Ana', apellido: 'Pérez', telefono: '0414-555-1234', email: 'ana@example.test', cedula: null, genero: null },
        hijos: [
          {
            nombre: 'Sofía', apellido: 'Pérez', fecha_nacimiento: '2021-03-04', genero: 'Femenino', grado: null,
            alergias: 'Maní', necesidades_especiales: null, habitos: null, notas: null, puede_comer: true,
            cambio_panal: null, autoriza_imagen: false, escolarizado: null, salon_preferido_id: null,
          },
        ],
        autorizados: [{ nombre: 'Abuela Rosa', telefono: '04141112233', relacion: 'Abuela' }],
      },
    })
  })

  it('requires the parent name, last name and phone; email and cédula are optional', () => {
    const r = parsePreregistro(cuerpo({ padre: { nombre: '', apellido: '', telefono: '12' } }), HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errores).toEqual(
        expect.arrayContaining([
          'Escribe tu nombre.',
          'Escribe tu apellido.',
          'Escribe un teléfono válido.',
        ]),
      )
    }
  })

  it('rejects a malformed email', () => {
    const r = parsePreregistro(cuerpo({ padre: { nombre: 'Ana', apellido: 'P', telefono: '04145551234', email: 'ana@' } }), HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores).toContain('Escribe un correo válido o déjalo vacío.')
  })

  it('validates the children with the same rules as the table', () => {
    const r = parsePreregistro(cuerpo({ hijos: [{ nombre: '', apellido: 'P', fechaNacimiento: '2099-01-01', genero: 'X', grado: '9' }] }), HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errores).toEqual(
        expect.arrayContaining(['Niño 1: el nombre es obligatorio.', 'Niño 1: la fecha de nacimiento no es válida.']),
      )
    }
  })

  it('needs a campus id and at least one child', () => {
    expect(parsePreregistro(cuerpo({ campusId: 'x' }), HOY).ok).toBe(false)
    expect(parsePreregistro(cuerpo({ hijos: [] }), HOY).ok).toBe(false)
    expect(parsePreregistro(null, HOY).ok).toBe(false)
    expect(parsePreregistro('texto', HOY).ok).toBe(false)
  })

  it('limits sizes: children, pickup people and text length', () => {
    const hijo = cuerpo().hijos[0]
    expect(parsePreregistro(cuerpo({ hijos: Array(LIMITES_PREREGISTRO.hijos + 1).fill(hijo) }), HOY).ok).toBe(false)
    const aut = { nombre: 'X', telefono: '', relacion: '' }
    expect(parsePreregistro(cuerpo({ autorizados: Array(LIMITES_PREREGISTRO.autorizados + 1).fill(aut) }), HOY).ok).toBe(false)
    const largo = 'a'.repeat(LIMITES_PREREGISTRO.texto + 1)
    expect(parsePreregistro(cuerpo({ hijos: [{ ...hijo, alergias: largo }] }), HOY).ok).toBe(false)
  })

  it('ignores unknown fields and non-boolean flags', () => {
    const hijo = { ...cuerpo().hijos[0], puedeComer: 'sí', extra: 'x' }
    const r = parsePreregistro(cuerpo({ hijos: [hijo], admin: true }), HOY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.payload.hijos[0].puede_comer).toBeNull()
      expect(JSON.stringify(r.payload)).not.toContain('extra')
    }
  })

  it('flags a filled honeypot', () => {
    const r = parsePreregistro(cuerpo({ sitioWeb: 'http://spam' }), HOY)
    expect(r.ok && r.honeypot).toBe(true)
  })
})

describe('hashIp / ipDeSolicitud', () => {
  it('hashes with the salt to 64 hex chars, never the raw IP', () => {
    const h = hashIp('1.2.3.4', 'sal')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('1.2.3.4')
    expect(hashIp('1.2.3.4', 'otra')).not.toBe(h)
  })
  it('takes the first x-forwarded-for address, then x-real-ip', () => {
    expect(ipDeSolicitud(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9')
    expect(ipDeSolicitud(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8')
    expect(ipDeSolicitud(new Headers())).toBe('desconocida')
  })
})

describe('crearPreregistro', () => {
  const ok = () => jest.fn().mockResolvedValue({ data: 'ok', error: null })

  it('stores a valid form through the service RPC with the IP hash', async () => {
    const rpc = ok()
    const r = await crearPreregistro({ rpc, sal: 's', hoy: HOY }, cuerpo(), '1.2.3.4')
    expect(r).toEqual({ status: 200, body: { ok: true } })
    expect(rpc).toHaveBeenCalledWith('ninos_preregistro_crear', {
      p_campus_id: CAMPUS,
      p_payload: expect.objectContaining({ padre: expect.objectContaining({ nombre: 'Ana' }) }),
      p_ip_hash: hashIp('1.2.3.4', 's'),
    })
  })

  it('answers ok to a bot (honeypot) without storing anything', async () => {
    const rpc = ok()
    expect(await crearPreregistro({ rpc, sal: 's', hoy: HOY }, cuerpo({ sitioWeb: 'x' }), '1.2.3.4')).toEqual({ status: 200, body: { ok: true } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('400 with the errors for an invalid form', async () => {
    const rpc = ok()
    const r = await crearPreregistro({ rpc, sal: 's', hoy: HOY }, cuerpo({ hijos: [] }), '1.2.3.4')
    expect(r.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('429 when the database rate limit answers limite', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'limite', error: null })
    expect((await crearPreregistro({ rpc, sal: 's', hoy: HOY }, cuerpo(), '1.2.3.4')).status).toBe(429)
  })

  it('500 with a generic message when the RPC fails, without personal data in the log', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom ana@example.test' } })
    const r = await crearPreregistro({ rpc, sal: 's', hoy: HOY }, cuerpo(), '1.2.3.4')
    expect(r.status).toBe(500)
    expect(JSON.stringify(log.mock.calls)).not.toContain('ana@example.test')
    log.mockRestore()
  })
})

describe('formDesdePreregistro', () => {
  it('turns a stored payload into the review form (email kept apart)', () => {
    const r = parsePreregistro(cuerpo(), HOY)
    if (!r.ok) throw new Error('fixture')
    const { form, email } = formDesdePreregistro(r.payload)
    expect(email).toBe('ana@example.test')
    expect(form.padre).toEqual({ nombre: 'Ana', apellido: 'Pérez', telefono: '0414-555-1234', cedula: '', genero: '' })
    expect(form.hijos[0]).toMatchObject({ nombre: 'Sofía', fechaNacimiento: '2021-03-04', alergias: 'Maní', puedeComer: true, grado: '' })
    expect(form.autorizados).toEqual([{ nombre: 'Abuela Rosa', telefono: '04141112233', relacion: 'Abuela' }])
  })

  it('tolerates a damaged payload', () => {
    const { form, email } = formDesdePreregistro({ padre: null, hijos: 'x' } as never)
    expect(email).toBe('')
    expect(form.hijos.length).toBe(1)
  })
})
