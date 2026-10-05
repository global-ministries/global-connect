/**
 * `servidores-vista` — the shift filter (T8, D12 of odd/tasks/ninos-voluntarios-waumba.md).
 */
import {
  FILTROS_INICIALES,
  calcularVistaServidores,
  escribirFiltrosEnUrl,
  leerFiltrosDeUrl,
  type FilaServidor,
  type FiltrosServidores,
} from '@/lib/platform/dream-team/servidores-vista'
import { SIN_TURNO, type Turno } from '@/lib/platform/dream-team/turnos'
import { HOY, ID_CORO, ID_DHAH, arbolServidores, fila } from '../../../../tests/helpers/servidores-conexion'

const T9 = '00000000-0000-4000-8000-000000000009'
const T11 = '00000000-0000-4000-8000-000000000011'
const turnos: Turno[] = [
  { id: T11, campusId: 'bqt', nombre: 'Domingo 11:00', diaSemana: 0, hora: '11:00', orden: 2, activo: true },
  { id: T9, campusId: 'bqt', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true },
]

const filas: FilaServidor[] = [
  fila('a', 'Ana', ID_DHAH, 'Voluntario', { turnoIds: [T9] }),
  fila('b', 'Beto', ID_DHAH, 'Coordinador', { turnoIds: [T9, T11] }),
  fila('c', 'Carla', ID_CORO, 'Voluntario', { turnoIds: [] }),
  fila('d', 'Dani', ID_CORO, 'Voluntario'),
  fila('e', 'Eli', ID_CORO, 'Líder', { origen: 'grupos_vida', editable: false }),
]

function vista(filtros: Partial<FiltrosServidores> = {}) {
  return calcularVistaServidores({ filas, arbol: arbolServidores, filtros: { ...FILTROS_INICIALES, ...filtros }, hoy: HOY, turnos })
}

const nombres = (v: ReturnType<typeof vista>) => v.visibles.map((f) => f.nombre)

describe('shift filter', () => {
  it('starts with no shift filter and offers the shifts in campus order', () => {
    expect(FILTROS_INICIALES.turno).toBeNull()
    expect(vista().opciones.turnos).toEqual([
      { id: T9, label: 'Domingo 9:00' },
      { id: T11, label: 'Domingo 11:00' },
    ])
  })

  it('keeps the servicios assigned to the shift, including those in several shifts', () => {
    expect(nombres(vista({ turno: T9 }))).toEqual(['Ana', 'Beto'])
    expect(nombres(vista({ turno: T11 }))).toEqual(['Beto'])
  })

  it('"sin turno" keeps the Dream Team servicios without a shift, never a Grupos de Vida row', () => {
    expect(nombres(vista({ turno: SIN_TURNO }))).toEqual(['Carla', 'Dani'])
  })

  it('shows a pill that clears it and counts it in the phone sheet', () => {
    const v = vista({ turno: T11 })
    const pastilla = v.pastillas.find((p) => p.clave === 'turno')
    expect(pastilla?.etiqueta).toBe('Turno: Domingo 11:00')
    expect(pastilla?.parche).toEqual({ turno: null })
    expect(v.filtrosEnHoja).toBe(1)
    expect(vista({ turno: SIN_TURNO }).pastillas.find((p) => p.clave === 'turno')?.etiqueta).toBe('Sin turno')
  })

  it('round-trips through the URL', () => {
    expect(escribirFiltrosEnUrl({ ...FILTROS_INICIALES, turno: T9 })).toBe(`turno=${T9}`)
    expect(leerFiltrosDeUrl(new URLSearchParams(`turno=${T9}`)).turno).toBe(T9)
    expect(leerFiltrosDeUrl(new URLSearchParams('turno=sin_turno')).turno).toBe(SIN_TURNO)
    expect(leerFiltrosDeUrl(new URLSearchParams('')).turno).toBeNull()
  })

  it('offers no shifts when the campus has none', () => {
    const v = calcularVistaServidores({ filas, arbol: arbolServidores, filtros: FILTROS_INICIALES, hoy: HOY })
    expect(v.opciones.turnos).toEqual([])
  })
})
