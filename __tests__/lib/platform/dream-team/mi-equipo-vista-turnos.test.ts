/**
 * `mi-equipo-vista` — the shift filter of Mi equipo (T8, D12 of
 * odd/tasks/ninos-voluntarios-waumba.md).
 */
import { filtrarPersonas, type PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { SIN_TURNO } from '@/lib/platform/dream-team/turnos'
import { personaId } from '@/lib/platform/dream-team/types'

const T9 = '00000000-0000-4000-8000-000000000009'
const T11 = '00000000-0000-4000-8000-000000000011'

function persona(nombre: string, extra: Partial<PersonaVista> = {}): PersonaVista {
  return {
    clave: nombre,
    personaId: personaId(`p-${nombre}`),
    nombre,
    iniciales: nombre.slice(0, 2).toUpperCase(),
    equipoId: 'e1',
    equipoLabel: 'Sala',
    rolClave: 'voluntario',
    rolLabel: 'Voluntario',
    rolOrden: 3,
    estado: 'activo',
    origen: 'dream_team',
    editable: true,
    telefono: null,
    tieneCuenta: null,
    turnoIds: [],
    ...extra,
  }
}

const personas = [
  persona('Ana', { turnoIds: [T9] }),
  persona('Beto', { turnoIds: [T9, T11] }),
  persona('Carla'),
  persona('Eli', { origen: 'grupos_vida', editable: false }),
]

const nombres = (lista: readonly PersonaVista[]) => lista.map((p) => p.nombre)

describe('filtrarPersonas by shift', () => {
  it('keeps everybody without a shift filter', () => {
    expect(nombres(filtrarPersonas(personas, {}))).toEqual(['Ana', 'Beto', 'Carla', 'Eli'])
    expect(nombres(filtrarPersonas(personas, { turno: null }))).toEqual(['Ana', 'Beto', 'Carla', 'Eli'])
  })

  it('keeps the people assigned to the shift', () => {
    expect(nombres(filtrarPersonas(personas, { turno: T9 }))).toEqual(['Ana', 'Beto'])
    expect(nombres(filtrarPersonas(personas, { turno: T11 }))).toEqual(['Beto'])
  })

  it('"sin turno" keeps Dream Team people without a shift, never a Grupos de Vida leader', () => {
    expect(nombres(filtrarPersonas(personas, { turno: SIN_TURNO }))).toEqual(['Carla'])
  })

  it('combines with the estado filter and the search', () => {
    expect(nombres(filtrarPersonas(personas, { turno: T9, query: 'bet' }))).toEqual(['Beto'])
    expect(filtrarPersonas(personas, { turno: T9, estado: 'en_pausa' })).toEqual([])
  })
})
