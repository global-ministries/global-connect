import { hijoVacio, validarFamilia, fichaPayload } from '@/lib/platform/ninos/familia'
import { hijoAForm, salonParaHijo } from '@/lib/platform/ninos/familias-vista'
import { aplicarNivel, gruposNivel, nivelSugerido, valorNivel, type SalonNivel } from '@/lib/platform/ninos/nivel'
import { formDesdePreregistro, parsePreregistro } from '@/lib/platform/ninos/preregistro'

const salon = (s: Partial<SalonNivel> & Pick<SalonNivel, 'id' | 'nombre'>): SalonNivel => ({
  area: 'waumba',
  edadMinMeses: null,
  edadMaxMeses: null,
  gradoMin: null,
  gradoMax: null,
  esNecesidadesEspeciales: false,
  activo: true,
  orden: 0,
  ...s,
})

const SALONES: SalonNivel[] = [
  salon({ id: 'pre1', nombre: 'Preescolar I', edadMinMeses: 24, edadMaxMeses: 35, orden: 20 }),
  salon({ id: 'mat', nombre: 'Maternal', edadMinMeses: 0, edadMaxMeses: 23, orden: 10 }),
  salon({ id: 'plus', nombre: 'Waumba Land Plus', esNecesidadesEspeciales: true, orden: 50 }),
  salon({ id: 'viejo', nombre: 'Cerrado', edadMinMeses: 0, edadMaxMeses: 59, activo: false, orden: 5 }),
  salon({ id: 'g1', nombre: '1º grado', area: 'upstreet', gradoMin: 1, gradoMax: 1, orden: 110 }),
]

const HOY = '2026-10-08'

describe('gruposNivel', () => {
  it('groups the active Waumba rooms in order and the UpStreet grades', () => {
    expect(gruposNivel(SALONES)).toEqual([
      {
        grupo: 'Waumba Land',
        opciones: [
          { valor: 'salon:mat', etiqueta: 'Maternal' },
          { valor: 'salon:pre1', etiqueta: 'Preescolar I' },
          { valor: 'salon:plus', etiqueta: 'Waumba Land Plus' },
        ],
      },
      {
        grupo: 'UpStreet',
        opciones: [
          { valor: 'grado:0', etiqueta: 'PreK' },
          { valor: 'grado:1', etiqueta: '1º grado' },
          { valor: 'grado:2', etiqueta: '2º grado' },
          { valor: 'grado:3', etiqueta: '3º grado' },
          { valor: 'grado:4', etiqueta: '4º grado' },
          { valor: 'grado:5', etiqueta: '5º grado' },
          { valor: 'grado:6', etiqueta: '6º grado' },
        ],
      },
    ])
  })

  it('keeps one room per name when several campuses share it', () => {
    const dos = [...SALONES, salon({ id: 'mat2', nombre: 'Maternal', edadMinMeses: 0, edadMaxMeses: 23, orden: 10 })]
    expect(gruposNivel(dos)[0].opciones.filter((o) => o.etiqueta === 'Maternal')).toHaveLength(1)
  })
})

describe('valorNivel / aplicarNivel', () => {
  it('reads a Waumba preferred room before the grade', () => {
    expect(valorNivel({ grado: '', salonPreferidoId: 'pre1' }, SALONES)).toBe('salon:pre1')
  })

  it('reads the grade when the preferred room is not a Waumba option', () => {
    expect(valorNivel({ grado: '3', salonPreferidoId: 'g1' }, SALONES)).toBe('grado:3')
    expect(valorNivel({ grado: '', salonPreferidoId: '' }, SALONES)).toBe('')
  })

  it('a Waumba option stores the room and clears the grade', () => {
    expect(aplicarNivel({ ...hijoVacio(), grado: '2' }, 'salon:mat')).toMatchObject({ grado: '', salonPreferidoId: 'mat' })
  })

  it('an UpStreet option stores the grade and clears the room', () => {
    expect(aplicarNivel({ ...hijoVacio(), salonPreferidoId: 'mat' }, 'grado:0')).toMatchObject({ grado: '0', salonPreferidoId: '' })
  })

  it('"Sin indicar" clears both', () => {
    expect(aplicarNivel({ ...hijoVacio(), grado: '2', salonPreferidoId: 'x' }, '')).toMatchObject({ grado: '', salonPreferidoId: '' })
  })
})

describe('nivelSugerido', () => {
  it('suggests the Waumba room for the age', () => {
    expect(nivelSugerido({ ...hijoVacio(), fechaNacimiento: '2025-10-01' }, SALONES, HOY)).toBe('salon:mat')
    expect(nivelSugerido({ ...hijoVacio(), fechaNacimiento: '2024-01-15' }, SALONES, HOY)).toBe('salon:pre1')
  })

  it('suggests Waumba Land Plus for special needs in a Waumba age', () => {
    expect(nivelSugerido({ ...hijoVacio(), fechaNacimiento: '2025-10-01', necesidadesEspeciales: 'Autismo' }, SALONES, HOY)).toBe(
      'salon:plus',
    )
  })

  it('suggests nothing when no room fits (D4) or the date is missing', () => {
    expect(nivelSugerido({ ...hijoVacio(), fechaNacimiento: '2018-01-01' }, SALONES, HOY)).toBe('')
    expect(nivelSugerido(hijoVacio(), SALONES, HOY)).toBe('')
  })
})

describe('the level in payloads and forms', () => {
  it('fichaPayload sends the preferred room (null when none)', () => {
    expect(fichaPayload({ ...hijoVacio(), salonPreferidoId: 'mat' }).salon_preferido_id).toBe('mat')
    expect(fichaPayload(hijoVacio()).salon_preferido_id).toBeNull()
  })

  it('validarFamilia refuses a malformed room id', () => {
    const r = validarFamilia(
      {
        padre: { id: 'p1', nombre: '', apellido: '', telefono: '', cedula: '', genero: '' },
        hijos: [{ ...hijoVacio(), nombre: 'A', apellido: 'B', fechaNacimiento: '2024-01-01', genero: 'Otro', salonPreferidoId: 'no-es-uuid' }],
        autorizados: [],
      },
      HOY,
    )
    expect(r).toEqual({ ok: false, errores: ['Niño 1: el nivel no es válido.'] })
  })

  it('the edit form reads the stored preferred room back', () => {
    const f = hijoAForm({
      id: 'n', nombre: 'L', apellido: 'P', fecha_nacimiento: '2025-01-01', genero: 'Otro', grado: null, alergias: null,
      necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null, autoriza_imagen: null,
      escolarizado: null, salon_preferido_id: 'mat', es_vip_desde: null, tiene_ficha: true, autorizados: [],
    })
    expect(f.salonPreferidoId).toBe('mat')
  })

  it('the public form carries the level to the stored payload and back to the review form', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const r = parsePreregistro(
      {
        campusId: '22222222-2222-4222-8222-222222222222',
        padre: { nombre: 'Ana', apellido: 'P', telefono: '04121234567' },
        hijos: [{ nombre: 'Sofía', apellido: 'P', fechaNacimiento: '2025-01-01', genero: 'Femenino', salonPreferidoId: id }],
      },
      HOY,
    )
    if (!r.ok) throw new Error(r.errores.join())
    expect(r.payload.hijos[0].salon_preferido_id).toBe(id)
    expect(formDesdePreregistro(r.payload).form.hijos[0].salonPreferidoId).toBe(id)
  })
})

describe('the check-in honors the preferred room before age', () => {
  it('a Waumba level chosen by hand wins over the age suggestion', () => {
    const fila = {
      id: 'pre1', nombre: 'Preescolar I', area: 'waumba' as const, edad_min_meses: 24, edad_max_meses: 35, grado_min: null,
      grado_max: null, es_necesidades_especiales: false, activo: true, orden: 20,
    }
    const mat = { ...fila, id: 'mat', nombre: 'Maternal', edad_min_meses: 0, edad_max_meses: 23, orden: 10 }
    const hijo = {
      id: 'n', nombre: 'L', apellido: 'P', fecha_nacimiento: '2025-10-01', genero: 'Otro', grado: null, alergias: null,
      necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null, autoriza_imagen: null,
      escolarizado: null, salon_preferido_id: 'pre1', es_vip_desde: null, tiene_ficha: true, autorizados: [],
    }
    expect(salonParaHijo(hijo, [mat, fila], HOY)).toMatchObject({ tipo: 'elegido', salon: { id: 'pre1' } })
    expect(salonParaHijo({ ...hijo, salon_preferido_id: null }, [mat, fila], HOY)).toMatchObject({ tipo: 'sugerido', salon: { id: 'mat' } })
  })
})
