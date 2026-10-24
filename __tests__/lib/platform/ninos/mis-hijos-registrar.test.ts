import { hijoVacio, type HijoForm } from '@/lib/platform/ninos/familia'
import {
  LIMITES_REGISTRO,
  mensajeDeErrorRegistro,
  mensajeRegistro,
  parseCampusMisHijos,
  parsePendientesMisHijos,
  parseResultadoRegistro,
  validarRegistroMisHijos,
} from '@/lib/platform/ninos/mis-hijos-registrar'

const HOY = '2026-10-12'

const ana: HijoForm = {
  ...hijoVacio(),
  nombre: ' Ana ',
  apellido: 'Pérez',
  fechaNacimiento: '2021-03-04',
  genero: 'Femenino',
  grado: '1',
  alergias: 'Maní',
  puedeComer: false,
  salonPreferidoId: 'salon-elegido',
}

describe('validarRegistroMisHijos', () => {
  it('builds the payload with only the keys a parent may send (never a room)', () => {
    const r = validarRegistroMisHijos({ campusId: 'c1', hijos: [ana], autorizados: [{ nombre: 'Abuela', telefono: '', relacion: 'Abuela' }] }, HOY)
    expect(r).toEqual({
      ok: true,
      payload: {
        campus_id: 'c1',
        hijos: [
          {
            nombre: 'Ana',
            apellido: 'Pérez',
            fecha_nacimiento: '2021-03-04',
            genero: 'Femenino',
            grado: 1,
            alergias: 'Maní',
            necesidades_especiales: null,
            habitos: null,
            notas: null,
            puede_comer: false,
            cambio_panal: null,
            autoriza_imagen: null,
            escolarizado: null,
          },
        ],
        autorizados: [{ nombre: 'Abuela', telefono: null, relacion: 'Abuela' }],
      },
    })
  })

  it('requires the campus and each child name, birth date and gender, numbered when there are several', () => {
    const r = validarRegistroMisHijos({ campusId: '', hijos: [ana, hijoVacio()], autorizados: [] }, HOY)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errores).toContain('Elige el campus.')
    expect(r.errores).toContain('Niño 2: El nombre es obligatorio.')
    expect(r.errores).toContain('Niño 2: El género es obligatorio.')
    expect(r.errores.some((e) => e.startsWith('Niño 1'))).toBe(false)
  })

  it('accepts a child under 13 and refuses one who is 13 or older (Caracas date)', () => {
    const doce = { ...ana, fechaNacimiento: '2013-10-13' }
    const trece = { ...ana, fechaNacimiento: '2013-10-12' }
    expect(validarRegistroMisHijos({ campusId: 'c1', hijos: [doce], autorizados: [] }, HOY).ok).toBe(true)
    const r = validarRegistroMisHijos({ campusId: 'c1', hijos: [trece], autorizados: [] }, HOY)
    expect(r).toEqual({ ok: false, errores: ['Solo se registran niños menores de 13 años.'] })
  })

  it('applies the SQL limits: children per registration, pickup people and text length', () => {
    const muchos = Array.from({ length: LIMITES_REGISTRO.hijos + 1 }, (_, i) => ({ ...ana, nombre: `Ana ${i}` }))
    const r1 = validarRegistroMisHijos({ campusId: 'c1', hijos: muchos, autorizados: [] }, HOY)
    expect(r1).toEqual({ ok: false, errores: ['Puedes registrar hasta 10 niños a la vez.'] })

    const siete = Array.from({ length: 7 }, (_, i) => ({ nombre: `P${i}`, telefono: '', relacion: '' }))
    const r2 = validarRegistroMisHijos({ campusId: 'c1', hijos: [ana], autorizados: siete }, HOY)
    expect(r2).toEqual({ ok: false, errores: ['Puedes indicar hasta 6 personas autorizadas.'] })

    const largo = { ...ana, notas: 'x'.repeat(501) }
    const r3 = validarRegistroMisHijos({ campusId: 'c1', hijos: [largo], autorizados: [] }, HOY)
    expect(r3).toEqual({ ok: false, errores: ['Cada campo admite hasta 500 caracteres.'] })
  })

  it('needs at least one child', () => {
    expect(validarRegistroMisHijos({ campusId: 'c1', hijos: [], autorizados: [] }, HOY)).toEqual({
      ok: false,
      errores: ['Agrega al menos un niño.'],
    })
  })
})

describe('parsers', () => {
  it('reads the campus list with the principal flag', () => {
    expect(parseCampusMisHijos([{ id: 'c1', nombre: 'Centro', principal: true }, { id: 'c2' }, 'x'])).toEqual([
      { id: 'c1', nombre: 'Centro', principal: true },
    ])
    expect(parseCampusMisHijos(null)).toEqual([])
  })

  it('reads the pending requests', () => {
    expect(parsePendientesMisHijos([{ nombre: 'Ana', apellido: 'Pérez', created_at: 'x' }, { apellido: 'sin nombre' }])).toEqual([
      { nombre: 'Ana', apellido: 'Pérez' },
    ])
    expect(parsePendientesMisHijos({})).toEqual([])
  })

  it('reads the registration result defensively', () => {
    expect(
      parseResultadoRegistro({ registrados: [{ id: 'h1', nombre: 'Ana', apellido: 'P' }], pendientes: [{ nombre: 'Luis', apellido: 'P' }] }),
    ).toEqual({ registrados: [{ nombre: 'Ana', apellido: 'P' }], pendientes: [{ nombre: 'Luis', apellido: 'P' }] })
    expect(parseResultadoRegistro(null)).toEqual({ registrados: [], pendientes: [] })
  })
})

describe('mensajeRegistro', () => {
  it('says who is ready and who waits for the table', () => {
    expect(mensajeRegistro({ registrados: [{ nombre: 'Ana', apellido: 'P' }, { nombre: 'Luis', apellido: 'P' }], pendientes: [] })).toEqual({
      listos: 'Registramos a Ana y Luis. Ya pueden entrar el domingo.',
      pendientes: null,
    })
    expect(mensajeRegistro({ registrados: [], pendientes: [{ nombre: 'Eva', apellido: 'P' }] })).toEqual({
      listos: null,
      pendientes:
        'Eva quedó pendiente de confirmar en la mesa: se parece a un niño ya registrado, así que un anfitrión lo revisará contigo el domingo.',
    })
  })
})

describe('mensajeDeErrorRegistro', () => {
  it('maps the RPC codes to friendly Spanish', () => {
    expect(mensajeDeErrorRegistro({ code: '23505', message: 'hijo_ya_registrado' })).toBe(
      'Uno de los niños ya está entre tus hijos o pendiente de confirmar.',
    )
    expect(mensajeDeErrorRegistro({ code: '22023', message: 'limite_diario' })).toMatch(/máximo de 10 niños por día/)
    expect(mensajeDeErrorRegistro({ code: '22023', message: 'sin_campus' })).toBe('Elige un campus con Niños.')
    expect(mensajeDeErrorRegistro({ code: '22023', message: 'edad_fuera_de_rango' })).toBe('Solo se registran niños menores de 13 años.')
    expect(mensajeDeErrorRegistro({ code: '42501', message: 'sin_autoridad' })).toBe('Tu sesión expiró. Vuelve a iniciar sesión.')
    expect(mensajeDeErrorRegistro({ code: '22023', message: 'otro' })).toBe('Revisa los datos: hay campos inválidos.')
    expect(mensajeDeErrorRegistro({ code: '500', message: 'fetch failed' })).toBe('No pudimos registrar a tus hijos. Intenta de nuevo.')
  })
})
