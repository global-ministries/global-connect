/**
 * Editar persona (S14): loading the stored person into the form, what counts
 * as a change (decision 8), the gendered estado civil labels (decision 7), the
 * error summary (decision 8) and what goes to updateUser (decisions 5 and 13).
 */
import type { ValoresEdicion } from '@/lib/platform/usuarios/editar-validacion'
import {
  camposCambiados,
  datosParaGuardar,
  etiquetaEstadoCivil,
  geografiaDeParroquia,
  opcionesEstadoCivil,
  resumenErrores,
  valoresDesdeUsuario,
  type UsuarioEditable,
} from '@/lib/platform/usuarios/editar-vista'

const USUARIO: UsuarioEditable = {
  id: 'u-1',
  nombre: 'María Fernanda',
  apellido: 'Colmenárez',
  cedula: '18456789',
  email: 'mafe@gmail.com',
  telefono: '04145523108',
  fecha_nacimiento: '1988-04-17',
  genero: 'Femenino',
  estado_civil: 'Casado',
  ocupacion_id: 'oc-1',
  profesion_id: null,
  direccion: {
    calle: 'Calle 3',
    barrio: null,
    codigo_postal: '3001',
    referencia: null,
    latitud: 10.06,
    longitud: -69.31,
    parroquia: { id: 'pa-1', municipio: { id: 'm-1', estado: { id: 'e-1', pais: { id: 'p-1' } } } },
  },
}

describe('valoresDesdeUsuario', () => {
  it('loads every field, with the phone formatted and empty strings for nothing', () => {
    expect(valoresDesdeUsuario(USUARIO)).toEqual({
      nombre: 'María Fernanda',
      apellido: 'Colmenárez',
      cedula: '18456789',
      fecha_nacimiento: '1988-04-17',
      genero: 'Femenino',
      estado_civil: 'Casado',
      ocupacion_id: 'oc-1',
      profesion_id: '',
      telefono: '0414 552 3108',
      email: 'mafe@gmail.com',
      pais_id: 'p-1',
      estado_id: 'e-1',
      municipio_id: 'm-1',
      parroquia_id: 'pa-1',
      calle: 'Calle 3',
      barrio: '',
      codigo_postal: '3001',
      referencia: '',
      lat: 10.06,
      lng: -69.31,
    })
  })

  it('decision 12: a stored "Otro" género loads empty instead of "Masculino"', () => {
    expect(valoresDesdeUsuario({ ...USUARIO, genero: 'Otro' }).genero).toBe('')
  })

  it('loads a person without an address with every address field empty', () => {
    const v = valoresDesdeUsuario({ ...USUARIO, direccion: undefined })
    expect([v.pais_id, v.estado_id, v.municipio_id, v.parroquia_id, v.calle, v.lat, v.lng]).toEqual(['', '', '', '', '', null, null])
  })
})

describe('camposCambiados', () => {
  const base = valoresDesdeUsuario(USUARIO)

  it('is empty for the loaded values', () => {
    expect(camposCambiados(base, { ...base })).toEqual([])
  })

  it('lists each changed field once', () => {
    const v: ValoresEdicion = { ...base, nombre: 'Mafe', referencia: 'Plaza', lat: 10.07 }
    expect(camposCambiados(base, v)).toEqual(['nombre', 'referencia', 'ubicacion'])
  })

  it('does not count a phone or cédula written another way as a change', () => {
    expect(camposCambiados(base, { ...base, telefono: '+58 414 552 3108', cedula: 'V-18.456.789' })).toEqual([])
  })
})

describe('decision 7: estado civil follows the género', () => {
  it.each([
    ['Casado', 'Femenino', 'Casada'],
    ['Soltero', 'Femenino', 'Soltera'],
    ['Viudo', 'Femenino', 'Viuda'],
    ['Divorciado', 'Femenino', 'Divorciada'],
    ['No especificado', 'Femenino', 'No especificado'],
    ['Casado', 'Masculino', 'Casado'],
    ['Casado', '', 'Casado'],
  ] as const)('%s with género %j reads %j', (valor, genero, etiqueta) => {
    expect(etiquetaEstadoCivil(valor, genero)).toBe(etiqueta)
  })

  it('keeps the stored values as option values', () => {
    expect(opcionesEstadoCivil('Femenino').map((o) => o.valor)).toEqual(['Soltero', 'Casado', 'Divorciado', 'Viudo', 'No especificado'])
  })
})

describe('geografiaDeParroquia (the family address suggestion fills the cascade)', () => {
  const catalogos = {
    paises: [{ id: 'p-1', nombre: 'Venezuela' }],
    estados: [{ id: 'e-1', nombre: 'Lara', pais_id: 'p-1' }],
    municipios: [{ id: 'm-1', nombre: 'Iribarren', estado_id: 'e-1' }],
    parroquias: [{ id: 'pa-1', nombre: 'Santa Rosa', municipio_id: 'm-1' }],
  }

  it('finds the municipio, estado and país of a parroquia', () => {
    expect(geografiaDeParroquia('pa-1', catalogos)).toEqual({ pais_id: 'p-1', estado_id: 'e-1', municipio_id: 'm-1' })
  })

  it('returns nothing for an unknown parroquia', () => {
    expect(geografiaDeParroquia('pa-x', catalogos)).toEqual({})
  })
})

describe('resumenErrores', () => {
  it('links each error to its field with its label and no final period', () => {
    expect(resumenErrores({ apellido: 'El apellido debe tener al menos 2 caracteres.', calle: 'Escribe la calle para guardar la dirección.' })).toEqual([
      { campo: 'apellido', texto: 'Apellido: El apellido debe tener al menos 2 caracteres' },
      { campo: 'calle', texto: 'Calle: Escribe la calle para guardar la dirección' },
    ])
  })
})

describe('datosParaGuardar', () => {
  const base = valoresDesdeUsuario(USUARIO)

  it('sends canonical cédula and phone, null-ish ids as undefined, and no familia (decision 13)', () => {
    const datos = datosParaGuardar({ ...base, cedula: 'V-18.456.789', telefono: '0414 552 3108', ocupacion_id: '' })
    expect(datos).toEqual(
      expect.objectContaining({ cedula: '18456789', telefono: '04145523108', ocupacion_id: undefined, profesion_id: undefined, genero: 'Femenino' }),
    )
    expect(datos).not.toHaveProperty('familia')
  })

  it('sends the address with its parroquia and pin', () => {
    expect(datosParaGuardar(base).direccion).toEqual({
      calle: 'Calle 3',
      barrio: '',
      codigo_postal: '3001',
      referencia: '',
      pais_id: 'p-1',
      estado_id: 'e-1',
      municipio_id: 'm-1',
      parroquia_id: 'pa-1',
      lat: 10.06,
      lng: -69.31,
    })
  })

  it('decision 5: sends no address when every address field is empty', () => {
    const vacia: ValoresEdicion = { ...base, pais_id: 'p-1', estado_id: '', municipio_id: '', parroquia_id: '', calle: '', codigo_postal: '', lat: 10.1, lng: -69.2 }
    expect(datosParaGuardar(vacia).direccion).toBeUndefined()
  })
})
