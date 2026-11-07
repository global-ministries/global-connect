/**
 * The couples of a group (S23 of odd/tasks/planner-gdv.md): within one role
 * the two spouses are one row; a spouse in the same group but another role is
 * a hint; in a Matrimonios group a person whose spouse is not there is marked
 * (elsewhere, in the bank, or no spouse registered) and counted on the card.
 * Outside Matrimonios nobody is marked (S2).
 */
import { filasDelRol, insigniasGrupo, notaPareja, sinPareja } from '@/components/grupos-vida/planner/modelo'
import { enGrupo, grupo, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { GrupoTablero, PersonaBanco } from '@/lib/platform/grupos-vida/planner'

const quien = (usuario_id: string, nombre: string, apellido: string) => ({ ...enGrupo(usuario_id), nombre, apellido })

const CASTEJON: GrupoTablero = grupo({
  grupo_id: 'g-castejon',
  nombre: 'Grupo Castejón',
  lideres: [quien('juan', 'Juan', 'Castejón'), quien('erica', 'Érica', 'de Castejón')],
  aprendices: [quien('luis', 'Luis', 'Rivas')],
  miembros: [quien('pedro', 'Pedro', 'Gil'), quien('carla', 'Carla', 'Rivas'), quien('sofia', 'Sofía', 'Mora'), quien('raul', 'Raúl', 'Pérez')],
})

const MUJERES: GrupoTablero = grupo({
  grupo_id: 'g-mujeres',
  nombre: 'Mujeres Valientes',
  segmento_id: 'seg-muj',
  segmento_nombre: 'Mujeres +36',
  miembros: [quien('elena', 'Elena', 'Ruiz'), quien('raul', 'Raúl', 'Pérez')],
})

const en = (g: GrupoTablero) => ({ grupo_actual_id: g.grupo_id, grupo_actual_nombre: g.nombre })
const sinGrupo = { grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 }

const FICHAS = new Map<string, PersonaBanco>(
  [
    persona({ usuario_id: 'juan', nombre: 'Juan', apellido: 'Castejón', genero: 'Masculino', conyuge_id: 'erica', ...en(CASTEJON) }),
    persona({ usuario_id: 'erica', nombre: 'Érica', apellido: 'de Castejón', genero: 'Femenino', conyuge_id: 'juan', ...en(CASTEJON) }),
    persona({ usuario_id: 'luis', nombre: 'Luis', apellido: 'Rivas', genero: 'Masculino', conyuge_id: 'carla', ...en(CASTEJON) }),
    persona({ usuario_id: 'carla', nombre: 'Carla', apellido: 'Rivas', genero: 'Femenino', conyuge_id: 'luis', ...en(CASTEJON) }),
    persona({ usuario_id: 'pedro', nombre: 'Pedro', apellido: 'Gil', genero: 'Masculino', conyuge_id: 'ana', ...en(CASTEJON) }),
    persona({ usuario_id: 'ana', nombre: 'Ana', apellido: 'Gil', genero: 'Femenino', conyuge_id: 'pedro', ...sinGrupo }),
    persona({ usuario_id: 'sofia', nombre: 'Sofía', apellido: 'Mora', genero: 'Femenino', conyuge_id: 'tomas', ...en(CASTEJON) }),
    persona({ usuario_id: 'tomas', nombre: 'Tomás', apellido: 'Mora', genero: 'Masculino', conyuge_id: 'sofia', grupo_actual_id: 'g-rosas', grupo_actual_nombre: 'Grupo Rosas' }),
    persona({ usuario_id: 'raul', nombre: 'Raúl', apellido: 'Pérez', conyuge_id: null, ...en(CASTEJON) }),
    persona({ usuario_id: 'elena', nombre: 'Elena', apellido: 'Ruiz', genero: 'Femenino', conyuge_id: 'marco', ...en(MUJERES) }),
    persona({ usuario_id: 'marco', nombre: 'Marco', apellido: 'Ruiz', genero: 'Masculino', conyuge_id: 'elena', ...sinGrupo }),
  ].map((p) => [p.usuario_id, p]),
)

describe('filasDelRol (S23)', () => {
  it('makes the two spouses of one role a single row, in the place of the first one', () => {
    expect(filasDelRol(CASTEJON.lideres, FICHAS).map((f) => f.personas.map((p) => p.usuario_id))).toEqual([['juan', 'erica']])
    expect(filasDelRol(CASTEJON.miembros, FICHAS).map((f) => f.clave)).toEqual(['pedro', 'carla', 'sofia', 'raul'])
  })

  it('keeps everyone on their own row without bank rows', () => {
    expect(filasDelRol(CASTEJON.lideres, new Map()).map((f) => f.clave)).toEqual(['juan', 'erica'])
  })
})

describe('notaPareja (S23, S2)', () => {
  it('says nothing for a couple together in the same role', () => {
    expect(notaPareja('juan', CASTEJON, FICHAS)).toBeNull()
    expect(notaPareja('erica', CASTEJON, FICHAS)).toBeNull()
  })

  it('hints the spouse of another role of the same group, by the spouse gender', () => {
    expect(notaPareja('luis', CASTEJON, FICHAS)).toEqual({ texto: 'Esposa: Carla Rivas (Miembro)', falta: false })
    expect(notaPareja('carla', CASTEJON, FICHAS)).toEqual({ texto: 'Esposo: Luis Rivas (Aprendiz)', falta: false })
  })

  it('marks in Matrimonios the spouse in the bank, in another group, or not registered', () => {
    expect(notaPareja('pedro', CASTEJON, FICHAS)).toEqual({ texto: 'Su esposa está en el banco', falta: true })
    expect(notaPareja('sofia', CASTEJON, FICHAS)).toEqual({ texto: 'Su esposo está en Grupo Rosas', falta: true })
    expect(notaPareja('raul', CASTEJON, FICHAS)).toEqual({ texto: 'Sin cónyuge registrado', falta: true })
  })

  it('says "cónyuge" when no gender is known', () => {
    const fichas = new Map(FICHAS)
    fichas.set('ana', { ...FICHAS.get('ana')!, genero: null })
    fichas.set('pedro', { ...FICHAS.get('pedro')!, genero: null })

    expect(notaPareja('pedro', CASTEJON, fichas)).toEqual({ texto: 'Su cónyuge está en el banco', falta: true })
  })

  it('marks nobody outside Matrimonios', () => {
    expect(notaPareja('elena', MUJERES, FICHAS)).toBeNull()
    expect(notaPareja('raul', MUJERES, FICHAS)).toBeNull()
  })
})

describe('the "sin su pareja" count of a card (S23)', () => {
  it('counts the marked people of a Matrimonios group and badges them instead of "Listo"', () => {
    expect(sinPareja(CASTEJON, FICHAS)).toBe(3)
    expect(insigniasGrupo(CASTEJON, [], [], FICHAS)).toEqual([{ etiqueta: '3 sin su pareja', tono: 'warning' }])
  })

  it('has no badge outside Matrimonios, nor without bank rows', () => {
    expect(sinPareja(MUJERES, FICHAS)).toBe(0)
    expect(insigniasGrupo(MUJERES, [], [], FICHAS)).toEqual([{ etiqueta: 'Listo', tono: 'success' }])
    expect(insigniasGrupo(CASTEJON, [], [])).toEqual([{ etiqueta: 'Listo', tono: 'success' }])
  })

  it('says "1 sin su pareja" for one', () => {
    const solo = grupo({ lideres: [quien('pedro', 'Pedro', 'Gil')] })
    expect(insigniasGrupo(solo, [], [], FICHAS)).toEqual([{ etiqueta: '1 sin su pareja', tono: 'warning' }])
  })
})
