/**
 * The session draft of the planner (S24 of odd/tasks/planner-gdv.md): the
 * pending changes in the planner_guardar_cambios shape, each with its human
 * description; the board with the draft applied; coalescing moves of the same
 * people; local undo and removing one change when nothing later depends on
 * it; the RPC payload with "tmp:" keys; the blockers seen through the draft;
 * and the localStorage text, discarded on another version, season or shape.
 */
import {
  BORRADOR_VACIO,
  VERSION_BORRADOR,
  aPayload,
  agregarCambio,
  aplicarBorrador,
  bloqueosConBorrador,
  claveBorrador,
  leerBorrador,
  marcasBorrador,
  motivoNoQuitar,
  normalizarBorrador,
  nuevaClave,
  quitarCambio,
  quitarUltimo,
  resumenCambios,
  serializarBorrador,
  type Borrador,
  type Catalogo,
} from '@/lib/platform/grupos-vida/planner/borrador'
import type { CambioPlanner, DatosGrupo } from '@/lib/platform/grupos-vida/planner/acciones'
import type { Bloqueo } from '@/lib/platform/grupos-vida/planner'
import { LOCALIDADES, bancoDe, enGrupo, grupo, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'

const HECTOR = { segmento_lider_id: 'sl-hector', usuario_id: 'u-hector', nombre: 'Héctor', apellido: 'Linárez' }

const CATALOGO: Catalogo = {
  segmentos: [
    { id: 'seg-mat', nombre: 'Matrimonios', directores: [HECTOR] },
    { id: 'seg-muj', nombre: 'Mujeres +36', directores: [] },
  ],
  localidades: LOCALIDADES,
}

const ESCALONA = grupo({
  grupo_id: 'g-escalona',
  nombre: 'Grupo #14 Los Escalona',
  localidad_id: null,
  localidad_nombre: null,
  localidad_municipio_id: null,
  localidad_municipio_nombre: null,
  directores: [HECTOR],
  lideres: [enGrupo('l1')],
})
const ROSAS = grupo({
  grupo_id: 'g-rosas',
  nombre: 'Grupo Rosas',
  segmento_id: 'seg-muj',
  segmento_nombre: 'Mujeres +36',
  lideres: [enGrupo('l2')],
  miembros: [enGrupo('m1')],
})

const sinGrupo = { grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 }
const JUAN = persona({ usuario_id: 'juan', nombre: 'Juan', apellido: 'Castejón', conyuge_id: 'erica', ...sinGrupo })
const ERICA = persona({ usuario_id: 'erica', nombre: 'Érica', apellido: 'Castejón', conyuge_id: 'juan', ...sinGrupo })
const ANA = persona({ usuario_id: 'ana', nombre: 'Ana', apellido: 'Gil', ...sinGrupo })

const BASE = { grupos: [ESCALONA, ROSAS], banco: bancoDe([ESCALONA, ROSAS], [JUAN, ERICA, ANA]) }

const DATOS_NUEVO: DatosGrupo = {
  nombre: 'Cabudare Matrimonios 10',
  segmento_id: 'seg-mat',
  localidad_id: 'loc-cab',
  dia_reunion: 'Jueves',
  hora_reunion: '19:30',
  capacidad_maxima: 12,
  director_etapa_ids: ['u-hector'],
}

const agregar = (b: Borrador, ...cambios: CambioPlanner[]): Borrador => cambios.reduce((acc, c) => agregarCambio(acc, c, BASE, CATALOGO), b)
const mover = (usuarios: string[], grupo: string | null, rol: 'lider' | 'aprendiz' | 'miembro' | null = 'miembro'): CambioPlanner => ({
  tipo: 'mover',
  usuarios,
  grupo,
  rol: grupo === null ? null : rol,
})
const crear = (b: Borrador, datos: DatosGrupo = DATOS_NUEVO): CambioPlanner => ({ tipo: 'crear', clave: nuevaClave(b), datos })
const descripciones = (b: Borrador) => b.cambios.map((c) => c.descripcion)
const deGrupo = (estado: { grupos: readonly { grupo_id: string }[] }, id: string) => estado.grupos.find((g) => g.grupo_id === id)

describe('describing each change', () => {
  it('names who moves, where and in which role', () => {
    const b = agregar(BORRADOR_VACIO, mover(['juan', 'erica'], 'g-escalona'), mover(['ana'], 'g-rosas', 'lider'), mover(['m1'], null))

    expect(descripciones(b)).toEqual([
      'Mover a Juan y Érica Castejón a Grupo #14 Los Escalona como miembros',
      'Mover a Ana Gil a Grupo Rosas como líder',
      'Devolver a m1 Pérez al banco',
    ])
  })

  it('says a role change inside the same group', () => {
    const b = agregar(BORRADOR_VACIO, mover(['m1'], 'g-rosas', 'aprendiz'))

    expect(descripciones(b)).toEqual(['Cambiar el rol de m1 Pérez a aprendiz en Grupo Rosas'])
  })

  it('names a new group, an edit of one field and a deletion', () => {
    const inicio = BORRADOR_VACIO
    const b = agregar(
      inicio,
      crear(inicio),
      { tipo: 'editar', grupo: 'g-escalona', cambios: { localidad_id: 'loc-cab' } },
      { tipo: 'editar', grupo: 'g-rosas', cambios: { nombre: 'Rosas de Sarón' } },
      { tipo: 'editar', grupo: 'g-rosas', cambios: { dia_reunion: 'Martes', capacidad_maxima: 10 } },
      { tipo: 'eliminar', grupo: 'g-escalona' },
    )

    expect(descripciones(b)).toEqual([
      'Crear grupo Cabudare Matrimonios 10',
      'Cambiar localidad de Grupo #14 Los Escalona a Cabudare',
      'Cambiar nombre de Grupo Rosas a Rosas de Sarón',
      'Editar Rosas de Sarón',
      'Eliminar grupo Grupo #14 Los Escalona',
    ])
  })

  it('counts the pending changes by kind', () => {
    const b = agregar(BORRADOR_VACIO, crear(BORRADOR_VACIO), mover(['ana'], 'g-rosas'), mover(['juan'], 'g-rosas'), { tipo: 'eliminar', grupo: 'g-escalona' })

    expect(resumenCambios(b.cambios)).toBe('2 movimientos · 1 grupo nuevo · 1 grupo eliminado')
    expect(resumenCambios([])).toBe('Sin cambios')
  })
})

describe('applying the draft to the board', () => {
  it('shows a new group with its tmp key, label data and directors, and people moved into it', () => {
    const inicio = BORRADOR_VACIO
    const clave = nuevaClave(inicio)
    const b = agregar(inicio, crear(inicio), mover(['juan', 'erica'], clave, 'lider'))
    const r = aplicarBorrador(BASE, b.cambios, CATALOGO)

    expect(clave).toMatch(/^tmp:[A-Za-z0-9_.:-]{1,64}$/)
    expect(deGrupo(r, clave)).toMatchObject({
      grupo_id: clave,
      nombre: 'Cabudare Matrimonios 10',
      segmento_nombre: 'Matrimonios',
      localidad_id: 'loc-cab',
      localidad_nombre: 'Cabudare',
      localidad_municipio_id: 'mun-pal',
      hora_reunion: '19:30',
      activo: false,
      estado_ciclo: 'proximo',
      directores: [HECTOR],
    })
    expect(deGrupo(r, clave) && (deGrupo(r, clave) as typeof ESCALONA).lideres.map((p) => p.usuario_id)).toEqual(['juan', 'erica'])
    expect(r.banco.find((p) => p.usuario_id === 'juan')).toMatchObject({ grupo_actual_id: clave, grupo_actual_nombre: 'Cabudare Matrimonios 10', grupo_actual_rol: 'Líder' })
  })

  it('reflects an edit and hides a deleted group, its people back in the bank', () => {
    const b = agregar(BORRADOR_VACIO, { tipo: 'editar', grupo: 'g-escalona', cambios: { localidad_id: 'loc-cab', nombre: 'Los Escalona' } }, { tipo: 'eliminar', grupo: 'g-rosas' })
    const r = aplicarBorrador(BASE, b.cambios, CATALOGO)

    expect(deGrupo(r, 'g-escalona')).toMatchObject({ nombre: 'Los Escalona', localidad_id: 'loc-cab', localidad_nombre: 'Cabudare' })
    expect(r.banco.find((p) => p.usuario_id === 'l1')).toMatchObject({ grupo_actual_nombre: 'Los Escalona' })
    expect(deGrupo(r, 'g-rosas')).toBeUndefined()
    expect(r.banco.find((p) => p.usuario_id === 'm1')).toMatchObject({ grupo_actual_id: null, grupos_en_temporada: 0 })
  })

  it('leaves the base untouched without changes', () => {
    expect(aplicarBorrador(BASE, [], CATALOGO)).toEqual(BASE)
  })

  it('marks the changed groups, the moved people and the segments with pending changes', () => {
    const b = agregar(BORRADOR_VACIO, mover(['m1'], 'g-escalona'))
    const marcas = marcasBorrador(b.cambios, BASE)

    expect([...marcas.grupos].sort()).toEqual(['g-escalona', 'g-rosas'])
    expect([...marcas.personas]).toEqual(['m1'])
    expect(Object.fromEntries(marcas.segmentos)).toEqual({ 'seg-mat': 1, 'seg-muj': 1 })
  })
})

describe('adding changes', () => {
  it('coalesces moves of the same people: A→G1 then G1→G2 is A→G2', () => {
    const b = agregar(BORRADOR_VACIO, mover(['ana'], 'g-escalona'), mover(['juan'], 'g-rosas'), mover(['ana'], 'g-rosas', 'aprendiz'))

    expect(aPayload(b.cambios)).toEqual([mover(['juan'], 'g-rosas'), mover(['ana'], 'g-rosas', 'aprendiz')])
    expect(descripciones(b)[1]).toBe('Mover a Ana Gil a Grupo Rosas como aprendiz')
  })

  it('drops the change when the people go back to where they were', () => {
    const b = agregar(BORRADOR_VACIO, mover(['m1'], 'g-escalona'), mover(['m1'], 'g-rosas'))

    expect(b.cambios).toEqual([])
  })

  it('ignores a move or an edit that changes nothing', () => {
    expect(agregar(BORRADOR_VACIO, mover(['m1'], 'g-rosas')).cambios).toEqual([])
    expect(agregar(BORRADOR_VACIO, { tipo: 'editar', grupo: 'g-rosas', cambios: { nombre: ' Grupo  Rosas ' } }).cambios).toEqual([])
  })

  it('keeps one edit per group and field, and drops it when the field is back to its value', () => {
    const b = agregar(BORRADOR_VACIO, { tipo: 'editar', grupo: 'g-rosas', cambios: { nombre: 'Rosas 1' } }, { tipo: 'editar', grupo: 'g-rosas', cambios: { nombre: 'Rosas 2' } })
    expect(aPayload(b.cambios)).toEqual([{ tipo: 'editar', grupo: 'g-rosas', cambios: { nombre: 'Rosas 2' } }])
    expect(descripciones(b)).toEqual(['Cambiar nombre de Grupo Rosas a Rosas 2'])

    expect(agregar(b, { tipo: 'editar', grupo: 'g-rosas', cambios: { nombre: 'Grupo Rosas' } }).cambios).toEqual([])
  })

  it('folds an edit of a new group into its "crear"', () => {
    const inicio = BORRADOR_VACIO
    const clave = nuevaClave(inicio)
    const b = agregar(inicio, crear(inicio), { tipo: 'editar', grupo: clave, cambios: { nombre: 'Cabudare Matrimonios 11' } })

    expect(aPayload(b.cambios)).toEqual([{ tipo: 'crear', clave, datos: { ...DATOS_NUEVO, nombre: 'Cabudare Matrimonios 11' } }])
    expect(descripciones(b)).toEqual(['Crear grupo Cabudare Matrimonios 11'])
  })

  it('deleting a new group removes its "crear"; people moved into it go back to the bank', () => {
    const inicio = BORRADOR_VACIO
    const clave = nuevaClave(inicio)
    const b = agregar(inicio, crear(inicio), mover(['ana'], clave), mover(['m1'], clave), { tipo: 'eliminar', grupo: clave })

    expect(aPayload(b.cambios)).toEqual([mover(['m1'], null)])
  })

  it('gives every change its own id and every new group its own key', () => {
    const uno = agregar(BORRADOR_VACIO, crear(BORRADOR_VACIO))
    const dos = agregar(uno, crear(uno, { ...DATOS_NUEVO, nombre: 'Otro' }))

    expect(new Set(dos.cambios.map((c) => c.id)).size).toBe(2)
    expect(new Set(aPayload(dos.cambios).map((c) => (c.tipo === 'crear' ? c.clave : '')))).toEqual(new Set([nuevaClave(BORRADOR_VACIO), nuevaClave(uno)]))
  })
})

describe('removing changes', () => {
  it('removes the last change (local undo)', () => {
    const b = agregar(BORRADOR_VACIO, mover(['ana'], 'g-rosas'), mover(['juan'], 'g-rosas'))

    expect(descripciones(quitarUltimo(b))).toEqual(['Mover a Ana Gil a Grupo Rosas como miembro'])
    expect(quitarUltimo(BORRADOR_VACIO)).toBe(BORRADOR_VACIO)
  })

  it('refuses to remove a "crear" while later changes use the new group, with the reason', () => {
    const inicio = BORRADOR_VACIO
    const clave = nuevaClave(inicio)
    const b = agregar(inicio, crear(inicio), mover(['ana'], clave))

    expect(motivoNoQuitar(b.cambios, 0)).toBe('Primero quita «Mover a Ana Gil a Cabudare Matrimonios 10 como miembro»: usa este grupo nuevo.')
    expect(quitarCambio(b, 0, BASE, CATALOGO)).toBeNull()
    expect(motivoNoQuitar(b.cambios, 1)).toBeNull()
  })

  it('refuses to remove a move when the same people move again later', () => {
    const b = agregar(BORRADOR_VACIO, mover(['juan', 'erica'], 'g-escalona'), mover(['erica'], 'g-rosas'))

    expect(motivoNoQuitar(b.cambios, 0)).toBe('Primero quita «Mover a Érica Castejón a Grupo Rosas como miembro»: vuelve a mover a estas personas.')
  })

  it('removes a change nothing depends on, keeping the rest in order', () => {
    const b = agregar(BORRADOR_VACIO, mover(['ana'], 'g-rosas'), { tipo: 'editar', grupo: 'g-rosas', cambios: { dia_reunion: 'Martes' } }, mover(['juan'], 'g-escalona'))
    const r = quitarCambio(b, 1, BASE, CATALOGO)

    expect(r && aPayload(r.cambios)).toEqual([mover(['ana'], 'g-rosas'), mover(['juan'], 'g-escalona')])
  })
})

describe('the RPC payload', () => {
  it('lists the changes in order in the planner_guardar_cambios shape, new groups by their tmp key', () => {
    const inicio = BORRADOR_VACIO
    const clave = nuevaClave(inicio)
    const b = agregar(inicio, crear(inicio), mover(['juan', 'erica'], clave, 'lider'), { tipo: 'editar', grupo: 'g-escalona', cambios: { localidad_id: 'loc-cab' } }, mover(['m1'], null), { tipo: 'eliminar', grupo: 'g-rosas' })

    expect(aPayload(b.cambios)).toEqual([
      { tipo: 'crear', clave, datos: DATOS_NUEVO },
      { tipo: 'mover', usuarios: ['juan', 'erica'], grupo: clave, rol: 'lider' },
      { tipo: 'editar', grupo: 'g-escalona', cambios: { localidad_id: 'loc-cab' } },
      { tipo: 'mover', usuarios: ['m1'], grupo: null, rol: null },
      { tipo: 'eliminar', grupo: 'g-rosas' },
    ])
  })
})

describe('a stale draft', () => {
  it('drops changes on groups that no longer exist or that already happened', () => {
    const b = agregar(BORRADOR_VACIO, mover(['ana'], 'g-rosas'), { tipo: 'editar', grupo: 'g-escalona', cambios: { dia_reunion: 'Martes' } })
    const otraBase = { grupos: [ROSAS], banco: BASE.banco.map((p) => (p.usuario_id === 'ana' ? { ...p, grupo_actual_id: 'g-rosas' } : p)) }
    const conAna = { ...otraBase, grupos: [{ ...ROSAS, miembros: [...ROSAS.miembros, enGrupo('ana')] }] }

    expect(normalizarBorrador(b, conAna, CATALOGO).cambios).toEqual([])
    expect(normalizarBorrador(b, BASE, CATALOGO)).toBe(b)
  })
})

describe('blockers through the draft', () => {
  const SERVIDOR: Bloqueo[] = [
    { tipo: 'sin_localidad', segmento_id: 'seg-mat', grupo_id: 'g-escalona', grupo_nombre: ESCALONA.nombre, usuario_id: null, detalle: 'No tiene localidad' },
    { tipo: 'sin_director', segmento_id: 'seg-muj', grupo_id: 'g-rosas', grupo_nombre: ROSAS.nombre, usuario_id: null, detalle: 'No tiene director de etapa de Mujeres +36' },
    { tipo: 'persona_en_dos_grupos', segmento_id: 'seg-mat', grupo_id: 'g-escalona', grupo_nombre: ESCALONA.nombre, usuario_id: 'm1', detalle: 'm1 Pérez también está en Grupo Rosas' },
    { tipo: 'persona_en_dos_grupos', segmento_id: 'seg-muj', grupo_id: 'g-rosas', grupo_nombre: ROSAS.nombre, usuario_id: 'm1', detalle: 'm1 Pérez también está en Grupo #14 Los Escalona' },
  ]

  it('keeps the server blockers without changes', () => {
    expect(bloqueosConBorrador(SERVIDOR, BASE, [])).toBe(SERVIDOR)
  })

  it('recomputes them from the board with the draft applied', () => {
    const b = agregar(BORRADOR_VACIO, { tipo: 'editar', grupo: 'g-escalona', cambios: { localidad_id: 'loc-cab' } }, mover(['m1'], 'g-escalona'), mover(['l2'], null))
    const estado = aplicarBorrador(BASE, b.cambios, CATALOGO)

    expect(bloqueosConBorrador(SERVIDOR, estado, b.cambios)).toEqual([
      { tipo: 'sin_lider', segmento_id: 'seg-muj', grupo_id: 'g-rosas', grupo_nombre: 'Grupo Rosas', usuario_id: null, detalle: 'No tiene líder' },
      { tipo: 'sin_director', segmento_id: 'seg-muj', grupo_id: 'g-rosas', grupo_nombre: 'Grupo Rosas', usuario_id: null, detalle: 'No tiene director de etapa de Mujeres +36' },
    ])
  })
})

describe('localStorage text', () => {
  const DUENO = { usuarioId: 'u-dg', temporadaId: 't-2026-ii' }
  const b = agregar(BORRADOR_VACIO, crear(BORRADOR_VACIO), mover(['ana'], 'g-rosas'))

  it('is keyed by user and season', () => {
    expect(claveBorrador('u-dg', 't-2026-ii')).toBe('planner-gdv:borrador:u-dg:t-2026-ii')
  })

  it('round-trips with its version', () => {
    const texto = serializarBorrador(b, DUENO)

    expect(JSON.parse(texto)).toMatchObject({ version: VERSION_BORRADOR, usuarioId: 'u-dg', temporadaId: 't-2026-ii' })
    expect(leerBorrador(texto, DUENO)).toEqual(b)
  })

  it('is discarded on another version, season, user or shape', () => {
    const texto = JSON.parse(serializarBorrador(b, DUENO))

    expect(leerBorrador(JSON.stringify({ ...texto, version: VERSION_BORRADOR + 1 }), DUENO)).toBe(BORRADOR_VACIO)
    expect(leerBorrador(serializarBorrador(b, { ...DUENO, temporadaId: 't-otra' }), DUENO)).toBe(BORRADOR_VACIO)
    expect(leerBorrador(serializarBorrador(b, { ...DUENO, usuarioId: 'u-otro' }), DUENO)).toBe(BORRADOR_VACIO)
    expect(leerBorrador(JSON.stringify({ ...texto, cambios: [{ id: 'c1', descripcion: 'x', segmentos: [], cambio: { tipo: 'mover', usuarios: 'ana' } }] }), DUENO)).toBe(BORRADOR_VACIO)
    expect(leerBorrador('{no es json', DUENO)).toBe(BORRADOR_VACIO)
    expect(leerBorrador(null, DUENO)).toBe(BORRADOR_VACIO)
  })
})
