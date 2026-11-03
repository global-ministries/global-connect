import {
  cambiosDeFicha,
  fetchEquiposRegistrables,
  fetchFichasEditables,
  puedeRegistrarParaNavegacion,
  puedeRegistrarPersonaNueva,
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

describe('puedeRegistrarParaNavegacion (the sidebar flag, computed in the (auth) layout)', () => {
  const rpcCon = (data: unknown) => ({ rpc: jest.fn().mockResolvedValue({ data, error: null }) })
  it('is true when the registrables lookup answers some equipo', async () => {
    expect(await puedeRegistrarParaNavegacion(rpcCon([{ equipo_id: 'e1' }]), true)).toBe(true)
  })
  it('is false for none, without a client, or with Dream Team off (no lookup then)', async () => {
    expect(await puedeRegistrarParaNavegacion(rpcCon([]), true)).toBe(false)
    expect(await puedeRegistrarParaNavegacion(null, true)).toBe(false)
    const cliente = rpcCon([{ equipo_id: 'e1' }])
    expect(await puedeRegistrarParaNavegacion(cliente, false)).toBe(false)
    expect(cliente.rpc).not.toHaveBeenCalled()
  })
})


describe('fetchFichasEditables (S5 of dream-team-directores-fichas)', () => {
  it('returns the ids the database lets the caller edit, asking once per batch of 2000 distinct ids', async () => {
    const ids = Array.from({ length: 2001 }, (_, i) => `p${i}`)
    const rpc = jest.fn(async (_nombre: string, args: Record<string, unknown>) => {
      const lote = args.p_ids as string[]
      return { data: lote.filter((id) => id === 'p1' || id === 'p2000'), error: null }
    })
    expect(await fetchFichasEditables(rpc, [...ids, 'p1'])).toEqual(new Set(['p1', 'p2000']))
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls.map(([nombre, args]) => [nombre, (args.p_ids as string[]).length])).toEqual([
      ['dream_team_fichas_editables', 2000],
      ['dream_team_fichas_editables', 1],
    ])
  })
  it('asks nothing for no ids', async () => {
    const rpc = jest.fn()
    expect(await fetchFichasEditables(rpc, [])).toEqual(new Set())
    expect(rpc).not.toHaveBeenCalled()
  })
  it('fails closed: an error, a throw or a missing rpc is the empty set', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await fetchFichasEditables(jest.fn().mockResolvedValue({ data: null, error: { code: '22023' } }), ['p1'])).toEqual(new Set())
    expect(await fetchFichasEditables(jest.fn().mockRejectedValue(new Error('down')), ['p1'])).toEqual(new Set())
    expect(error).toHaveBeenCalledWith('[dream-team] fichas editables lookup failed', '22023')
    error.mockRestore()
  })
})

describe('puedeRegistrarPersonaNueva (registering entry: registrables or area director)', () => {
  const respuesta = (data: unknown, error: unknown = null) => jest.fn().mockResolvedValue({ data, error })
  it('is true by the registrables without asking the database again (the coordinator)', async () => {
    const rpc = respuesta(false)
    expect(await puedeRegistrarPersonaNueva(rpc, new Set(['e1']))).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('is true for an area director when dream_team_puede_registrar_persona(NULL) says so', async () => {
    const rpc = respuesta(true)
    expect(await puedeRegistrarPersonaNueva(rpc, new Set())).toBe(true)
    expect(rpc).toHaveBeenCalledWith('dream_team_puede_registrar_persona', { p_equipo_id: null })
  })
  it('fails closed: false, an error, a non-boolean or a throw is false', async () => {
    expect(await puedeRegistrarPersonaNueva(respuesta(false), new Set())).toBe(false)
    expect(await puedeRegistrarPersonaNueva(respuesta(null, { code: 'XX000' }), new Set())).toBe(false)
    expect(await puedeRegistrarPersonaNueva(respuesta([{ equipo_id: 'e1' }]), new Set())).toBe(false)
    expect(await puedeRegistrarPersonaNueva(jest.fn().mockRejectedValue(new Error('down')), new Set())).toBe(false)
  })
})

describe('puedeRegistrarParaNavegacion — the area director (S5)', () => {
  const cliente = (puede: unknown, error: unknown = null) => ({
    rpc: jest.fn(async (nombre: string) =>
      nombre === 'dream_team_puede_registrar_persona' ? { data: puede, error } : { data: [], error: null },
    ),
  })
  it('is true without registrables when the boolean RPC is true', async () => {
    expect(await puedeRegistrarParaNavegacion(cliente(true), true)).toBe(true)
  })
  it('is false when the boolean RPC fails', async () => {
    expect(await puedeRegistrarParaNavegacion(cliente(null, { code: 'XX000' }), true)).toBe(false)
  })
})
