/**
 * Desk rules (odd/tasks/ninos-checkin-pco.md, T2d, S9.1, S9.3, S5): visitor
 * badge, salón rules in the suggestion, «Salón lleno» with «Usar {otro}» and
 * the forced list, and the horario window.
 */
import type { OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'
import {
  estadoHijo,
  estadoVentana,
  forzadosDe,
  horaCorta,
  parseHorarios,
  parseVisitas,
  salonDeHijoConReglas,
  textoVentana,
  ventanaDelHorario,
  visitaDe,
} from '@/lib/platform/ninos/mesa-reglas'

const base = { area: 'upstreet' as const, edad_min_meses: null, edad_max_meses: null, es_necesidades_especiales: false, activo: true }
const salones: SalonFila[] = [
  { ...base, id: 'u2', nombre: 'UpStreet 2º', grado_min: 2, grado_max: 2, orden: 20, capacidad: 20, cupo_visitantes: 2 },
  { ...base, id: 'u23', nombre: 'UpStreet 2º y 3º', grado_min: 2, grado_max: 3, orden: 30, capacidad: 20, cupo_visitantes: 0 },
  { ...base, id: 'u4', nombre: 'UpStreet 4º', grado_min: 4, grado_max: 4, orden: 40, capacidad: 20, abierto: false },
]

function hijo(h: Partial<HijoEncontrado> = {}): HijoEncontrado {
  return {
    id: 'h1', nombre: 'Mateo', apellido: 'Rodríguez', fecha_nacimiento: '2019-03-01', genero: 'Masculino', grado: 2,
    alergias: null, necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
    autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, tiene_ficha: true, autorizados: [], ...h,
  }
}

const ocupacion = (filas: Record<string, number>): Map<string, OcupacionSalon> =>
  new Map(Object.entries(filas).map(([id, presentes]) => [id, { salon_id: id, nombre: id, presentes, capacidad: 20 }]))

describe('visitaDe / parseVisitas (S9.3: visitante = primeras 3 visitas)', () => {
  it('1st visit is «Primera vez», 2nd and 3rd «Visitante», then regular; unknown says nothing', () => {
    expect(visitaDe(0)).toBe('primera')
    expect(visitaDe(1)).toBe('visitante')
    expect(visitaDe(2)).toBe('visitante')
    expect(visitaDe(3)).toBe('regular')
    expect(visitaDe(undefined)).toBeNull()
  })

  it('reads ninos_es_visitante_lote rows and drops garbage', () => {
    expect(parseVisitas([{ nino_id: 'h1', visitas_previas: 0, visitante: true }, { nino_id: 'h2', visitas_previas: 5 }, { x: 1 }, null])).toEqual({ h1: 0, h2: 5 })
    expect(parseVisitas(null)).toEqual({})
  })
})

describe('salonDeHijoConReglas (rules into the suggestion)', () => {
  it('a full regular room is skipped for a regular child: the next one with room', () => {
    const r = salonDeHijoConReglas(hijo(), salones, '2026-11-08', undefined, { visitas: { h1: 7 }, ocupacion: ocupacion({ u2: 20 }) })
    expect(r).toEqual({ salonId: 'u23', origen: 'sugerido' })
  })

  it('a visitor may use the visitor places on top of the quota', () => {
    const r = salonDeHijoConReglas(hijo(), salones, '2026-11-08', undefined, { visitas: { h1: 1 }, ocupacion: ocupacion({ u2: 21 }) })
    expect(r).toEqual({ salonId: 'u2', origen: 'sugerido' })
  })

  it('a closed room is never suggested, nor kept as the remembered one', () => {
    expect(salonDeHijoConReglas(hijo({ grado: 4 }), salones, '2026-11-08', undefined, {})).toEqual({ salonId: null, origen: 'ninguno' })
    expect(salonDeHijoConReglas(hijo({ grado: 2, salon_preferido_id: 'u4' }), salones, '2026-11-08', undefined, {})).toEqual({
      salonId: 'u2',
      origen: 'sugerido',
    })
  })

  it('when every room that fits is full it still proposes the first open one (the desk warns)', () => {
    const r = salonDeHijoConReglas(hijo(), salones, '2026-11-08', undefined, { visitas: { h1: 9 }, ocupacion: ocupacion({ u2: 20, u23: 20 }) })
    expect(r).toEqual({ salonId: 'u2', origen: 'sugerido' })
  })

  // S9.5 preservation: a remembered room that corresponds, with the default rules, is used exactly as before.
  it('a remembered room that corresponds to the child is kept, as before', () => {
    expect(salonDeHijoConReglas(hijo({ salon_preferido_id: 'u23' }), salones, '2026-11-08', undefined, {})).toEqual({ salonId: 'u23', origen: 'elegido' })
    expect(salonDeHijoConReglas(hijo({ salon_preferido_id: 'u23' }), salones, '2026-11-08', undefined, { visitas: { h1: 5 }, ocupacion: ocupacion({ u2: 3, u23: 4 }) })).toEqual({
      salonId: 'u23',
      origen: 'elegido',
    })
  })

  it('a remembered room of another grade is ignored: the rules decide (S9.5)', () => {
    expect(salonDeHijoConReglas(hijo({ grado: 3, salon_preferido_id: 'u2' }), salones, '2026-11-08', undefined, {})).toEqual({ salonId: 'u23', origen: 'sugerido' })
  })

  it('a hand-picked room wins, as before', () => {
    expect(salonDeHijoConReglas(hijo(), salones, '2026-11-08', 'u23', {})).toEqual({ salonId: 'u23', origen: 'manual' })
  })
})

describe('estadoHijo («Salón lleno» and «Usar {otro}», S9.1)', () => {
  it('full for a regular, with the next room that fits and has room', () => {
    const e = estadoHijo(hijo({ salon_preferido_id: 'u2' }), 'u2', salones, '2026-11-08', { visitas: { h1: 4 }, ocupacion: ocupacion({ u2: 20, u23: 12 }) })
    expect(e).toEqual({ visita: 'regular', lleno: true, otro: expect.objectContaining({ id: 'u23' }) })
  })

  it('not full for a visitor while the visitor places last', () => {
    const e = estadoHijo(hijo({ salon_preferido_id: 'u2' }), 'u2', salones, '2026-11-08', { visitas: { h1: 0 }, ocupacion: ocupacion({ u2: 21 }) })
    expect(e).toEqual({ visita: 'primera', lleno: false, otro: null })
  })

  it('full with no other room: no «Usar», the desk may still force it', () => {
    const e = estadoHijo(hijo(), 'u2', salones, '2026-11-08', { visitas: { h1: 4 }, ocupacion: ocupacion({ u2: 20, u23: 20 }) })
    expect(e).toEqual({ visita: 'regular', lleno: true, otro: null })
  })

  // S9.5: «Usar {otro}» only offers a room that corresponds to the child, never one of another grade.
  it('«Usar» never offers a room that does not correspond, even when it has room', () => {
    const conOtroGrado: SalonFila[] = [...salones, { ...base, id: 'u5', nombre: 'UpStreet 5º', grado_min: 5, grado_max: 5, orden: 15, capacidad: 20 }]
    const e = estadoHijo(hijo(), 'u2', conOtroGrado, '2026-11-08', { visitas: { h1: 4 }, ocupacion: ocupacion({ u2: 20, u23: 20, u5: 0 }) })
    expect(e).toEqual({ visita: 'regular', lleno: true, otro: null })
    const conLugar = estadoHijo(hijo(), 'u2', conOtroGrado, '2026-11-08', { visitas: { h1: 4 }, ocupacion: ocupacion({ u2: 20, u23: 3, u5: 0 }) })
    expect(conLugar.otro?.id).toBe('u23')
  })

  it('without occupancy nothing is full', () => {
    expect(estadoHijo(hijo(), 'u2', salones, '2026-11-08', {})).toEqual({ visita: null, lleno: false, otro: null })
  })
})

describe('forzadosDe', () => {
  it('lists the children that go in over their room quota', () => {
    const hijos = [hijo(), hijo({ id: 'h2', nombre: 'Sofía' })]
    const r = forzadosDe(
      [{ ninoId: 'h1', salonId: 'u2' }, { ninoId: 'h2', salonId: 'u23' }],
      hijos,
      salones,
      { visitas: { h1: 4, h2: 4 }, ocupacion: ocupacion({ u2: 20, u23: 3 }) },
    )
    expect(r).toEqual(['h1'])
  })

  it('is empty when nothing is full (the API then sends no list)', () => {
    expect(forzadosDe([{ ninoId: 'h1', salonId: 'u2' }], [hijo()], salones, {})).toEqual([])
  })
})

describe('horario window («Abierto · cierra en N min» / «Cerrado»)', () => {
  // 9:00 Caracas = 13:00 UTC; 120 before, 45 after → 7:00 to 9:45.
  const v = ventanaDelHorario('2026-11-08', '09:00:00', 120, 45)

  it('is computed in Caracas time around the turno hour', () => {
    expect(new Date(v.abre).toISOString()).toBe('2026-11-08T11:00:00.000Z')
    expect(new Date(v.cierra).toISOString()).toBe('2026-11-08T13:45:00.000Z')
  })

  it('before, open and after', () => {
    expect(estadoVentana(v, Date.parse('2026-11-08T10:30:00Z'))).toEqual({ estado: 'antes', minutos: 30 })
    expect(estadoVentana(v, Date.parse('2026-11-08T12:58:00Z'))).toEqual({ estado: 'abierto', minutos: 47 })
    expect(estadoVentana(v, Date.parse('2026-11-08T13:45:00Z'))).toEqual({ estado: 'despues', minutos: 0 })
  })

  it('texts', () => {
    expect(textoVentana(v, { estado: 'abierto', minutos: 47 })).toEqual({ titulo: 'Abierto', detalle: 'cierra en 47 min' })
    expect(textoVentana(v, { estado: 'abierto', minutos: 135 })).toEqual({ titulo: 'Abierto', detalle: 'cierra en 2 h 15 min' })
    expect(textoVentana(v, { estado: 'antes', minutos: 30 })).toEqual({ titulo: 'Cerrado', detalle: 'abre a las 7:00' })
    expect(textoVentana(v, { estado: 'despues', minutos: 0 })).toEqual({ titulo: 'Cerrado', detalle: null })
  })

  it('horaCorta', () => {
    expect(horaCorta('09:00:00')).toBe('9:00')
    expect(horaCorta('18:30')).toBe('18:30')
    expect(horaCorta('x')).toBe('x')
  })

  it('parseHorarios reads the event and the window of each turno, dropping garbage', () => {
    expect(
      parseHorarios([
        { turno_id: 't9', abre_min_antes: 90, cierra_min_despues: 30, evento: { nombre: 'Domingo semanal' } },
        { turno_id: 't11', abre_min_antes: 'x', evento: null },
        { nada: 1 },
      ]),
    ).toEqual({
      t9: { evento: 'Domingo semanal', abreMinAntes: 90, cierraMinDespues: 30 },
      t11: { evento: null, abreMinAntes: 120, cierraMinDespues: 120 },
    })
  })
})
