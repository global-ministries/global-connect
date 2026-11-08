/**
 * Niños › Salón, Esperados / Aquí / Retirados (odd/tasks/ninos-checkin-pco.md,
 * T2b, S6, S9.4): reading ninos_salon_estado, the tabs, the texts of the
 * rows and the two writes (move to another salón, «Llegó» from the salón).
 * T2f (S9.5): the destinations of each child, only the salones that
 * correspond to their age or grade.
 */
import {
  cargarEstadoSalon,
  destinosDelNino,
  leerEstadoSalon,
  mensajeErrorEstado,
  moverDeSalon,
  opcionesPestanas,
  registrarLlegada,
  textoDestino,
  textoEsperado,
  textoMovimiento,
  textoRetiradoSalon,
} from '@/lib/platform/ninos/salon-estados'

const crudo = {
  salon_id: 's1',
  puede_operar: true,
  puede_llegar: true,
  esperados: [
    {
      nino_id: 'n21', nombre: 'Paula', apellido: 'Ríos', fecha_nacimiento: '2023-05-01', grado: null,
      avisado_at: '2026-11-08T13:04:00Z', avisado_por: { nombre: 'Carolina', apellido: 'Ríos' },
      alergias: 'maní', necesidades_especiales: null, habitos: null, puede_comer: null, cambio_panal: true, autoriza_imagen: false,
    },
    { nino_id: 7, nombre: 'Malo' },
  ],
  retirados: [
    {
      checkin_id: 'c30', nino_id: 'n30', nombre: 'Elena', apellido: 'Ramírez', fecha_nacimiento: '2023-01-01', grado: null,
      codigo: '2222', entrada_at: '2026-11-08T12:40:00Z', salida_at: '2026-11-08T13:08:00Z', retirado_por_nombre: 'Ana Ramírez',
    },
  ],
  movimientos: [
    { nino_id: 'n31', nombre: 'Luis', apellido: 'Pérez', desde_id: 's1', desde: 'Sala A', hacia_id: 's2', hacia: 'Sala B', movido_at: '2026-11-08T13:10:00Z', motivo: null },
  ],
  destinos: [
    { id: 's2', nombre: 'Sala B', capacidad: 18, ocupados: 12, abierto: true, edad_min_meses: 36, edad_max_meses: 59, grado_min: null, grado_max: null },
    { id: 's3', nombre: 'Sala C', capacidad: 10, ocupados: 10, abierto: false, edad_min_meses: null, edad_max_meses: null, grado_min: 1, grado_max: 2 },
  ],
  destinos_por_nino: { n31: ['s3', 's2'], n27: [], n40: 'malo', n41: ['s2', 7, 's9'] },
}

describe('leerEstadoSalon', () => {
  it('reads the permissions, the lists and drops rows without an id', () => {
    const e = leerEstadoSalon(crudo)
    expect(e).not.toBeNull()
    expect(e?.salonId).toBe('s1')
    expect(e?.puedeOperar).toBe(true)
    expect(e?.puedeLlegar).toBe(true)
    expect(e?.esperados).toHaveLength(1)
    expect(e?.esperados[0]).toMatchObject({
      nino_id: 'n21', nombre: 'Paula', apellido: 'Ríos', alergias: 'maní', cambio_panal: true, autoriza_imagen: false,
      avisadoAt: '2026-11-08T13:04:00Z', avisadoPor: 'Carolina Ríos',
    })
    expect(e?.retirados[0]).toMatchObject({ checkinId: 'c30', nino_id: 'n30', codigo: '2222', retiradoPor: 'Ana Ramírez' })
    expect(e?.movimientos[0]).toMatchObject({ ninoId: 'n31', desdeId: 's1', desde: 'Sala A', hacia: 'Sala B' })
    expect(e?.destinos.map((d) => [d.id, d.ocupados, d.capacidad, d.abierto])).toEqual([
      ['s2', 12, 18, true],
      ['s3', 10, 10, false],
    ])
    expect(e?.destinosPorNino).toEqual({ n31: ['s3', 's2'], n27: [], n40: [], n41: ['s2', 's9'] })
  })

  it('is null for anything that is not the object', () => {
    expect(leerEstadoSalon(null)).toBeNull()
    expect(leerEstadoSalon([])).toBeNull()
    expect(leerEstadoSalon({ esperados: [] })).toBeNull()
  })

  it('missing lists read as empty and missing permissions as false', () => {
    expect(leerEstadoSalon({ salon_id: 's1' })).toEqual({
      salonId: 's1', puedeOperar: false, puedeLlegar: false, esperados: [], retirados: [], movimientos: [], destinos: [],
      destinosPorNino: null,
    })
  })
})

describe('destinosDelNino (T2f, S9.5)', () => {
  const e = leerEstadoSalon(crudo)!

  it('only the destinos that correspond to the child, in the order of destinos', () => {
    expect(destinosDelNino(e, 'n31').map((d) => d.id)).toEqual(['s2', 's3'])
    expect(destinosDelNino(e, 'n41').map((d) => d.id)).toEqual(['s2'])
  })

  it('none when no destino corresponds or the child is not in the list', () => {
    expect(destinosDelNino(e, 'n27')).toEqual([])
    expect(destinosDelNino(e, 'n99')).toEqual([])
  })

  it('without destinos_por_nino (an older answer) every destino; the server still refuses one that does not correspond', () => {
    const viejo = leerEstadoSalon({ ...crudo, destinos_por_nino: undefined })!
    expect(destinosDelNino(viejo, 'n31').map((d) => d.id)).toEqual(['s2', 's3'])
  })
})

describe('textos', () => {
  const e = leerEstadoSalon(crudo)!

  it('the tabs carry their counts, Aquí from the live list', () => {
    expect(opcionesPestanas(e, 14)).toEqual([
      { valor: 'esperados', etiqueta: 'Esperados 1' },
      { valor: 'aqui', etiqueta: 'Aquí 14' },
      { valor: 'retirados', etiqueta: 'Retirados 1' },
    ])
  })

  it('an esperado says when and who sent the notice', () => {
    expect(textoEsperado(e.esperados[0])).toBe('Avisó 09:04 · Carolina Ríos')
    expect(textoEsperado({ ...e.esperados[0], avisadoPor: null })).toBe('Avisó 09:04')
  })

  it('a retirado says the hour and who picked them up', () => {
    expect(textoRetiradoSalon(e.retirados[0])).toBe('Salió 09:08 con Ana Ramírez')
    expect(textoRetiradoSalon({ ...e.retirados[0], retiradoPor: null })).toBe('Salió 09:08')
  })

  it('a move says where from or where to, from this salón', () => {
    expect(textoMovimiento(e.movimientos[0], 's2')).toBe('Viene de Sala A · 09:10')
    expect(textoMovimiento(e.movimientos[0], 's1')).toBe('Pasó a Sala B · 09:10')
  })

  it('a destination says its children and capacity, full and closed', () => {
    expect(textoDestino(e.destinos[0])).toBe('12/18 niños')
    expect(textoDestino(e.destinos[1])).toBe('10/10 niños · lleno · cerrado')
  })
})

describe('RPCs', () => {
  it('cargarEstadoSalon calls ninos_salon_estado and reads it; null on error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: crudo, error: null })
    expect((await cargarEstadoSalon({ rpc } as never, 's1', 't9', '2026-11-08'))?.salonId).toBe('s1')
    expect(rpc).toHaveBeenCalledWith('ninos_salon_estado', { p_salon_id: 's1', p_turno_id: 't9', p_fecha: '2026-11-08' })
    rpc.mockResolvedValue({ data: null, error: { message: 'sin_autoridad' } })
    expect(await cargarEstadoSalon({ rpc } as never, 's1', 't9', '2026-11-08')).toBeNull()
  })

  it('moverDeSalon sends the child, service, destination and motivo; answers the destination', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { checkin_id: 'c31', codigo: '4321', salon_destino_id: 's2', salon_destino: 'Sala B', ocupacion: 13, capacidad: 18 },
      error: null,
    })
    const r = await moverDeSalon({ rpc } as never, { ninoId: 'n31', turnoId: 't9', fecha: '2026-11-08', salonDestinoId: 's2' })
    expect(rpc).toHaveBeenCalledWith('ninos_mover_salon', {
      p_nino_id: 'n31', p_turno_id: 't9', p_fecha: '2026-11-08', p_salon_destino_id: 's2', p_motivo: null,
    })
    expect(r).toEqual({ ok: true, codigo: '4321', salonDestino: 'Sala B', ocupacion: 13, capacidad: 18 })
  })

  it('moverDeSalon shows the HINT on a refusal', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'sin_autoridad', hint: 'No tienes permiso para pasar niños a ese salón.' } })
    expect(await moverDeSalon({ rpc } as never, { ninoId: 'n31', turnoId: 't9', fecha: '2026-11-08', salonDestinoId: 's3', motivo: 'Llora' })).toEqual({
      ok: false, message: 'No tienes permiso para pasar niños a ese salón.',
    })
    expect(rpc).toHaveBeenCalledWith('ninos_mover_salon', expect.objectContaining({ p_motivo: 'Llora' }))
  })

  it('registrarLlegada calls ninos_checkin_desde_salon and answers the code', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { checkin_id: 'c1', codigo: '3381', salon_id: 's1' }, error: null })
    const r = await registrarLlegada({ rpc } as never, { ninoId: 'n21', salonId: 's1', turnoId: 't9', fecha: '2026-11-08' })
    expect(rpc).toHaveBeenCalledWith('ninos_checkin_desde_salon', { p_nino_id: 'n21', p_salon_id: 's1', p_turno_id: 't9', p_fecha: '2026-11-08' })
    expect(r).toEqual({ ok: true, codigo: '3381' })
  })

  it('registrarLlegada shows the HINT, or a plain sentence without one', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'otro_salon', hint: 'Este niño está esperado en otro salón.' } })
    expect(await registrarLlegada({ rpc } as never, { ninoId: 'n22', salonId: 's1', turnoId: 't9', fecha: '2026-11-08' })).toEqual({
      ok: false, message: 'Este niño está esperado en otro salón.',
    })
    expect(mensajeErrorEstado({ message: 'x' }, 'No se pudo registrar la llegada. Inténtalo de nuevo.')).toBe(
      'No se pudo registrar la llegada. Inténtalo de nuevo.',
    )
  })
})
