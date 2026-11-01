/**
 * N2a (odd/tasks/ninos-v2.md, S3–S4): the pure rules of the check-in screen
 * on design-system v2 — pre-checked children with their suggested salón, the
 * arrival queue order, the summary line and the full / almost full salones.
 */
import {
  UMBRAL_CASI_LLENO,
  edadCorta,
  estadoCupo,
  hijoMarcable,
  hijosMarcados,
  iniciales,
  nombreCampus,
  ordenarCola,
  quienesRetiran,
  resumenCheckin,
  salonDeHijo,
} from '@/lib/platform/ninos/checkin-vista'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'
import type { FamiliaLlegando, PreregistroLlegando } from '@/lib/platform/ninos/precheck'

const salones: SalonFila[] = [
  { id: 's1', nombre: 'Maternal', area: 'waumba', edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true, orden: 10 },
  { id: 's2', nombre: '1º grado', area: 'upstreet', edad_min_meses: null, edad_max_meses: null, grado_min: 1, grado_max: 1, es_necesidades_especiales: false, activo: true, orden: 20 },
]

function hijo(h: Partial<HijoEncontrado> & { id: string }): HijoEncontrado {
  return {
    nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2025-06-01', genero: 'Masculino', grado: null, alergias: null,
    necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
    autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, tiene_ficha: true, autorizados: [], ...h,
  }
}

describe('pre-checked children', () => {
  const hijos = [hijo({ id: 'h1' }), hijo({ id: 'h2', tiene_ficha: false }), hijo({ id: 'h3' }), hijo({ id: 'h4' })]

  it('marks every child with a ficha who has not come in yet', () => {
    expect(hijosMarcados(hijos, {}, new Set()).map((h) => h.id)).toEqual(['h1', 'h3', 'h4'])
  })

  it('skips the children already in and the ones the table unchecked', () => {
    expect(hijosMarcados(hijos, { h3: '1234' }, new Set(['h4'])).map((h) => h.id)).toEqual(['h1'])
  })

  it('a child without a ficha or already in cannot be marked', () => {
    expect(hijoMarcable(hijos[0], {})).toBe(true)
    expect(hijoMarcable(hijos[1], {})).toBe(false)
    expect(hijoMarcable(hijos[2], { h3: '1234' })).toBe(false)
  })
})

describe('salón of a child', () => {
  const fecha = '2026-10-11'

  it('keeps the suggested salón by age', () => {
    expect(salonDeHijo(hijo({ id: 'h1' }), salones, fecha)).toEqual({ salonId: 's1', origen: 'sugerido' })
  })

  it('the salón remembered on the ficha wins over the suggestion', () => {
    expect(salonDeHijo(hijo({ id: 'h1', salon_preferido_id: 's2' }), salones, fecha)).toEqual({ salonId: 's2', origen: 'elegido' })
  })

  it('a salón picked by hand wins, and an empty pick falls back to the suggestion', () => {
    expect(salonDeHijo(hijo({ id: 'h1' }), salones, fecha, 's2')).toEqual({ salonId: 's2', origen: 'manual' })
    expect(salonDeHijo(hijo({ id: 'h1' }), salones, fecha, '')).toEqual({ salonId: 's1', origen: 'sugerido' })
  })

  it('without a rule that fits there is no salón', () => {
    expect(salonDeHijo(hijo({ id: 'h2', fecha_nacimiento: '2015-01-01' }), salones, fecha)).toEqual({ salonId: null, origen: 'ninguno' })
  })
})

describe('full and almost full salones', () => {
  it('is full from the capacity up (warns, never blocks)', () => {
    expect(estadoCupo(12, 12)).toBe('lleno')
    expect(estadoCupo(13, 12)).toBe('lleno')
  })

  it(`is almost full from ${UMBRAL_CASI_LLENO * 100}% of the capacity`, () => {
    expect(UMBRAL_CASI_LLENO).toBe(0.8)
    expect(estadoCupo(16, 20)).toBe('casi')
    expect(estadoCupo(16, 18)).toBe('casi')
    expect(estadoCupo(11, 12)).toBe('casi')
  })

  it('is free below that', () => {
    expect(estadoCupo(15, 20)).toBe('libre')
    expect(estadoCupo(6, 8)).toBe('libre')
    expect(estadoCupo(0, 20)).toBe('libre')
  })
})

describe('summary line', () => {
  const ocupacion = [
    { salon_id: 's1', nombre: 'Cunas', presentes: 6, capacidad: 8 },
    { salon_id: 's2', nombre: 'Caminantes', presentes: 12, capacidad: 12 },
    { salon_id: 's3', nombre: 'Preescolar', presentes: 16, capacidad: 18 },
    { salon_id: 's4', nombre: '1.º a 3.º', presentes: 14, capacidad: 13 },
  ]

  it('counts the children inside, the full salones and the families on their way', () => {
    expect(resumenCheckin(ocupacion, 3)).toEqual({ adentro: 48, llenos: 2, enCamino: 3 })
  })

  it('starts at zero before the occupancy loads', () => {
    expect(resumenCheckin(null, 0)).toEqual({ adentro: 0, llenos: 0, enCamino: 0 })
  })

  it('names the campus of the salones once', () => {
    expect(nombreCampus(['Barquisimeto', 'Barquisimeto'])).toBe('Barquisimeto')
    expect(nombreCampus(['Barquisimeto', 'Cabudare'])).toBe('Barquisimeto, Cabudare')
    expect(nombreCampus([])).toBeNull()
  })
})

describe('arrival queue', () => {
  const familia = (id: string, avisadoAt: string): FamiliaLlegando => ({
    padre: { id, nombre: id, apellido: 'X' },
    avisadoAt,
    hijos: [hijo({ id: `${id}-h` })],
  })
  const pre = (id: string, avisadoAt: string): PreregistroLlegando => ({
    preregistroId: id,
    padre: { nombre: id, apellido: 'Qr' },
    avisadoAt,
    hijos: [],
  })

  it('puts whoever told the table first on top, families and QR pre-registrations together', () => {
    const cola = ordenarCola(
      [familia('p2', '2026-11-01T14:55:00Z'), familia('p1', '2026-11-01T14:52:00Z')],
      [pre('pr1', '2026-11-01T14:58:00Z'), pre('pr0', '2026-11-01T14:53:00Z')],
    )
    expect(cola.map((i) => i.clave)).toEqual(['p1', 'pr0', 'p2', 'pr1'])
    expect(cola.map((i) => i.tipo)).toEqual(['familia', 'preregistro', 'familia', 'preregistro'])
  })

  it('leaves an entry without a time at the end, in the order it came', () => {
    const cola = ordenarCola([familia('p1', ''), familia('p2', '2026-11-01T14:52:00Z'), familia('p3', '')], [])
    expect(cola.map((i) => i.clave)).toEqual(['p2', 'p1', 'p3'])
  })
})

describe('small labels', () => {
  it('initials of the avatar', () => {
    expect(iniciales('María Gabriela', 'Rodríguez')).toBe('MR')
    expect(iniciales('ana', '')).toBe('A')
  })

  it('age of a child on the service date', () => {
    expect(edadCorta('2021-03-04', '2026-11-01')).toBe('5 años')
    expect(edadCorta('2025-06-01', '2026-11-01')).toBe('1 año')
    expect(edadCorta('2026-03-01', '2026-11-01')).toBe('8 meses')
    expect(edadCorta('2026-10-01', '2026-11-01')).toBe('1 mes')
    expect(edadCorta(null, '2026-11-01')).toBeNull()
  })
})

describe('who may pick up', () => {
  it('lists the parents first, then each authorised person once', () => {
    const rosa = { id: 'a1', nombre: 'Rosa Pérez', telefono: null, relacion: 'Abuela' }
    const hijos = [hijo({ id: 'h1', autorizados: [rosa] }), hijo({ id: 'h2', autorizados: [rosa, { id: 'a2', nombre: 'Ana Pérez', telefono: null, relacion: 'Mamá' }] })]
    const padres = [{ id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: null }]
    expect(quienesRetiran(padres, hijos)).toEqual([
      { nombre: 'Ana Pérez', relacion: 'representante' },
      { nombre: 'Rosa Pérez', relacion: 'Abuela' },
    ])
  })

  it('an authorised person without a relation shows the name only', () => {
    expect(quienesRetiran([], [hijo({ id: 'h1', autorizados: [{ id: 'a1', nombre: 'Carla', telefono: null, relacion: null }] })])).toEqual([
      { nombre: 'Carla', relacion: null },
    ])
  })
})
