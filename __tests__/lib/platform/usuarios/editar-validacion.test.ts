/**
 * Editar persona (S14 of odd/tasks/sistema-diseno-v2.md): the rules the form
 * and updateUser share. Decisions 3 (phone notice), 4 (cédula notice), 5
 * (optional address), 6 (no future birth date) and 12 (género "Otro" stays
 * empty and required).
 */
import {
  MENSAJE_CALLE,
  estadoDireccion,
  validarEdicion,
  type ValoresEdicion,
} from '@/lib/platform/usuarios/editar-validacion'

const HOY = '2026-10-31'

const VALIDOS: ValoresEdicion = {
  nombre: 'María Fernanda',
  apellido: 'Colmenárez',
  cedula: '18456789',
  fecha_nacimiento: '1988-04-17',
  genero: 'Femenino',
  estado_civil: 'Casado',
  ocupacion_id: '',
  profesion_id: '',
  telefono: '04145523108',
  email: 'mafe@gmail.com',
  pais_id: '',
  estado_id: '',
  municipio_id: '',
  parroquia_id: '',
  calle: '',
  barrio: '',
  codigo_postal: '',
  referencia: '',
  lat: null,
  lng: null,
}

const con = (cambios: Partial<ValoresEdicion>): ValoresEdicion => ({ ...VALIDOS, ...cambios })

describe('validarEdicion', () => {
  it('accepts a complete person with no address and gives no notices', () => {
    expect(validarEdicion(VALIDOS, HOY)).toEqual({ errores: {}, avisos: {} })
  })

  it('requires nombre and apellido with at least 2 characters', () => {
    const { errores } = validarEdicion(con({ nombre: ' A ', apellido: '' }), HOY)
    expect(errores.nombre).toBe('El nombre debe tener al menos 2 caracteres.')
    expect(errores.apellido).toBe('El apellido debe tener al menos 2 caracteres.')
  })

  it('rejects an invalid email and accepts an empty one', () => {
    expect(validarEdicion(con({ email: 'mafe@gmail' }), HOY).errores.email).toBe('Escribe un email válido, como nombre@gmail.com.')
    expect(validarEdicion(con({ email: '  ' }), HOY).errores.email).toBeUndefined()
  })

  describe('decision 6: birth date', () => {
    it('rejects a date after today', () => {
      expect(validarEdicion(con({ fecha_nacimiento: '2026-11-01' }), HOY).errores.fecha_nacimiento).toBe(
        'La fecha de nacimiento no puede ser posterior a hoy.',
      )
    })

    it('accepts today and an empty date', () => {
      expect(validarEdicion(con({ fecha_nacimiento: HOY }), HOY).errores).toEqual({})
      expect(validarEdicion(con({ fecha_nacimiento: '' }), HOY).errores).toEqual({})
    })
  })

  describe('decision 12: género', () => {
    it('is required while empty (a stored "Otro" loads empty)', () => {
      expect(validarEdicion(con({ genero: '' }), HOY).errores.genero).toBe('Elige el género.')
    })
  })

  describe('decision 5: the address is optional', () => {
    it('accepts a form with every address field empty', () => {
      expect(validarEdicion(con({ pais_id: 'p-ve' }), HOY).errores.calle).toBeUndefined()
    })

    it.each([
      ['estado_id', 'e-lara'],
      ['municipio_id', 'm-iribarren'],
      ['parroquia_id', 'pa-santa-rosa'],
      ['barrio', 'Urb. Santa Rosa'],
      ['codigo_postal', '3001'],
      ['referencia', 'Frente a la plaza'],
    ] as const)('requires calle once %s is filled', (campo, valor) => {
      expect(validarEdicion(con({ [campo]: valor }), HOY).errores.calle).toBe(MENSAJE_CALLE)
    })

    it('accepts calle alone or with the rest', () => {
      expect(validarEdicion(con({ calle: 'Calle 3' }), HOY).errores).toEqual({})
      expect(validarEdicion(con({ calle: 'Calle 3', estado_id: 'e', barrio: 'b' }), HOY).errores).toEqual({})
    })
  })

  describe('decision 4: cédula', () => {
    it('warns, without blocking, about an unrecognized cédula', () => {
      const r = validarEdicion(con({ cedula: '04245136686' }), HOY)
      expect(r.errores).toEqual({})
      expect(r.avisos.cedula).toEqual({
        texto: 'No parece una cédula venezolana (6 a 8 dígitos) ni extranjera (E y 6 a 9 dígitos). Se guardará tal cual.',
      })
    })

    it.each(['V-18.456.789', 'e 81110494', ''])('gives no notice for %j', (cedula) => {
      expect(validarEdicion(con({ cedula }), HOY).avisos.cedula).toBeUndefined()
    })
  })

  describe('decision 3: teléfono', () => {
    it('warns, without blocking, with the "Revisar teléfono" notice', () => {
      const r = validarEdicion(con({ telefono: '0414 552 310' }), HOY)
      expect(r.errores).toEqual({})
      expect(r.avisos.telefono).toEqual({
        destacado: 'Revisar teléfono',
        texto: '«0414 552 310» no parece un número venezolano, así que WhatsApp no funcionará. Si es extranjero, puedes guardarlo así.',
      })
    })

    it.each(['0414 552 3108', '+58 414-552-3108', '0251 261 4420', ''])('gives no notice for %j', (telefono) => {
      expect(validarEdicion(con({ telefono }), HOY).avisos.telefono).toBeUndefined()
    })
  })
})

describe('estadoDireccion (the server rule of decision 5)', () => {
  it('is "vacia" when nothing is filled ("none" parroquia and blanks count as empty)', () => {
    expect(estadoDireccion({ calle: ' ', parroquia_id: 'none', barrio: '' })).toBe('vacia')
    expect(estadoDireccion(undefined)).toBe('vacia')
  })

  it('is "sin-calle" when another field is filled without calle', () => {
    expect(estadoDireccion({ calle: '', referencia: 'Frente a la plaza' })).toBe('sin-calle')
    expect(estadoDireccion({ calle: '', parroquia_id: 'pa-1' })).toBe('sin-calle')
  })

  it('is "completa" with calle', () => {
    expect(estadoDireccion({ calle: 'Calle 3' })).toBe('completa')
  })
})
