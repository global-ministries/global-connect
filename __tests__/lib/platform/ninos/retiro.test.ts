/**
 * T2a (odd/tasks/ninos-checkin-pco.md, S6 "pickup per child"): the door marks
 * which children of a code leave.
 */
import {
  listaNatural,
  marcadosIniciales,
  mensajeDeErrorRetiro,
  ninoIdsParaRetiro,
  parseRetirosRecientes,
  resumenRetiro,
  textoBotonRetiro,
  textoQuedan,
  textoSalida,
  validarMarcados,
  type FilaCodigo,
} from '@/lib/platform/ninos/retiro'

const N1 = '11111111-1111-4111-8111-111111111111'
const N2 = '22222222-2222-4222-8222-222222222222'

const fila = (over: Partial<FilaCodigo>): FilaCodigo => ({
  checkin_id: 'c1', nino_id: N1, nombre: 'Sofía', apellido: 'Rodríguez', salon_id: 's1', salon: 'Preescolar II',
  entrada_at: '2026-11-08T12:58:00Z', salida_at: null, retirado_por_nombre: null, autorizados: [], ...over,
})
const sofia = fila({})
const mateo = fila({ checkin_id: 'c2', nino_id: N2, nombre: 'Mateo', salon_id: 's2', salon: 'UpStreet 3º' })

describe('listaNatural', () => {
  it('joins with commas and «y»', () => {
    expect(listaNatural([])).toBe('')
    expect(listaNatural(['Sofía'])).toBe('Sofía')
    expect(listaNatural(['Sofía', 'Mateo'])).toBe('Sofía y Mateo')
    expect(listaNatural(['Sofía', 'Mateo', 'Eva'])).toBe('Sofía, Mateo y Eva')
  })
})

describe('marcadosIniciales', () => {
  it('marks the only child inside, and nobody when there are more', () => {
    expect(marcadosIniciales([sofia])).toEqual([N1])
    expect(marcadosIniciales([sofia, mateo])).toEqual([])
    expect(marcadosIniciales([])).toEqual([])
  })
})

describe('ninoIdsParaRetiro', () => {
  it('is null (the whole code, as before) when every child inside is marked', () => {
    expect(ninoIdsParaRetiro([N2, N1], [sofia, mateo])).toBeNull()
    expect(ninoIdsParaRetiro([N1], [sofia])).toBeNull()
  })
  it('lists only the marked children inside, in the list order', () => {
    expect(ninoIdsParaRetiro([N2], [sofia, mateo])).toEqual([N2])
    expect(ninoIdsParaRetiro([N2, 'gone'], [sofia, mateo])).toEqual([N2])
  })
  it('is an empty list when nothing inside is marked', () => {
    expect(ninoIdsParaRetiro([], [sofia, mateo])).toEqual([])
  })
})

describe('validarMarcados', () => {
  it('needs at least one child', () => {
    expect(validarMarcados([])).toEqual({ ok: false, error: 'Marca al menos un niño.' })
    expect(validarMarcados([N1])).toEqual({ ok: true })
  })
})

describe('textoQuedan', () => {
  it('says who stays and where', () => {
    expect(textoQuedan([sofia, mateo], [N1])).toBe('Mateo sigue en UpStreet 3º')
    expect(textoQuedan([sofia, mateo, fila({ nino_id: 'n3', nombre: 'Eva', salon: 'Preescolar II' })], [N2])).toBe(
      'Sofía y Eva siguen en Preescolar II',
    )
    expect(textoQuedan([sofia, mateo], [])).toBe('Sofía y Mateo siguen en Preescolar II y UpStreet 3º')
  })
  it('says when everyone leaves', () => {
    expect(textoQuedan([sofia, mateo], [N1, N2])).toBe('Salen todos los niños de este código')
  })
})

describe('textoBotonRetiro', () => {
  it('names the marked children and who picks up by first name', () => {
    expect(textoBotonRetiro([sofia], 'María Rodríguez')).toBe('Retirar a Sofía · con María')
    expect(textoBotonRetiro([sofia, mateo], 'Carmen Escalona')).toBe('Retirar a Sofía y Mateo · con Carmen')
  })
  it('is plain «Retirar» until both are chosen', () => {
    expect(textoBotonRetiro([], 'María')).toBe('Retirar')
    expect(textoBotonRetiro([sofia], null)).toBe('Retirar')
  })
})

describe('textoSalida', () => {
  it('reads «Salió hh:mm con X» in Caracas time', () => {
    expect(textoSalida({ salida_at: '2026-11-08T14:52:00Z', retirado_por_nombre: 'María Rodríguez' })).toBe(
      'Salió 10:52 con María Rodríguez',
    )
  })
})

describe('resumenRetiro', () => {
  it('names who picked up, when, and each child with their room', () => {
    expect(
      resumenRetiro([{ nino_id: N1, salon_id: 's1', salida_at: '2026-11-08T14:52:00Z' }], [sofia, mateo], 'María Rodríguez'),
    ).toEqual({ titulo: 'Retirado por María Rodríguez · 10:52', detalle: 'Sofía salió de Preescolar II.' })
    expect(
      resumenRetiro(
        [
          { nino_id: N1, salon_id: 's1', salida_at: '2026-11-08T14:52:00Z' },
          { nino_id: N2, salon_id: 's2', salida_at: '2026-11-08T14:52:00Z' },
        ],
        [sofia, mateo],
        'Ana',
      ).detalle,
    ).toBe('Sofía salió de Preescolar II y Mateo salió de UpStreet 3º.')
  })
})

describe('parseRetirosRecientes', () => {
  it('reads the counts and the pickups', () => {
    expect(
      parseRetirosRecientes({
        adentro: 98, salieron: 31,
        retiros: [
          { nino_id: N1, nombre: 'Isabella', apellido: 'Mendoza', salon: 'UpStreet 1º', salida_at: '2026-11-08T14:49:00Z',
            retirado_por_nombre: 'Carlos Mendoza', otra_persona: false },
          { nino_id: 5, nombre: 'Roto' },
        ],
      }),
    ).toEqual({
      adentro: 98, salieron: 31,
      retiros: [{ ninoId: N1, nombre: 'Isabella Mendoza', salon: 'UpStreet 1º', salidaAt: '2026-11-08T14:49:00Z',
        retiradoPor: 'Carlos Mendoza', otraPersona: false }],
    })
  })
  it('is null for anything else', () => {
    expect(parseRetirosRecientes(null)).toBeNull()
    expect(parseRetirosRecientes([])).toBeNull()
    expect(parseRetirosRecientes({ adentro: 'x' })).toBeNull()
  })
})

describe('mensajeDeErrorRetiro (per child)', () => {
  it('explains a child who already left or the empty list', () => {
    expect(mensajeDeErrorRetiro({ code: '22023', message: 'nino_no_esta_adentro' })).toBe(
      'Uno de los niños marcados ya salió o no tiene este código. Revisa la lista.',
    )
    expect(mensajeDeErrorRetiro({ code: '22023', message: 'sin_ninos' })).toBe('Marca al menos un niño.')
  })

  it('shows the custody refusal HINT as is (T2e, S9.2)', () => {
    const hint = 'Esta persona tiene una restricción de custodia: no puede retirar a este niño. Llama a coordinación.'
    expect(mensajeDeErrorRetiro({ code: '42501', message: 'custodia_restringida', hint })).toBe(hint)
    expect(mensajeDeErrorRetiro({ code: '42501', message: 'custodia_restringida' })).toBe(hint)
  })

  it('keeps the room message for any other 42501', () => {
    expect(mensajeDeErrorRetiro({ code: '42501', message: 'not allowed' })).toBe('No tienes permiso para retirar niños de ese salón.')
  })
})
