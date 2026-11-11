/**
 * R3d (odd/tasks/talleres-rediseno.md, S4) — pure helpers of the v2 taller page.
 */

import {
  agruparEdiciones,
  formatearFecha,
  rangoFechas,
  resumenEdiciones,
  segmentoDe,
  segmentoInicial,
} from '@/components/talleres/taller/vista-taller'
import type { CatalogoEdicion } from '@/lib/platform/talleres/catalogo'

function e(id: string, estado: CatalogoEdicion['estado'], fecha_inicio: string | null): CatalogoEdicion {
  return { id, estado, fecha_inicio, fecha_fin: null, nombre_snapshot: id, tipo: 'individual', total_inscripciones: 0, temporada_id: null }
}

describe('vista-taller', () => {
  it('puts borrador and abierto in Abiertas, en_curso in En curso, cerrado and cancelado in Cerradas', () => {
    expect(segmentoDe({ estado: 'borrador' })).toBe('abiertas')
    expect(segmentoDe({ estado: 'abierto' })).toBe('abiertas')
    expect(segmentoDe({ estado: 'en_curso' })).toBe('en_curso')
    expect(segmentoDe({ estado: 'cerrado' })).toBe('cerradas')
    expect(segmentoDe({ estado: 'cancelado' })).toBe('cerradas')
  })

  it('orders the closest first in Abiertas (no date last) and the most recent first in Cerradas', () => {
    const grupos = agruparEdiciones([
      e('b', 'abierto', '2027-02-01'),
      e('sin', 'borrador', null),
      e('a', 'abierto', '2026-11-01'),
      e('viejo', 'cerrado', '2026-01-01'),
      e('nuevo', 'cerrado', '2026-08-01'),
    ])
    expect(grupos.abiertas.map((x) => x.id)).toEqual(['a', 'b', 'sin'])
    expect(grupos.cerradas.map((x) => x.id)).toEqual(['nuevo', 'viejo'])
    expect(grupos.en_curso).toEqual([])
  })

  it('starts on the first segment with ediciones, Abiertas when all are empty', () => {
    expect(segmentoInicial({ abiertas: [], en_curso: [1], cerradas: [1] })).toBe('en_curso')
    expect(segmentoInicial({ abiertas: [], en_curso: [], cerradas: [] })).toBe('abiertas')
  })

  it('formats date-only values in UTC, never shifted by the timezone', () => {
    expect(formatearFecha('2026-09-01')).toMatch(/^1 sept?\.? 2026$/)
    expect(formatearFecha(null)).toBeNull()
    expect(rangoFechas({ fecha_inicio: null, fecha_fin: null })).toBe('Sin fechas')
    expect(rangoFechas({ fecha_inicio: '2026-09-01', fecha_fin: null })).toMatch(/2026 → —$/)
  })

  it('counts abiertas, en curso and cerradas for the summary (cancelled not counted)', () => {
    expect(
      resumenEdiciones([
        { estado: 'abierto' },
        { estado: 'borrador' },
        { estado: 'en_curso' },
        { estado: 'cerrado' },
        { estado: 'cancelado' },
      ]),
    ).toEqual({ abiertas: 1, enCurso: 1, cerradas: 1 })
  })
})
