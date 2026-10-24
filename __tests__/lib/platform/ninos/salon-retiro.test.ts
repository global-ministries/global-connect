import { alertasDeLista, edadOGrado, type FilaLista } from '@/lib/platform/ninos/salon'
import {
  agruparRetiro,
  mensajeDeErrorRetiro,
  parseOpcionesRetiro,
  textoRetirado,
  validarCodigo,
  validarRetiro,
  type FilaCodigo,
} from '@/lib/platform/ninos/retiro'

const base: FilaLista = {
  nino_id: 'n1', nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2025-04-01', grado: null, codigo: '1234',
  entrada_at: '2026-10-11T13:05:00Z', alergias: null, necesidades_especiales: null, habitos: null,
  puede_comer: null, cambio_panal: null, autoriza_imagen: null,
}

describe('edadOGrado', () => {
  it('shows the grade when the child has one', () => {
    expect(edadOGrado({ ...base, grado: 2 }, '2026-10-11')).toBe('2º grado')
  })
  it('shows months under two years', () => {
    expect(edadOGrado(base, '2026-10-11')).toBe('18 meses')
  })
  it('shows years from two years on', () => {
    expect(edadOGrado({ ...base, fecha_nacimiento: '2022-01-15' }, '2026-10-11')).toBe('4 años')
  })
  it('is empty without data', () => {
    expect(edadOGrado({ ...base, fecha_nacimiento: null }, '2026-10-11')).toBe('')
  })
})

describe('alertasDeLista', () => {
  it('puts allergies first and marks them as grave', () => {
    const a = alertasDeLista({
      ...base, alergias: 'maní', necesidades_especiales: 'TEA', cambio_panal: true, puede_comer: false, autoriza_imagen: false,
    })
    expect(a).toEqual([
      { texto: 'Alergias: maní', grave: true },
      { texto: 'Necesidades especiales: TEA', grave: false },
      { texto: 'Cambio de pañal', grave: false },
      { texto: 'No puede comer merienda', grave: false },
      { texto: 'Sin fotos', grave: false },
    ])
  })
  it('says nothing when the ficha has no alerts', () => {
    expect(alertasDeLista({ ...base, puede_comer: true, autoriza_imagen: true })).toEqual([])
  })
})

describe('validarCodigo', () => {
  it('accepts exactly four digits, trimmed', () => {
    expect(validarCodigo(' 0427 ')).toEqual({ ok: true, codigo: '0427' })
  })
  it('refuses anything else with a clear message', () => {
    expect(validarCodigo('12a4')).toEqual({ ok: false, error: 'Escribe los 4 dígitos del código.' })
    expect(validarCodigo('123')).toEqual({ ok: false, error: 'Escribe los 4 dígitos del código.' })
  })
})

const fila = (f: Partial<FilaCodigo>): FilaCodigo => ({
  checkin_id: 'c1', nino_id: 'n1', nombre: 'Luis', apellido: 'Pérez', salon_id: 's1', salon: 'Maternal',
  entrada_at: '2026-10-11T13:00:00Z', salida_at: null, retirado_por_nombre: null, autorizados: [], ...f,
})

describe('agruparRetiro', () => {
  it('splits children still inside from those already out and merges the pickup people', () => {
    const r = agruparRetiro([
      fila({ autorizados: [{ nombre: 'Abuela', telefono: '0414', relacion: 'Abuela' }] }),
      fila({ checkin_id: 'c2', nino_id: 'n2', nombre: 'Eva', autorizados: [{ nombre: 'Abuela', telefono: '0414', relacion: 'Abuela' }] }),
      fila({ checkin_id: 'c3', nino_id: 'n3', nombre: 'Teo', salida_at: '2026-10-11T14:42:00Z', retirado_por_nombre: 'Ana' }),
    ])
    expect(r.adentro.map((x) => x.nombre)).toEqual(['Luis', 'Eva'])
    expect(r.retirados.map((x) => x.nombre)).toEqual(['Teo'])
    expect(r.autorizados).toEqual([{ nombre: 'Abuela', telefono: '0414', relacion: 'Abuela' }])
  })
  it('tolerates a non-array autorizados value', () => {
    expect(agruparRetiro([fila({ autorizados: null as unknown as [] })]).autorizados).toEqual([])
  })
})

describe('textoRetirado', () => {
  it('says when and by whom, in Caracas time', () => {
    expect(textoRetirado(fila({ salida_at: '2026-10-11T14:42:00Z', retirado_por_nombre: 'Ana' }))).toBe(
      'Retirado a las 10:42 por Ana',
    )
  })
})

describe('mensajeDeErrorRetiro', () => {
  it('maps the known codes', () => {
    expect(mensajeDeErrorRetiro({ code: '42501' })).toBe('No tienes permiso para retirar niños de ese salón.')
    expect(mensajeDeErrorRetiro({ code: '22023' })).toBe('Escribe quién retira al niño.')
    expect(mensajeDeErrorRetiro(null)).toBe('No se pudo registrar el retiro. Intenta de nuevo.')
  })
  it('explains a person outside the list', () => {
    expect(mensajeDeErrorRetiro({ code: '22023', message: 'retiro_no_autorizado' })).toBe(
      'Esa persona no está autorizada para retirar a todos los niños de este código. Elige «Otra persona» y escribe el motivo.',
    )
  })
})

describe('parseOpcionesRetiro', () => {
  it('keeps well-formed rows and the representante/autorizado kind', () => {
    expect(
      parseOpcionesRetiro([
        { nombre: 'Ana Pérez', telefono: '0414', relacion: 'Representante', tipo: 'representante' },
        { nombre: 'Rosa', telefono: null, relacion: null, tipo: 'autorizado' },
        { nombre: '', tipo: 'autorizado' },
        null,
      ]),
    ).toEqual([
      { nombre: 'Ana Pérez', telefono: '0414', relacion: 'Representante', tipo: 'representante' },
      { nombre: 'Rosa', telefono: null, relacion: null, tipo: 'autorizado' },
    ])
    expect(parseOpcionesRetiro(null)).toEqual([])
  })
})

describe('validarRetiro', () => {
  it('a person from the list goes without a reason', () => {
    expect(validarRetiro({ tipo: 'lista', nombre: 'Ana Pérez' })).toEqual({ ok: true, retiradoPor: 'Ana Pérez', motivoOtra: null })
  })
  it('asks to choose someone first', () => {
    expect(validarRetiro(null)).toEqual({ ok: false, error: 'Elige quién retira al niño.' })
  })
  it('another person needs a name and a reason', () => {
    expect(validarRetiro({ tipo: 'otra', nombre: ' ', motivo: 'x' })).toEqual({ ok: false, error: 'Escribe el nombre de quien retira.' })
    expect(validarRetiro({ tipo: 'otra', nombre: 'Vecina', motivo: '  ' })).toEqual({
      ok: false, error: 'Escribe por qué retira una persona que no está en la lista.',
    })
    expect(validarRetiro({ tipo: 'otra', nombre: 'Vecina', motivo: 'x'.repeat(301) })).toEqual({
      ok: false, error: 'El motivo es muy largo (máximo 300 caracteres).',
    })
    expect(validarRetiro({ tipo: 'otra', nombre: ' Vecina ', motivo: ' La mamá avisó ' })).toEqual({
      ok: true, retiradoPor: 'Vecina', motivoOtra: 'La mamá avisó',
    })
  })
})
