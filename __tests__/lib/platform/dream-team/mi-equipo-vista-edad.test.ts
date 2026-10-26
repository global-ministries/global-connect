/**
 * `mi-equipo-vista` — the age filter of Mi equipo (D10 of
 * odd/tasks/ninos-voluntarios-waumba.md).
 */
import { filtrarPersonas, type PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { personaId } from '@/lib/platform/dream-team/types'

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
    ...extra,
  }
}

const personas = [
  persona('Ana', { rangoEdad: '12_17' }),
  persona('Beto', { rangoEdad: '26_mas', estado: 'postulado' }),
  persona('Carla', { rangoEdad: '12_17', estado: 'postulado' }),
  persona('Eli'),
]

const nombres = (lista: readonly PersonaVista[]) => lista.map((p) => p.nombre)

describe('filtrarPersonas by age', () => {
  it('keeps everybody without an age filter', () => {
    expect(nombres(filtrarPersonas(personas, {}))).toEqual(['Ana', 'Beto', 'Carla', 'Eli'])
    expect(nombres(filtrarPersonas(personas, { edad: null }))).toEqual(['Ana', 'Beto', 'Carla', 'Eli'])
  })

  it('keeps the people of the range; somebody without a known range never matches', () => {
    expect(nombres(filtrarPersonas(personas, { edad: '12_17' }))).toEqual(['Ana', 'Carla'])
    expect(nombres(filtrarPersonas(personas, { edad: 'sin_fecha' }))).toEqual([])
  })

  it('combines with the estado filter and the search', () => {
    expect(nombres(filtrarPersonas(personas, { edad: '12_17', estado: 'postulado' }))).toEqual(['Carla'])
    expect(nombres(filtrarPersonas(personas, { edad: '12_17', query: 'an' }))).toEqual(['Ana'])
  })
})
