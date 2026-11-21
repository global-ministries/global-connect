/**
 * Estructura — who reshapes which equipos and how «Mover a…» reads
 * (odd/tasks/dream-team-estructura-correcciones.md, T3, S4, S5): the pure
 * helpers of lib/platform/dream-team/estructura-gestion.ts. The database is
 * the authority (dream_team_gestiona_equipo); these mirror it so the screen
 * offers only what the RPCs accept.
 */
import {
  buscarDestinos,
  confirmacionMover,
  destinosMover,
  equiposQueGestiona,
  gestionaAlgunEquipo,
  mensajeErrorGestion,
  resultadoRpcEquipo,
} from '@/lib/platform/dream-team/estructura-gestion'
import type { NodoOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'

// Experiencia › DPS › (Producción Técnica › Video › (Mesa de video, Cámaras)), Bautizos; Conexión › Grupos.
const EQUIPOS = [
  { id: 'exp' },
  { id: 'dps', parentEquipoId: 'exp' },
  { id: 'pt', parentEquipoId: 'dps' },
  { id: 'video', parentEquipoId: 'pt' },
  { id: 'mesa', parentEquipoId: 'video' },
  { id: 'cam', parentEquipoId: 'video' },
  { id: 'baut', parentEquipoId: 'dps' },
  { id: 'con' },
  { id: 'grupos', parentEquipoId: 'con' },
]

const cap = (key: string, scopeId?: string) => ({ key, ...(scopeId ? { scopeId } : {}) })

describe('equiposQueGestiona', () => {
  it('gives a scoped director their equipo and everything below it', () => {
    expect(equiposQueGestiona({ capabilities: [cap('dream_team.direct', 'pt')] }, EQUIPOS)).toEqual(['pt', 'video', 'mesa', 'cam'])
  })

  it('joins several scoped grants, org.manage included', () => {
    expect(
      equiposQueGestiona({ capabilities: [cap('dream_team.direct', 'baut'), cap('dream_team.org.manage', 'con')] }, EQUIPOS),
    ).toEqual(['baut', 'con', 'grupos'])
  })

  it('gives every equipo to a global org.manage or direct grant, an admin and a pastor', () => {
    const todos = EQUIPOS.map((equipo) => equipo.id)
    expect(equiposQueGestiona({ capabilities: [cap('dream_team.org.manage')] }, EQUIPOS)).toEqual(todos)
    expect(equiposQueGestiona({ capabilities: [cap('dream_team.direct')] }, EQUIPOS)).toEqual(todos)
    expect(equiposQueGestiona({ capabilities: [], globalRoles: ['admin'] }, EQUIPOS)).toEqual(todos)
    expect(equiposQueGestiona({ capabilities: [], globalRoles: ['pastor'] }, EQUIPOS)).toEqual(todos)
  })

  it('gives nothing to coordinators, leads, volunteers or director.coordinate (directors and up only)', () => {
    const capacidades = ['dream_team.coordinate', 'dream_team.lead', 'dream_team.serve', 'dream_team.director.coordinate'].map((key) =>
      cap(key, key === 'dream_team.director.coordinate' ? undefined : 'dps'),
    )
    expect(equiposQueGestiona({ capabilities: capacidades, globalRoles: ['director-general', 'lider'] }, EQUIPOS)).toEqual([])
  })

  it('ignores a grant on an equipo the viewer cannot see', () => {
    expect(equiposQueGestiona({ capabilities: [cap('dream_team.direct', 'otro')] }, EQUIPOS)).toEqual([])
  })
})

describe('gestionaAlgunEquipo', () => {
  it('is the coarse gate of the equipo actions', () => {
    expect(gestionaAlgunEquipo({ capabilities: [cap('dream_team.direct', 'pt')] })).toBe(true)
    expect(gestionaAlgunEquipo({ capabilities: [cap('dream_team.org.manage')] })).toBe(true)
    expect(gestionaAlgunEquipo({ capabilities: [], globalRoles: ['pastor'] })).toBe(true)
    expect(gestionaAlgunEquipo({ capabilities: [cap('dream_team.coordinate', 'pt'), cap('dream_team.director.coordinate')] })).toBe(false)
  })
})

function nodo(id: string, label: string, padreId: string | null, profundidad: number, extra: Partial<NodoOrganigrama> = {}): NodoOrganigrama {
  return {
    id,
    label,
    padreId,
    profundidad,
    hijos: [],
    descendientes: 0,
    activo: true,
    editable: true,
    personasRama: 0,
    responsable: null,
    problemas: [],
    rolesSinAsignar: [],
    turnosDesactivados: [],
    problemasEnRama: false,
    ...extra,
  }
}

// Pre-order, as the organigrama lists them.
const NODOS: readonly NodoOrganigrama[] = [
  nodo('exp', 'Dirección de Experiencia', null, 0),
  nodo('dps', 'DPS', 'exp', 1),
  nodo('pt', 'Producción Técnica', 'dps', 2),
  nodo('video', 'Video', 'pt', 3),
  nodo('mesa', 'Mesa de video', 'video', 4),
  nodo('cam', 'Cámaras', 'video', 4),
  nodo('viejo', 'Equipo viejo', 'dps', 2, { activo: false }),
  nodo('baut', 'Bautizos', 'dps', 2),
  nodo('con', 'Dirección de Conexión', null, 0),
  nodo('gdv', 'Grupos de Vida', null, 0, { editable: false }),
]

describe('destinosMover', () => {
  const todos = new Set(NODOS.map((n) => n.id))

  it('offers every active, real equipo the viewer manages, with its path, but the equipo itself, its subtree and its current parent', () => {
    expect(destinosMover(NODOS, 'video', todos)).toEqual([
      { id: 'exp', label: 'Dirección de Experiencia', ruta: ['Dirección de Experiencia'], profundidad: 0 },
      { id: 'dps', label: 'DPS', ruta: ['Dirección de Experiencia', 'DPS'], profundidad: 1 },
      { id: 'baut', label: 'Bautizos', ruta: ['Dirección de Experiencia', 'DPS', 'Bautizos'], profundidad: 2 },
      { id: 'con', label: 'Dirección de Conexión', ruta: ['Dirección de Conexión'], profundidad: 0 },
    ])
  })

  it('offers Producción Técnica for Mesa de video (one level up)', () => {
    expect(destinosMover(NODOS, 'mesa', todos).map((d) => d.id)).toEqual(['exp', 'dps', 'pt', 'cam', 'baut', 'con'])
  })

  it('keeps to what the viewer manages', () => {
    expect(destinosMover(NODOS, 'mesa', new Set(['pt', 'video', 'mesa', 'cam'])).map((d) => d.id)).toEqual(['pt', 'cam'])
  })
})

describe('buscarDestinos', () => {
  const destinos = destinosMover(NODOS, 'baut', new Set(NODOS.map((n) => n.id)))

  it('matches the name ignoring case and accents', () => {
    expect(buscarDestinos(destinos, 'conexion').map((d) => d.id)).toEqual(['con'])
    expect(buscarDestinos(destinos, ' CÁMARAS ').map((d) => d.id)).toEqual(['cam'])
  })

  it('returns them all for an empty search', () => {
    expect(buscarDestinos(destinos, '  ')).toEqual(destinos)
  })
})

describe('confirmacionMover', () => {
  it('names origin and destination and what moves with it', () => {
    expect(confirmacionMover({ equipo: 'Bautizos', origen: 'DPS', destino: 'Dirección de Conexión', subequipos: 2, personas: 12 })).toEqual({
      titulo: '¿Mover «Bautizos»?',
      origenDestino: 'Pasará de «DPS» a «Dirección de Conexión».',
      arrastra: 'Con él se mueven 2 subequipos y 12 personas; todos siguen en sus equipos con sus roles.',
    })
  })

  it('uses the singular and drops what is zero', () => {
    expect(confirmacionMover({ equipo: 'Cámaras', origen: 'Video', destino: 'Producción Técnica', subequipos: 0, personas: 1 }).arrastra).toBe(
      'Con él se mueve 1 persona; sigue en su equipo con su rol.',
    )
    expect(confirmacionMover({ equipo: 'X', origen: 'A', destino: 'B', subequipos: 1, personas: 0 }).arrastra).toBe('Con él se mueve 1 subequipo.')
    expect(confirmacionMover({ equipo: 'X', origen: 'A', destino: 'B', subequipos: 0, personas: 0 }).arrastra).toBe(
      'No tiene subequipos ni personas.',
    )
  })
})

describe('mensajeErrorGestion', () => {
  it.each([
    ['sin_autoridad', 'crear', 'No diriges este equipo ni uno superior, así que no puedes cambiarlo.'],
    ['sin_autoridad', 'mover', 'Para moverlo tienes que dirigir el equipo donde está y el equipo destino (o uno superior a cada uno).'],
    ['nombre_repetido', 'crear', 'Ya hay un equipo con ese nombre en ese lugar (puede estar inactivo). Elige otro nombre.'],
    ['nombre_invalido', 'renombrar', 'Escribe un nombre de 1 a 120 caracteres.'],
    ['equipo_raiz', 'mover', 'Una dirección principal no se puede mover.'],
    ['mismo_padre', 'mover', 'El equipo ya está ahí. Elige otro destino.'],
    ['ciclo', 'mover', 'No puedes moverlo dentro de sí mismo ni de uno de sus subequipos.'],
    ['equipo_ancla', 'mover', 'Este equipo sostiene la planificación de DPS y no se puede mover.'],
    [
      'experiencia_con_datos',
      'mover',
      'Este equipo o uno de sus subequipos tiene talleres, grupos de Estudiantes o salones de Niños y no puede pasar a otra área. Pide ayuda a un administrador.',
    ],
    [
      'dps_convocados_pendientes',
      'mover',
      'Hay personas convocadas en planes de DPS de hoy en adelante en este equipo. Quítalas de esos planes antes de sacarlo de DPS.',
    ],
    ['destino_invalido', 'mover', 'El equipo destino no existe o está inactivo. Elige otro.'],
    ['sin_sesion', 'mover', 'Tu sesión expiró. Inicia sesión nuevamente.'],
    ['otra_cosa', 'mover', 'No pudimos guardar el cambio. Inténtalo de nuevo.'],
  ] as const)('%s (%s) → %s', (codigo, accion, mensaje) => {
    expect(mensajeErrorGestion(codigo, accion)).toBe(mensaje)
  })
})

describe('resultadoRpcEquipo', () => {
  const fila = { id: 'eq-1', experiencia: 'dps', parent_equipo_id: 'pt', label: 'Cámaras', activo: true }

  it('maps the returned equipo and the path of a move', () => {
    expect(resultadoRpcEquipo({ data: fila, error: null }, 'crear')).toEqual({
      ok: true,
      equipo: { id: 'eq-1', experiencia: 'dps', parentEquipoId: 'pt', label: 'Cámaras', activo: true },
    })
    expect(resultadoRpcEquipo({ data: { ...fila, ruta: 'DPS › Producción Técnica › Cámaras' }, error: null }, 'mover')).toEqual({
      ok: true,
      equipo: { id: 'eq-1', experiencia: 'dps', parentEquipoId: 'pt', label: 'Cámaras', activo: true },
      ruta: 'DPS › Producción Técnica › Cámaras',
    })
  })

  it('maps a root equipo without a parent', () => {
    expect(resultadoRpcEquipo({ data: { ...fila, parent_equipo_id: null }, error: null }, 'renombrar')).toEqual({
      ok: true,
      equipo: { id: 'eq-1', experiencia: 'dps', label: 'Cámaras', activo: true },
    })
  })

  it('maps the error codes to the action errors with the Spanish message', () => {
    expect(resultadoRpcEquipo({ data: null, error: { code: '42501', message: 'sin_autoridad' } }, 'mover')).toEqual({
      ok: false,
      error: 'forbidden',
      message: 'Para moverlo tienes que dirigir el equipo donde está y el equipo destino (o uno superior a cada uno).',
    })
    expect(resultadoRpcEquipo({ data: null, error: { code: '42501', message: 'sin_sesion' } }, 'crear')).toEqual({
      ok: false,
      error: 'unauthorized',
      message: 'Tu sesión expiró. Inicia sesión nuevamente.',
    })
    expect(resultadoRpcEquipo({ data: null, error: { code: '22023', message: 'ciclo' } }, 'mover')).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'No puedes moverlo dentro de sí mismo ni de uno de sus subequipos.',
    })
    expect(resultadoRpcEquipo({ data: null, error: { code: '22023', message: 'equipo_invalido' } }, 'renombrar')).toEqual({
      ok: false,
      error: 'not-found',
      message: 'Este equipo ya no existe. Recarga la página.',
    })
    expect(resultadoRpcEquipo({ data: null, error: { code: 'XX000', message: 'boom' } }, 'crear')).toEqual({
      ok: false,
      error: 'internal',
      message: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
    })
    expect(resultadoRpcEquipo({ data: { sin: 'id' }, error: null }, 'crear')).toEqual({
      ok: false,
      error: 'internal',
      message: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
    })
  })
})
