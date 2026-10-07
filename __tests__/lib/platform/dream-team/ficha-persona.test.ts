import {
  cambiosDeFicha,
  fetchEquiposRegistrables,
  formularioDesdeFicha,
  mapFicha,
  mapFichaError,
  parseEditarFicha,
  type FichaPersona,
} from '@/lib/platform/dream-team/ficha-persona'

const HOY = new Date('2026-10-07T12:00:00Z')

describe('parseEditarFicha', () => {
  it('keeps only the keys present, in the RPC names', () => {
    expect(parseEditarFicha({ fechaNacimiento: '1990-05-17', estadoCivil: 'Casado' }, HOY)).toEqual({
      datos: { fecha_nacimiento: '1990-05-17', estado_civil: 'Casado' },
    })
  })
  it('normalizes the cedula and turns blanks into null (clears the field)', () => {
    expect(parseEditarFicha({ cedula: 'V-20.111.222', telefono: '  ', redesSociales: '' }, HOY)).toEqual({
      datos: { cedula: '20111222', telefono: null, redes_sociales: null },
    })
  })
  it('accepts null to clear the birth date', () => {
    expect(parseEditarFicha({ fechaNacimiento: null }, HOY)).toEqual({ datos: { fecha_nacimiento: null } })
  })
  it.each([
    [{}, 'No hay cambios para guardar'],
    [null, 'Body inválido'],
    [{ email: 'x@example.test' }, 'Campo no editable: email'],
    [{ fechaNacimiento: '2026-10-08' }, 'La fecha de nacimiento no puede ser futura'],
    [{ fechaNacimiento: '1899-12-31' }, 'Fecha de nacimiento inválida'],
    [{ fechaNacimiento: '2001-02-30' }, 'Fecha de nacimiento inválida'],
    [{ genero: 'X' }, 'Género inválido'],
    [{ genero: null }, 'Género inválido'],
    [{ estadoCivil: 'Otro' }, 'Estado civil inválido'],
    [{ redesSociales: 'a'.repeat(301) }, 'Redes sociales: máximo 300 caracteres'],
    [{ telefono: 5 }, 'Teléfono inválido'],
  ])('refuses %j', (body, error) => {
    expect(parseEditarFicha(body, HOY)).toEqual({ error })
  })
  it('accepts today as a birth date and No especificado as estado civil', () => {
    expect(parseEditarFicha({ fechaNacimiento: '2026-10-07', estadoCivil: 'No especificado' }, HOY)).toEqual({
      datos: { fecha_nacimiento: '2026-10-07', estado_civil: 'No especificado' },
    })
  })
})

const FICHA: FichaPersona = {
  id: 'p-1',
  nombre: 'Ana',
  apellido: 'Pérez',
  fechaNacimiento: null,
  cedula: null,
  genero: 'Femenino',
  estadoCivil: 'No especificado',
  telefono: '04141234567',
  redesSociales: null,
}

describe('mapFicha', () => {
  it('maps the RPC jsonb', () => {
    expect(
      mapFicha({
        id: 'p-1', nombre: 'Ana', apellido: 'Pérez', fecha_nacimiento: null, cedula: null,
        genero: 'Femenino', estado_civil: 'No especificado', telefono: '04141234567', redes_sociales: null,
      }),
    ).toEqual(FICHA)
  })
  it('throws on an empty answer', () => {
    expect(() => mapFicha(null)).toThrow()
  })
})

describe('mapFichaError', () => {
  it.each([
    [{ code: '42501', message: 'sin_autoridad' }, 403, 'Permiso denegado'],
    [{ code: '23505', message: 'cedula_duplicada' }, 409, 'Esa cédula ya pertenece a otra persona'],
    [{ code: '22023', message: 'fecha_nacimiento_invalida' }, 422, 'Fecha de nacimiento inválida'],
    [{ code: '22023', message: 'algo' }, 422, 'Datos inválidos'],
    [{ code: 'XX000', message: 'boom' }, 500, 'Error interno'],
  ])('%j -> %i', (error, status, mensaje) => {
    expect(mapFichaError(error)).toEqual({ status, error: mensaje })
  })
})

describe('formularioDesdeFicha / cambiosDeFicha', () => {
  it('prefills with empty strings for the gaps', () => {
    expect(formularioDesdeFicha(FICHA)).toEqual({
      fechaNacimiento: '', cedula: '', genero: 'Femenino', estadoCivil: 'No especificado',
      telefono: '04141234567', redesSociales: '',
    })
  })
  it('sends only what changed', () => {
    const form = { ...formularioDesdeFicha(FICHA), fechaNacimiento: '1990-05-17', telefono: '04141234567 ' }
    expect(cambiosDeFicha(FICHA, form)).toEqual({ fechaNacimiento: '1990-05-17' })
  })
  it('sends a cleared field as an empty string', () => {
    expect(cambiosDeFicha(FICHA, { ...formularioDesdeFicha(FICHA), telefono: '' })).toEqual({ telefono: '' })
  })
})

describe('fetchEquiposRegistrables', () => {
  it('returns the equipo ids', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ equipo_id: 'e1' }, { equipo_id: 'e2' }], error: null })
    expect(await fetchEquiposRegistrables({ rpc })).toEqual(new Set(['e1', 'e2']))
    expect(rpc).toHaveBeenCalledWith('dream_team_equipos_registrables')
  })
  it('fails closed', async () => {
    expect(await fetchEquiposRegistrables({ rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'x' } }) })).toEqual(new Set())
    expect(await fetchEquiposRegistrables({ rpc: jest.fn().mockRejectedValue(new Error('x')) })).toEqual(new Set())
  })
})
