/**
 * The leader list data (C3b): the rows and jsonb of estudiantes_grupo_lista,
 * estudiantes_grupo_sesiones, estudiantes_grupo_historial and
 * estudiantes_mis_grupos, read defensively into plain shapes. Every person is
 * fictitious.
 */
import type { Json } from '@/lib/supabase/database.types'
import { aGruposMios, aHistorial, aListaGrupo, aSesiones, type FilaSesion } from '@/lib/platform/estudiantes/lista-datos'
import type { FilaMisGrupos } from '@/lib/platform/estudiantes/grupos-datos'

const LISTA: Json = {
  grupo: {
    id: 'g2',
    nombre: '2do año · Chicas',
    campus_id: 'c1',
    ambito_id: 'a1',
    ambito: 'Transit',
    experiencia: 'estudiantes',
    subarea_id: 's1',
    subarea: 'Grupos de Chicas',
    anio: 2,
    anio_etiqueta: '2do año',
    zona: null,
    dia_semana: null,
    hora: null,
  },
  fecha: '2026-10-25',
  turno_id: 't9',
  reunion_id: 'r1',
  lugar: null,
  puede_ver_vivo: false,
  puede_gestionar: false,
  personas: [
    {
      persona_id: 'p1',
      nombre: 'Camila',
      apellido: 'Herrera',
      genero: 'Femenino',
      telefono: '0424 555 0187',
      fecha_nacimiento: '2012-07-02',
      estado: 'miembro',
      desde: '2025-09-14',
      anio: 2,
      anio_etiqueta: '2do año',
      marca: 'presente',
      marcado_at: '2026-10-25T13:12:00+00:00',
      visitas: 8,
      sugerir_confirmar: false,
      representantes: [{ persona_id: 'r9', nombre: 'Luis', apellido: 'Herrera', telefono: '0424 555 0111', tipo: 'padre' }],
    },
    { persona_id: 'v1', nombre: 'Sofía', apellido: 'Linares', estado: 'visitante', marca: 'otra', visitas: 3, sugerir_confirmar: true },
    'basura',
  ],
}

describe('aListaGrupo', () => {
  it('reads the group, the meeting and every person', () => {
    const lista = aListaGrupo(LISTA)
    expect(lista?.grupo).toMatchObject({ id: 'g2', nombre: '2do año · Chicas', experiencia: 'estudiantes', anio: 2, diaSemana: null })
    expect(lista).toMatchObject({ fecha: '2026-10-25', turnoId: 't9', reunionId: 'r1', lugar: null, puedeVerVivo: false, puedeGestionar: false })
    expect(lista?.personas).toHaveLength(2)
    expect(lista?.personas[0]).toEqual({
      personaId: 'p1',
      nombre: 'Camila Herrera',
      genero: 'Femenino',
      telefono: '0424 555 0187',
      fechaNacimiento: '2012-07-02',
      estado: 'miembro',
      desde: '2025-09-14',
      anio: 2,
      anioEtiqueta: '2do año',
      marca: 'presente',
      marcadoAt: '2026-10-25T13:12:00+00:00',
      visitas: 8,
      sugerirConfirmar: false,
      representantes: [{ personaId: 'r9', nombre: 'Luis Herrera', telefono: '0424 555 0111', tipo: 'padre' }],
    })
  })

  it('an unknown mark is no mark; a malformed payload is null', () => {
    expect(aListaGrupo(LISTA)?.personas[1]).toMatchObject({ estado: 'visitante', marca: null, sugerirConfirmar: true, representantes: [] })
    expect(aListaGrupo(null)).toBeNull()
    expect(aListaGrupo({ personas: [] })).toBeNull()
  })
})

describe('aSesiones', () => {
  it('keeps the rows, nulls stay null', () => {
    const filas = [
      { fecha: '2026-10-25', turno_id: 't9', turno: 'Domingo 9:00', hora: '09:00:00', reunion_id: 'r1', lugar: null, presentes: 10, ausentes: 1, visitantes: 2, marcados: 11 },
      { fecha: '2026-10-29', turno_id: null, turno: null, hora: null, reunion_id: null, lugar: 'Casa de Adrián', presentes: null, ausentes: 0, visitantes: 0, marcados: 0 },
    ] as unknown as FilaSesion[]
    expect(aSesiones(filas)).toEqual([
      { fecha: '2026-10-25', turnoId: 't9', turno: 'Domingo 9:00', hora: '09:00:00', reunionId: 'r1', lugar: null, presentes: 10, ausentes: 1, visitantes: 2, marcados: 11 },
      { fecha: '2026-10-29', turnoId: null, turno: null, hora: null, reunionId: null, lugar: 'Casa de Adrián', presentes: 0, ausentes: 0, visitantes: 0, marcados: 0 },
    ])
  })
})

describe('aHistorial', () => {
  it('maps every member to their marks, oldest first', () => {
    const historial = aHistorial({
      reuniones: [
        { reunion_id: 'r1', fecha: '2026-10-18', turno_id: 't9', turno: 'Domingo 9:00' },
        { reunion_id: 'r2', fecha: '2026-10-25', turno_id: 't9', turno: 'Domingo 9:00' },
      ],
      personas: [
        { persona_id: 'p1', estados: ['presente', null] },
        { persona_id: 'p2', estados: null },
      ],
    })
    expect(historial).toEqual({
      reuniones: [
        { reunionId: 'r1', fecha: '2026-10-18' },
        { reunionId: 'r2', fecha: '2026-10-25' },
      ],
      estados: { p1: ['presente', null], p2: [null, null] },
    })
  })

  it('an unreadable history is empty', () => {
    expect(aHistorial(null)).toEqual({ reuniones: [], estados: {} })
  })
})

describe('aGruposMios', () => {
  it('keeps what the entry page and the entrenador selector need', () => {
    const fila = {
      grupo_id: 'g2',
      nombre: '2do año · Chicas',
      campus_id: 'c1',
      ambito_id: 'a1',
      ambito: 'Transit',
      experiencia: 'estudiantes',
      subarea_id: 's1',
      subarea: 'Grupos de Chicas',
      anio: 2,
      anio_etiqueta: '2do año',
      zona: null,
      dia_semana: null,
      hora: null,
      activo: true,
      soy_lider: false,
      puede_ver_vivo: true,
      puede_gestionar: false,
      miembros: 12,
      visitantes: 3,
      lideres: [{ servicio_id: 'sv1', persona_id: 'pl', nombre: 'Andrea', apellido: 'Molina', rol: 'Líder' }],
    } as unknown as FilaMisGrupos
    expect(aGruposMios([fila])).toEqual([
      {
        grupoId: 'g2',
        nombre: '2do año · Chicas',
        campusId: 'c1',
        ambito: 'Transit',
        experiencia: 'estudiantes',
        subareaId: 's1',
        subarea: 'Grupos de Chicas',
        detalle: '2do año',
        soyLider: false,
        puedeVerVivo: true,
        puedeGestionar: false,
        miembros: 12,
        visitantes: 3,
        lideres: ['Andrea Molina'],
      },
    ])
  })
})
