/**
 * `servidores-vista` — the age filter (D10 of odd/tasks/ninos-voluntarios-waumba.md):
 * count pills per age range that follow every other filter (so they are the
 * metrics of the selected sub-area) and filter the list.
 */
import {
  FILTROS_INICIALES,
  calcularVistaServidores,
  escribirFiltrosEnUrl,
  leerFiltrosDeUrl,
  type FilaServidor,
  type FiltrosServidores,
} from '@/lib/platform/dream-team/servidores-vista'
import { HOY, ID_CORO, ID_DHAH, arbolServidores, fila } from '../../../../tests/helpers/servidores-conexion'

const filas: FilaServidor[] = [
  fila('a', 'Ana', ID_DHAH, 'Voluntario', { rangoEdad: '12_17' }),
  fila('a2', 'Ana', ID_CORO, 'Voluntario', { rangoEdad: '12_17' }),
  fila('b', 'Beto', ID_DHAH, 'Coordinador', { rangoEdad: '26_mas' }),
  fila('c', 'Carla', ID_CORO, 'Voluntario', { rangoEdad: 'sin_fecha', estado: 'postulado' }),
  fila('d', 'Dani', ID_CORO, 'Voluntario', { rangoEdad: 'menor_12' }),
  fila('e', 'Eli', ID_CORO, 'Líder'),
]

function vista(filtros: Partial<FiltrosServidores> = {}, lista: readonly FilaServidor[] = filas) {
  return calcularVistaServidores({ filas: lista, arbol: arbolServidores, filtros: { ...FILTROS_INICIALES, ...filtros }, hoy: HOY })
}

const nombres = (v: ReturnType<typeof vista>) => v.visibles.map((f) => f.nombre)

describe('age filter', () => {
  it('starts without an age filter and counts each person once per range', () => {
    expect(FILTROS_INICIALES.edad).toBeNull()
    expect(vista().contadoresEdad).toEqual({ menor_12: 1, '12_17': 1, '18_25': 0, '26_mas': 1, sin_fecha: 1 })
  })

  it('counts the selected sub-area only', () => {
    expect(vista({ equipo: ID_DHAH }).contadoresEdad).toEqual({ menor_12: 0, '12_17': 1, '18_25': 0, '26_mas': 1, sin_fecha: 0 })
  })

  it('follows every other filter but its own', () => {
    expect(vista({ etapa: 'activo', edad: 'menor_12' }).contadoresEdad).toEqual({
      menor_12: 1,
      '12_17': 1,
      '18_25': 0,
      '26_mas': 1,
      sin_fecha: 0,
    })
  })

  it('keeps the rows of the range; a row without a known range never matches', () => {
    expect(nombres(vista({ edad: '12_17' }))).toEqual(['Ana', 'Ana'])
    expect(nombres(vista({ edad: 'sin_fecha' }))).toEqual(['Carla'])
    expect(nombres(vista({ edad: '18_25' }))).toEqual([])
  })

  it('narrows the etapa counters too', () => {
    expect(vista({ edad: 'sin_fecha' }).contadoresEtapa.porEtapa.postulado).toBe(1)
    expect(vista({ edad: 'sin_fecha' }).contadoresEtapa.todas).toBe(1)
  })

  it('has no counters when nobody has a known range (the lookup failed or answered nobody)', () => {
    expect(vista({}, [fila('x', 'Xavi', ID_CORO, 'Voluntario')]).contadoresEdad).toBeNull()
  })

  it('shows a pill that clears it, outside the phone sheet', () => {
    const v = vista({ edad: '26_mas' })
    const pastilla = v.pastillas.find((p) => p.clave === 'edad')
    expect(pastilla?.etiqueta).toBe('Edad: 26+')
    expect(pastilla?.parche).toEqual({ edad: null })
    expect(v.filtrosEnHoja).toBe(0)
  })

  it('round-trips through the URL and drops an invalid value', () => {
    const filtros = { ...FILTROS_INICIALES, edad: '18_25' as const }
    expect(escribirFiltrosEnUrl(filtros)).toBe('edad=18_25')
    expect(leerFiltrosDeUrl(new URLSearchParams('edad=18_25')).edad).toBe('18_25')
    expect(leerFiltrosDeUrl(new URLSearchParams('edad=40')).edad).toBeNull()
    expect(escribirFiltrosEnUrl(FILTROS_INICIALES)).toBe('')
  })
})
