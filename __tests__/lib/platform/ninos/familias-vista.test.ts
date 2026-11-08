import {
  aSalonSugerible,
  hijoAForm,
  parseFamilias,
  salonParaHijo,
  type SalonFila,
} from '@/lib/platform/ninos/familias-vista'

const salones: SalonFila[] = [
  { id: 'mat', nombre: 'Maternal', area: 'waumba', edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true, orden: 10 },
  { id: 'g1', nombre: '1º grado', area: 'upstreet', edad_min_meses: null, edad_max_meses: null, grado_min: 1, grado_max: 1, es_necesidades_especiales: false, activo: true, orden: 110 },
]

const hijoBase = {
  id: 'h1',
  nombre: 'Luis',
  apellido: 'Pérez',
  fecha_nacimiento: '2025-01-01',
  genero: 'Masculino',
  grado: null,
  alergias: 'maní',
  necesidades_especiales: null,
  habitos: null,
  notas: null,
  puede_comer: true,
  cambio_panal: null,
  autoriza_imagen: false,
  escolarizado: null,
  salon_preferido_id: null,
  es_vip_desde: '2026-10-08',
  tiene_ficha: true,
  autorizados: [{ id: 'a1', nombre: 'Rosa', telefono: null, relacion: 'Abuela' }],
}

describe('parseFamilias', () => {
  it('keeps well-formed families and drops garbage', () => {
    const r = parseFamilias([{ id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '0414', cedula: null, hijos: [hijoBase] }, 3, null])
    expect(r).toHaveLength(1)
    expect(r[0].hijos[0].nombre).toBe('Luis')
    expect(parseFamilias('nope')).toEqual([])
  })
})

describe('salonParaHijo', () => {
  it('suggests the room by age', () => {
    const r = salonParaHijo({ ...hijoBase, fecha_nacimiento: '2025-06-01' }, salones, '2026-10-11')
    expect(r).toEqual({ tipo: 'sugerido', salon: expect.objectContaining({ id: 'mat' }) })
  })

  it('returns none when no rule matches (PreK) — never guesses', () => {
    const r = salonParaHijo({ ...hijoBase, fecha_nacimiento: '2021-06-01', grado: 0 }, salones, '2026-10-11')
    expect(r).toEqual({ tipo: 'ninguno' })
  })

  it('a room picked by hand wins over the rule', () => {
    const r = salonParaHijo({ ...hijoBase, salon_preferido_id: 'g1' }, salones, '2026-10-11')
    expect(r).toEqual({ tipo: 'elegido', salon: expect.objectContaining({ id: 'g1' }) })
  })

  // T2d preservation: the desk now loads the salón rules; at their defaults (open, no
  // visitor places, room left) every suggestion is the one it gave before.
  it('with the default salón rules and room left it suggests exactly as without them', () => {
    const conReglas: SalonFila[] = salones.map((s) => ({ ...s, capacidad: 20, cupo_visitantes: 0, abierto: true, corte_mes: null, corte_dia: null, promocion_mes: null, promocion_dia: null }))
    const casos = [
      { ...hijoBase, fecha_nacimiento: '2025-06-01' },
      { ...hijoBase, fecha_nacimiento: '2021-06-01', grado: 0 },
      { ...hijoBase, fecha_nacimiento: '2019-06-01', grado: 1 },
      { ...hijoBase, salon_preferido_id: 'g1' },
      { ...hijoBase, fecha_nacimiento: null },
    ]
    for (const h of casos) {
      const antes = salonParaHijo(h, salones, '2026-10-11')
      const ahora = salonParaHijo(h, conReglas, '2026-10-11', { visitante: false, ocupados: { mat: 5, g1: 19 } })
      expect(ahora.tipo).toBe(antes.tipo)
      expect(ahora.tipo === 'ninguno' ? null : ahora.salon.id).toBe(antes.tipo === 'ninguno' ? null : antes.salon.id)
    }
  })

  it('a closed salón is not suggested; a full one is skipped for the next with room', () => {
    const dos: SalonFila[] = [
      { ...salones[1], capacidad: 20, abierto: false },
      { ...salones[1], id: 'g1b', nombre: '1º grado B', orden: 120, capacidad: 20 },
      { ...salones[1], id: 'g1c', nombre: '1º grado C', orden: 130, capacidad: 20 },
    ]
    const h = { ...hijoBase, grado: 1 }
    expect(salonParaHijo(h, dos, '2026-10-11')).toEqual({ tipo: 'sugerido', salon: expect.objectContaining({ id: 'g1b' }) })
    expect(salonParaHijo(h, dos, '2026-10-11', { ocupados: { g1b: 20 } })).toEqual({ tipo: 'sugerido', salon: expect.objectContaining({ id: 'g1c' }) })
  })
})

describe('mappers', () => {
  it('maps a DB room row to the suggestion shape', () => {
    expect(aSalonSugerible(salones[1])).toMatchObject({ gradoMin: 1, gradoMax: 1, esNecesidadesEspeciales: false })
  })

  it('maps the salón rules when the row has them, and leaves them out when not', () => {
    expect(aSalonSugerible({ ...salones[1], capacidad: 18, cupo_visitantes: 2, abierto: false, corte_mes: 12, corte_dia: 1, promocion_mes: 8, promocion_dia: 1 })).toMatchObject({
      capacidad: 18, cupoVisitantes: 2, abierto: false, corteMes: 12, corteDia: 1, promocionMes: 8, promocionDia: 1,
    })
    const sin = aSalonSugerible(salones[1])
    for (const k of ['capacidad', 'cupoVisitantes', 'abierto', 'corteMes', 'corteDia', 'promocionMes', 'promocionDia']) expect(sin).not.toHaveProperty(k)
  })

  it('maps a found child back into the edit form', () => {
    const f = hijoAForm({ ...hijoBase, grado: 0 })
    expect(f).toMatchObject({ nombre: 'Luis', grado: '0', alergias: 'maní', habitos: '', puedeComer: true, autorizaImagen: false })
  })
})
