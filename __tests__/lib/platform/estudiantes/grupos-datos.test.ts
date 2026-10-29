/**
 * From the rows of the Estudiantes RPCs (estudiantes_subareas_gestionables,
 * estudiantes_mis_grupos, estudiantes_grupo_integrantes,
 * estudiantes_escala_campus) to the serializable shapes of the screen.
 */
import { aEscala, aGrupo, aSubareas, type FilaMisGrupos, type FilaSubarea } from '@/lib/platform/estudiantes/grupos-datos'

const filaGrupo: FilaMisGrupos = {
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
  zona: null as unknown as string,
  dia_semana: null as unknown as number,
  hora: null as unknown as string,
  activo: true,
  soy_lider: false,
  puede_ver_vivo: true,
  puede_gestionar: true,
  miembros: 2,
  visitantes: 1,
  lideres: [{ servicio_id: 'sv1', persona_id: 'p1', nombre: 'Andrea', apellido: 'Molina', rol: 'Líder' }],
}

describe('aGrupo', () => {
  it('maps the group, its leaders and its members with their representantes', () => {
    const g = aGrupo(filaGrupo, {
      grupo: { id: 'g2' },
      puede_gestionar: true,
      personas: [
        {
          persona_id: 'p9',
          nombre: 'Camila',
          apellido: 'Herrera',
          genero: 'femenino',
          telefono: '04145550101',
          fecha_nacimiento: '2013-04-02',
          estado: 'miembro',
          desde: '2026-01-11',
          anio: 2,
          anio_etiqueta: '2do año',
          visitas: 5,
          sugerir_confirmar: false,
          representantes: [{ persona_id: 'r1', nombre: 'Mónica', apellido: 'Herrera', telefono: '04245550150', tipo: 'padre' }],
        },
        { persona_id: 'p10', nombre: 'Sofía', apellido: null, estado: 'visitante', visitas: 3, sugerir_confirmar: true },
      ],
    })
    expect(g).toEqual({
      id: 'g2',
      nombre: '2do año · Chicas',
      campusId: 'c1',
      ambitoId: 'a1',
      ambito: 'Transit',
      experiencia: 'estudiantes',
      subareaId: 's1',
      subarea: 'Grupos de Chicas',
      anio: 2,
      anioEtiqueta: '2do año',
      zona: null,
      diaSemana: null,
      hora: null,
      activo: true,
      lideres: [{ servicioId: 'sv1', personaId: 'p1', nombre: 'Andrea Molina', rol: 'Líder' }],
      integrantes: [
        {
          personaId: 'p9',
          nombre: 'Camila Herrera',
          telefono: '04145550101',
          fechaNacimiento: '2013-04-02',
          estado: 'miembro',
          desde: '2026-01-11',
          anioEtiqueta: '2do año',
          visitas: 5,
          sugerirConfirmar: false,
          representantes: [{ personaId: 'r1', nombre: 'Mónica Herrera', telefono: '04245550150', tipo: 'padre' }],
        },
        {
          personaId: 'p10',
          nombre: 'Sofía',
          telefono: null,
          fechaNacimiento: null,
          estado: 'visitante',
          desde: null,
          anioEtiqueta: null,
          visitas: 3,
          sugerirConfirmar: true,
          representantes: [],
        },
      ],
    })
  })

  it('keeps a group without readable members (empty list, never a crash)', () => {
    expect(aGrupo({ ...filaGrupo, lideres: null as unknown as FilaMisGrupos['lideres'] }, null)).toMatchObject({
      lideres: [],
      integrantes: [],
    })
  })
})

describe('aSubareas', () => {
  it('maps the sub-áreas with their entrenadores and directores de grupo', () => {
    const filas: FilaSubarea[] = [
      {
        subarea_id: 's1',
        subarea: 'Grupos de Chicas',
        ambito_id: 'a1',
        ambito: 'Transit',
        experiencia: 'estudiantes',
        campus_id: 'c1',
        campus: 'Barquisimeto',
        responsables: [{ servicio_id: 'sv7', persona_id: 'p7', nombre: 'Lorena', apellido: 'Salas', rol: 'Director de grupo' }],
      },
    ]
    expect(aSubareas(filas)).toEqual([
      {
        subareaId: 's1',
        subarea: 'Grupos de Chicas',
        ambitoId: 'a1',
        ambito: 'Transit',
        experiencia: 'estudiantes',
        campusId: 'c1',
        campus: 'Barquisimeto',
        responsables: [{ servicioId: 'sv7', personaId: 'p7', nombre: 'Lorena Salas', rol: 'Director de grupo' }],
      },
    ])
  })
})

describe('aEscala', () => {
  it('maps the school scale of a campus', () => {
    expect(aEscala([{ numero: 1, etiqueta: '1er año', ambito_id: 'a1', ambito: 'Transit' }])).toEqual([
      { numero: 1, etiqueta: '1er año', ambitoId: 'a1' },
    ])
  })
})
