import { mapOpcionesRegistro, mapRpcError, parseAltaPersona, puedeRegistrarEnAlgunEquipo, TIPO_REPRESENTANTE_LABELS } from '@/lib/platform/dream-team/alta-persona'

const EQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const base = { equipoId: EQ, rolId: ROL, nombre: 'Ana', apellido: 'Pérez', genero: 'Femenino', estadoCivil: 'Soltero' }

describe('parseAltaPersona', () => {
  it('requires equipo and rol as uuids', () => {
    expect(parseAltaPersona({ ...base, equipoId: 'x', cedula: '1234567' })).toEqual({ error: 'Equipo y rol son requeridos' })
  })
  it('requires nombre and apellido', () => {
    expect(parseAltaPersona({ ...base, apellido: '  ', cedula: '1234567' })).toEqual({ error: 'Nombre y apellido son requeridos' })
  })
  it('rejects an unknown genero or estado civil', () => {
    expect(parseAltaPersona({ ...base, genero: 'X', cedula: '1234567' })).toEqual({ error: 'Género inválido' })
    expect(parseAltaPersona({ ...base, estadoCivil: 'X', cedula: '1234567' })).toEqual({ error: 'Estado civil inválido' })
  })
  it('accepts No especificado as estado civil', () => {
    const r = parseAltaPersona({ ...base, estadoCivil: 'No especificado', cedula: '1234567' })
    expect(r).not.toHaveProperty('error')
  })
  it('requires a birth date when there is no cedula', () => {
    expect(parseAltaPersona({ ...base })).toEqual({ error: 'Sin cédula, la fecha de nacimiento es requerida' })
  })
  it('rejects an impossible date', () => {
    expect(parseAltaPersona({ ...base, fechaNacimiento: '2017-02-30' })).toEqual({ error: 'Fecha de nacimiento inválida' })
  })
  it('normalizes the cedula like the database and trims the optional texts', () => {
    const r = parseAltaPersona({ ...base, cedula: ' v-12.345.678 ', telefono: '  ', tallaFranela: ' m ' })
    expect(r).toMatchObject({ cedula: '12345678', telefono: null, tallaFranela: 'm', representanteId: null })
  })
  it('accepts the representative kinships and refuses the others', () => {
    for (const tipo of ['padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar']) {
      expect(parseAltaPersona({ ...base, cedula: '1234567', representanteTipo: tipo })).toMatchObject({ representanteTipo: tipo })
    }
    expect(parseAltaPersona({ ...base, cedula: '1234567', representanteTipo: 'conyuge' })).toEqual({ error: 'Tipo de representante inválido' })
    expect(parseAltaPersona({ ...base, cedula: '1234567', representanteTipo: 'hijo' })).toEqual({ error: 'Tipo de representante inválido' })
    expect(parseAltaPersona({ ...base, cedula: '1234567', representanteId: 'nope' })).toEqual({ error: 'Representante inválido' })
  })
})

describe('mapRpcError', () => {
  it('maps 42501 to 403, 22023 to 422 with the message, the rest to 500', () => {
    expect(mapRpcError({ code: '42501' })).toEqual({ status: 403, error: 'Permiso denegado' })
    expect(mapRpcError({ code: '22023', message: 'rol_invalido' }).status).toBe(422)
    expect(mapRpcError({ code: '22023', message: 'otro' })).toEqual({ status: 422, error: 'Datos inválidos' })
    expect(mapRpcError({ code: 'XX000', message: 'x' })).toEqual({ status: 500, error: 'Error interno' })
  })
})

describe('TIPO_REPRESENTANTE_LABELS', () => {
  it('labels the new kinships gender-neutrally', () => {
    expect(TIPO_REPRESENTANTE_LABELS.abuelo).toBe('Abuelo/a')
    expect(TIPO_REPRESENTANTE_LABELS.tio).toBe('Tío/a')
  })
})

describe('mapOpcionesRegistro', () => {
  it('maps the equipos with their roles and drops malformed entries', () => {
    expect(mapOpcionesRegistro([
      { id: 'e1', etiqueta: 'Waumba Land › Bebés', roles: [{ id: 'r1', label: 'voluntario' }, { id: 1 }] },
      { id: 2, etiqueta: 'x' },
      null,
    ])).toEqual([{ id: 'e1', etiqueta: 'Waumba Land › Bebés', roles: [{ id: 'r1', label: 'voluntario' }] }])
    expect(mapOpcionesRegistro(null)).toEqual([])
  })
})

describe('puedeRegistrarEnAlgunEquipo', () => {
  const cliente = (rpc: jest.Mock) => ({ rpc }) as never
  it('is true when the function lists some equipo', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ equipo_id: 'e1' }], error: null })
    await expect(puedeRegistrarEnAlgunEquipo(cliente(rpc))).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('dream_team_equipos_registrables')
  })
  it('fails closed on an empty list, an error or a throw', async () => {
    await expect(puedeRegistrarEnAlgunEquipo(cliente(jest.fn().mockResolvedValue({ data: [], error: null })))).resolves.toBe(false)
    await expect(puedeRegistrarEnAlgunEquipo(cliente(jest.fn().mockResolvedValue({ data: null, error: { code: 'x' } })))).resolves.toBe(false)
    await expect(puedeRegistrarEnAlgunEquipo(cliente(jest.fn().mockRejectedValue(new Error('down'))))).resolves.toBe(false)
    await expect(puedeRegistrarEnAlgunEquipo({} as never)).resolves.toBe(false)
  })
})
