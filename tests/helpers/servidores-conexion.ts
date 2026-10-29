/**
 * Conexión-shaped fixture for the "Servidores" tests: one dirección with 38
 * servicios held by 36 personas (Antholy Ludovic Gómez and Jose Jimenez serve
 * in two teams), 31 of them without an account, three not active (two in
 * orientation, one paused); plus a second dirección (Alabanza) with two
 * servicios so the dirección → equipo cascade has something to narrow.
 */
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import type { FilaServidor } from '@/lib/platform/dream-team/servidores-vista'
import { personaId, type DreamTeamEstado } from '@/lib/platform/dream-team/types'

export const HOY = new Date('2026-09-29T12:00:00Z')

export const ID_CONEXION = 'dir-conexion'
export const ID_ALABANZA = 'dir-alabanza'
export const ID_TALLERES = 'nodo-talleres'
export const ID_DHAH = 'eq-dhah'
export const ID_PAREJAS = 'eq-parejas'
export const ID_PDP = 'eq-pdp'
export const ID_MDH = 'eq-mdh'
export const ID_CORO = 'eq-coro'

function nodo(id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> {
  return {
    equipo: { origen: 'dream_team', id, label, experiencia: 'talleres_crecimiento', activo: true, responsables: [] },
    hijos,
    nivel,
  }
}

export const arbolServidores: readonly NodoArbol<NodoEquipoArbol>[] = [
  nodo(ID_ALABANZA, 'Dirección de Alabanza', [nodo(ID_CORO, 'Coro', [], 1)]),
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
]

const CON_CUENTA = new Set(['Antholy Ludovic Gómez', 'Edmir Muñoz', 'Jose Jimenez', 'Edith Pérez', 'Fernando Ramos'])
const TELEFONOS: Readonly<Record<string, string>> = {
  'Edmir Muñoz': '04145070815',
  'Jose Jimenez': '04263667378',
  'Wito González': '+17867312193',
  'Fernando Ramos': '04125457346',
  'Oriel Lugo': '0424831126',
}
// Index in BASE -> non-active estado.
const ESTADOS: Readonly<Record<number, DreamTeamEstado>> = { 5: 'en_orientacion', 25: 'en_orientacion', 36: 'en_pausa' }
// Index in BASE -> start date (everything else starts on 2026-09-29).
const INICIOS: Readonly<Record<number, string>> = {
  1: '2026-09-05T10:00:00Z',
  2: '2026-08-20T10:00:00Z',
  3: '2026-06-15T10:00:00Z',
  4: '2025-11-01T10:00:00Z',
}

type Rol = 'Director' | 'Coordinador' | 'Facilitador'
const BASE: ReadonlyArray<readonly [string, string, Rol]> = [
  [ID_CONEXION, 'Antholy Ludovic Gómez', 'Director'],
  [ID_DHAH, 'Edmir Muñoz', 'Coordinador'], [ID_DHAH, 'Fernando Ramos', 'Facilitador'], [ID_DHAH, 'Frederick Peña', 'Facilitador'],
  [ID_DHAH, 'Jose Jimenez', 'Facilitador'], [ID_DHAH, 'Luis Barrios', 'Facilitador'], [ID_DHAH, 'Manuel Rada', 'Facilitador'],
  [ID_DHAH, 'Oriel Lugo', 'Facilitador'], [ID_DHAH, 'Wito González', 'Facilitador'], [ID_DHAH, 'Miguel Reinoso', 'Facilitador'],
  [ID_PAREJAS, 'Antholy Ludovic Gómez', 'Coordinador'], [ID_PAREJAS, 'Edwin Martinez', 'Facilitador'],
  [ID_PAREJAS, 'Manola de Martinez', 'Facilitador'], [ID_PAREJAS, 'Ivan Caruci', 'Facilitador'], [ID_PAREJAS, 'Jairic Mirabal', 'Facilitador'],
  [ID_PAREJAS, 'Jairo Ramírez', 'Facilitador'], [ID_PAREJAS, 'Julio Valencia', 'Facilitador'], [ID_PAREJAS, 'Glorialy de Valencia', 'Facilitador'],
  [ID_PDP, 'Jose Jimenez', 'Coordinador'], [ID_PDP, 'Rafael Escalona', 'Facilitador'], [ID_PDP, 'Jessica de Escalona', 'Facilitador'],
  [ID_PDP, 'Jose Salcedo', 'Facilitador'], [ID_PDP, 'Karol Valero', 'Facilitador'], [ID_PDP, 'Beatriz Paz', 'Facilitador'],
  [ID_PDP, 'José Parra', 'Facilitador'], [ID_PDP, 'Wilennys García', 'Facilitador'], [ID_PDP, 'Kenhit Gomez', 'Facilitador'],
  [ID_PDP, 'Julia de Gomez', 'Facilitador'], [ID_PDP, 'Anderson Oviedo', 'Facilitador'], [ID_PDP, 'Yoselin Vargas', 'Facilitador'],
  [ID_PDP, 'Milagros Rivero', 'Facilitador'], [ID_PDP, 'Sixta Fernandez', 'Facilitador'],
  [ID_MDH, 'Edith Pérez', 'Coordinador'], [ID_MDH, 'Blanca Raquel Rojas', 'Facilitador'], [ID_MDH, 'Blanca Isabel Rojas', 'Facilitador'],
  [ID_MDH, 'Yamilee Araujo', 'Facilitador'], [ID_MDH, 'Rayda Alvarado', 'Facilitador'], [ID_MDH, 'Luluany de Sosa', 'Facilitador'],
]

const EQUIPOS: Readonly<Record<string, { label: string; ruta: string; direccionId: string }>> = {
  [ID_CONEXION]: { label: 'Dirección de Conexión', ruta: '', direccionId: ID_CONEXION },
  [ID_DHAH]: { label: 'De Hombre a Hombre', ruta: 'Dirección de Conexión · Talleres', direccionId: ID_CONEXION },
  [ID_PAREJAS]: { label: 'Parejas', ruta: 'Dirección de Conexión · Talleres', direccionId: ID_CONEXION },
  [ID_PDP]: { label: 'Punto de Partida', ruta: 'Dirección de Conexión · Talleres', direccionId: ID_CONEXION },
  [ID_MDH]: { label: 'Mujer de Hoy', ruta: 'Dirección de Conexión · Talleres', direccionId: ID_CONEXION },
  [ID_CORO]: { label: 'Coro', ruta: 'Dirección de Alabanza', direccionId: ID_ALABANZA },
}

export function fila(
  clave: string,
  nombre: string,
  equipoId: string,
  rol: string,
  extra: Partial<FilaServidor> = {},
): FilaServidor {
  const equipo = EQUIPOS[equipoId]
  return {
    clave: `servicio-${clave}`,
    personaId: personaId(`persona-${nombre}`),
    nombre,
    equipoId,
    equipoLabel: equipo.label,
    equipoRuta: equipo.ruta,
    direccionId: equipo.direccionId,
    rolLabel: rol,
    estado: 'activo',
    fechaInicio: '2026-09-29T10:00:00Z',
    telefono: null,
    tieneCuenta: false,
    origen: 'dream_team',
    servicioId: `servicio-${clave}`,
    version: 1,
    editable: true,
    ...extra,
  }
}

/** 38 servicios, 36 personas, 31 without an account. */
export const filasConexion: readonly FilaServidor[] = BASE.map(([equipoId, nombre, rol], i) =>
  fila(String(i), nombre, equipoId, rol, {
    estado: ESTADOS[i] ?? 'activo',
    fechaInicio: INICIOS[i] ?? '2026-09-29T10:00:00Z',
    telefono: TELEFONOS[nombre] ?? null,
    tieneCuenta: CON_CUENTA.has(nombre),
  }),
)

export const filasAlabanza: readonly FilaServidor[] = [
  fila('a1', 'Sara Ponce', ID_CORO, 'Coordinador', { tieneCuenta: true }),
  fila('a2', 'Tomás Rey', ID_CORO, 'Facilitador'),
]

export const todasLasFilas: readonly FilaServidor[] = [...filasConexion, ...filasAlabanza]

// ── Niños-like tree: a dirección with two áreas, each with its equipos ──

export const ID_NINOS = 'dir-ninos'
export const ID_WAUMBA = 'area-waumba'
export const ID_UPSTREET = 'area-upstreet'

export const arbolNinos: readonly NodoArbol<NodoEquipoArbol>[] = [
  nodo(ID_NINOS, 'Dirección de Niños', [
    nodo(ID_WAUMBA, 'Waumba Land', [nodo('w-anf', 'Anfitriones', [], 2), nodo('w-salab', 'Sala B', [], 2)], 1),
    nodo(ID_UPSTREET, 'UpStreet', [nodo('u-anf', 'Anfitriones', [], 2), nodo('u-gp', 'Grupos pequeños', [], 2)], 1),
  ]),
]

const EQUIPOS_NINOS: Readonly<Record<string, { label: string; ruta: string }>> = {
  [ID_NINOS]: { label: 'Dirección de Niños', ruta: '' },
  [ID_WAUMBA]: { label: 'Waumba Land', ruta: 'Dirección de Niños' },
  [ID_UPSTREET]: { label: 'UpStreet', ruta: 'Dirección de Niños' },
  'w-anf': { label: 'Anfitriones', ruta: 'Dirección de Niños · Waumba Land' },
  'w-salab': { label: 'Sala B', ruta: 'Dirección de Niños · Waumba Land' },
  'u-anf': { label: 'Anfitriones', ruta: 'Dirección de Niños · UpStreet' },
  'u-gp': { label: 'Grupos pequeños', ruta: 'Dirección de Niños · UpStreet' },
}

function filaNinos(clave: string, nombre: string, equipoId: string, rol: string, extra: Partial<FilaServidor> = {}): FilaServidor {
  const equipo = EQUIPOS_NINOS[equipoId]
  return {
    ...fila(`n${clave}`, nombre, ID_CORO, rol),
    equipoId,
    equipoLabel: equipo.label,
    equipoRuta: equipo.ruta,
    direccionId: ID_NINOS,
    ...extra,
  }
}

/** 13 servicios, 12 personas (Ana Lucía Marín serves in both áreas), 4 without an account. */
export const filasNinos: readonly FilaServidor[] = [
  filaNinos('1', 'Nina Rodríguez', ID_NINOS, 'Director', { tieneCuenta: true, telefono: '04141234567' }),
  filaNinos('2', 'Wanda Pérez', ID_WAUMBA, 'Coordinador', { tieneCuenta: true, telefono: '04121112233' }),
  filaNinos('3', 'Ana Lucía Marín', 'w-anf', 'Facilitador', { telefono: '0424831126' }),
  filaNinos('4', 'Beto Salas', 'w-anf', 'Facilitador', { tieneCuenta: true, telefono: '04265554433' }),
  filaNinos('5', 'Carla Méndez', 'w-salab', 'Facilitador', { estado: 'postulado' }),
  filaNinos('6', 'Diego Torres', 'w-salab', 'Facilitador', { tieneCuenta: true, estado: 'en_orientacion' }),
  filaNinos('7', 'Elena Ruiz', 'w-salab', 'Facilitador', { tieneCuenta: true, turnoIds: ['t-9'] }),
  filaNinos('8', 'Daniel Ortega', ID_UPSTREET, 'Coordinador', { tieneCuenta: true }),
  filaNinos('9', 'Ana Lucía Marín', 'u-anf', 'Facilitador', { telefono: '0424831126' }),
  filaNinos('10', 'Fabiola Castillo de los Ángeles Hernández', 'u-anf', 'Facilitador', { tieneCuenta: true, estado: 'en_pausa' }),
  filaNinos('11', 'Gabriel Núñez', 'u-gp', 'Facilitador'),
  filaNinos('12', 'Helena Vargas', 'u-gp', 'Facilitador'),
  filaNinos('13', 'Iván Rojas', 'u-gp', 'Facilitador', { tieneCuenta: true }),
]
