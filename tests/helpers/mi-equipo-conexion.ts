/**
 * Conexión-shaped fixture for the "Mi equipo" tests: one direccion with a
 * director, an intermediate "Talleres" node without people of its own and four
 * teams holding 37 people (38 with the director), two of them waiting in
 * orientation and one paused; plus an empty direccion and an inactive one that
 * must never be offered.
 */
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import type { PersonaEntrada, PersonasPorEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'
import { personaId, type DreamTeamEstado } from '@/lib/platform/dream-team/types'

export const ID_CONEXION = 'dir-conexion'
export const ID_VACIA = 'dir-vacia'
export const ID_INACTIVA = 'dir-inactiva'
export const ID_TALLERES = 'nodo-talleres'
export const ID_DHAH = 'eq-dhah'
export const ID_PAREJAS = 'eq-parejas'
export const ID_PDP = 'eq-pdp'
export const ID_MDH = 'eq-mdh'

const ROLES = { Director: 'director', Coordinador: 'coordinador', Facilitador: 'facilitador' } as const

export function persona(
  clave: string,
  nombre: string,
  rol: keyof typeof ROLES,
  estado: DreamTeamEstado = 'activo',
): PersonaEntrada {
  return {
    clave,
    personaId: personaId(`persona-${clave}`),
    nombre,
    rolClave: ROLES[rol],
    rolLabel: rol,
    estado,
    origen: 'dream_team',
    servicioId: `servicio-${clave}`,
    version: 1,
  }
}

function nodo(id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0, activo = true) {
  return {
    equipo: { origen: 'dream_team' as const, id, label, experiencia: 'talleres_crecimiento' as const, activo, responsables: [] },
    hijos,
    nivel,
  }
}

export const arbolConexion: readonly NodoArbol<NodoEquipoArbol>[] = [
  nodo(ID_CONEXION, 'Dirección de Conexión', [
    nodo(
      ID_TALLERES,
      'Talleres',
      [
        nodo(ID_DHAH, 'De Hombre a Hombre', [], 2),
        nodo(ID_PAREJAS, 'Parejas', [], 2),
        nodo(ID_PDP, 'Punto de Partida', [], 2),
        nodo(ID_MDH, 'Mujer de Hoy', [], 2),
      ],
      1,
    ),
  ]),
  nodo(ID_INACTIVA, 'Dirección Antigua', [], 0, false),
  nodo(ID_VACIA, 'Dirección Vacía'),
]

const nombres = (prefijo: string, lista: readonly string[], estados: Record<number, DreamTeamEstado> = {}) =>
  lista.map((nombre, i) => persona(`${prefijo}-${i}`, nombre, 'Facilitador', estados[i] ?? 'activo'))

export const personasPorEquipoConexion: PersonasPorEquipo = {
  [ID_CONEXION]: [persona('dir', 'Antholy Ludovic Gómez', 'Director')],
  [ID_DHAH]: [
    persona('dhah-c', 'Edmir Muñoz', 'Coordinador'),
    ...nombres(
      'dhah',
      ['Fernando Ramos', 'Frederick Peña', 'Jose Jimenez', 'Luis Barrios', 'Manuel Rada', 'Oriel Lugo', 'Wito González', 'Miguel Reinoso'],
      { 3: 'en_orientacion' },
    ),
  ],
  [ID_PAREJAS]: [
    persona('par-c', 'Ludovic Gómez', 'Coordinador'),
    ...nombres('par', ['Edwin Martinez', 'Manola de Martinez', 'Ivan Caruci', 'Jairic Mirabal', 'Jairo Ramírez', 'Julio Valencia', 'Glorialy de Valencia']),
  ],
  [ID_PDP]: [
    persona('pdp-c', 'Jose Jimenez', 'Coordinador'),
    ...nombres(
      'pdp',
      [
        'Rafael Escalona', 'Jessica de Escalona', 'Jose Salcedo', 'Karol Valero', 'Beatriz Paz', 'José Parra', 'Wilennys García',
        'Kenhit Gomez', 'Julia de Gomez', 'Anderson Oviedo', 'Yoselin Vargas', 'Milagros Rivero', 'Sixta Fernandez',
      ],
      { 6: 'en_orientacion', 12: 'en_pausa' },
    ),
  ],
  [ID_MDH]: [
    persona('mdh-c', 'Edith Pérez', 'Coordinador'),
    ...nombres('mdh', ['Blanca Raquel Rojas', 'Blanca Isabel Rojas', 'Yamilee Araujo', 'Rayda Alvarado', 'Luluany de Sosa']),
  ],
  [ID_INACTIVA]: [persona('vieja', 'Persona Antigua', 'Coordinador', 'inactivo')],
}
