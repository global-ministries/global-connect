/**
 * Mi equipo keeps its state in the URL (S11): dirección, nivel, the filters,
 * the view and the tab. Defaults are left out, invalid values are dropped and
 * the legacy `?direccion=` link keeps working.
 */
import {
  FILTROS_MI_EQUIPO,
  escribirFiltrosMiEquipo,
  leerFiltrosMiEquipo,
  type FiltrosMiEquipo,
} from '@/lib/platform/dream-team/mi-equipo-filtros'
import { SIN_TURNO } from '@/lib/platform/dream-team/turnos'

describe('Mi equipo URL codec', () => {
  it('writes nothing for the defaults and reads an empty query as the defaults', () => {
    expect(escribirFiltrosMiEquipo(FILTROS_MI_EQUIPO)).toBe('')
    expect(leerFiltrosMiEquipo(new URLSearchParams(''))).toEqual(FILTROS_MI_EQUIPO)
  })

  it('round-trips every field', () => {
    const filtros: FiltrosMiEquipo = {
      direccion: 'dir-conexion',
      nivel: 'eq-dhah',
      etapa: 'en_orientacion',
      edad: '18_25',
      turno: SIN_TURNO,
      sinCuenta: true,
      sinTurno: true,
      porActivar: true,
      q: '0414 507',
      vista: 'servicio',
      tab: 'calendario',
    }
    const query = escribirFiltrosMiEquipo(filtros)
    expect(query).toBe(
      'direccion=dir-conexion&nivel=eq-dhah&etapa=en_orientacion&edad=18_25&turno=sin_turno&sin_cuenta=1&sin_turno=1&por_activar=1&q=0414+507&vista=servicio&tab=calendario',
    )
    expect(leerFiltrosMiEquipo(new URLSearchParams(query))).toEqual(filtros)
  })

  it('keeps the legacy ?direccion= link working', () => {
    expect(leerFiltrosMiEquipo(new URLSearchParams('direccion=dir-ninos'))).toEqual({ ...FILTROS_MI_EQUIPO, direccion: 'dir-ninos' })
    expect(escribirFiltrosMiEquipo({ ...FILTROS_MI_EQUIPO, direccion: 'dir-ninos' })).toBe('direccion=dir-ninos')
  })

  it('reads the plain record a page receives, taking the first of repeated values', () => {
    expect(leerFiltrosMiEquipo({ direccion: ['a', 'b'], nivel: 'x', sin_cuenta: 'true' })).toEqual({
      ...FILTROS_MI_EQUIPO,
      direccion: 'a',
      nivel: 'x',
      sinCuenta: true,
    })
  })

  it('drops invalid values', () => {
    expect(
      leerFiltrosMiEquipo(new URLSearchParams('etapa=nope&edad=99&vista=equipo&tab=otra&sin_cuenta=0&direccion=%20&q=%20%20')),
    ).toEqual(FILTROS_MI_EQUIPO)
  })
})
