/**
 * Org chart responsables (S1, S2 of odd/tasks/dream-team-estructura-correcciones.md):
 * the short name is first nombre + first apellido, carried as separate parts
 * from the page; every person of the winning rank (coordinador, else
 * director, else the rank of whoever is listed first) is a responsable; the
 * card line reads «Isaac Paez», «Isaac Paez y Kelly Chaviel» or
 * «Isaac Paez y 2 más»; inheritance keeps working.
 */
import { construirArbol } from '@/lib/platform/dream-team/arbol'
import {
  responsablesDreamTeamPorEquipo,
  type NodoEquipoArbol,
  type ResponsableNodo,
} from '@/lib/platform/dream-team/estructura-arbol'
import { crearOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'
import { crearVistaEstructura, textoResponsables } from '@/lib/platform/dream-team/estructura-vista'
import { personaId, type DreamTeamRol, type DreamTeamServicio } from '@/lib/platform/dream-team/types'

const ISAAC: ResponsableNodo = {
  personaId: personaId('p-isaac'),
  nombre: 'Isaac José Paez Cordero',
  rol: 'director',
  partes: { nombre: 'Isaac José', apellido: 'Paez Cordero' },
}
const KELLY: ResponsableNodo = {
  personaId: personaId('p-kelly'),
  nombre: 'Kelly Chaviel',
  rol: 'director',
  partes: { nombre: 'Kelly', apellido: 'Chaviel' },
}
const LUIS: ResponsableNodo = {
  personaId: personaId('p-luis'),
  nombre: 'Luis Rojas',
  rol: 'director',
  partes: { nombre: 'Luis', apellido: 'Rojas' },
}
const CARLA: ResponsableNodo = {
  personaId: personaId('p-carla'),
  nombre: 'Carla María Ríos',
  rol: 'coordinador',
  partes: { nombre: 'Carla María', apellido: 'Ríos' },
}

function equipo(id: string, label: string, parentEquipoId: string | undefined, responsables: ResponsableNodo[]): NodoEquipoArbol {
  return { origen: 'dream_team', id, label, parentEquipoId, activo: true, experiencia: 'dps', responsables }
}

const arbol = construirArbol([
  equipo('dps', 'DPS', undefined, [ISAAC, KELLY]),
  equipo('video', 'Video', 'dps', []),
  equipo('audio', 'Audio', 'dps', [ISAAC, KELLY, LUIS]),
  equipo('luces', 'Luces', 'dps', [KELLY, LUIS, CARLA]),
  equipo('solo', 'Solo', undefined, [ISAAC]),
])
const entrada = { arbol, rolesPorEquipo: {}, uso: { propias: {}, porRol: {} }, talleres: {} }
const vista = () => crearVistaEstructura(entrada)

describe('textoResponsables', () => {
  it('names one or two people and summarizes three or more', () => {
    expect(textoResponsables(['Isaac Paez'])).toBe('Isaac Paez')
    expect(textoResponsables(['Isaac Paez', 'Kelly Chaviel'])).toBe('Isaac Paez y Kelly Chaviel')
    expect(textoResponsables(['Isaac Paez', 'Kelly Chaviel', 'Luis Rojas'])).toBe('Isaac Paez y 2 más')
  })
})

describe('the responsables of a team', () => {
  it('uses first name and first surname, from the separate parts', () => {
    expect(vista().detalle('solo')?.responsable).toEqual({
      personas: [{ nombre: 'Isaac José Paez Cordero', nombreCorto: 'Isaac Paez', rol: 'Director' }],
      rol: 'Director',
      texto: 'Isaac Paez',
    })
  })

  it('lists both directors of a team', () => {
    const responsable = vista().detalle('dps')?.responsable
    expect(responsable?.personas.map((persona) => persona.nombreCorto)).toEqual(['Isaac Paez', 'Kelly Chaviel'])
    expect(responsable?.texto).toBe('Isaac Paez y Kelly Chaviel')
  })

  it('summarizes three or more', () => {
    const responsable = vista().detalle('audio')?.responsable
    expect(responsable?.personas).toHaveLength(3)
    expect(responsable?.texto).toBe('Isaac Paez y 2 más')
  })

  it('keeps the rank rule: the coordinador wins over the directors', () => {
    expect(vista().detalle('luces')?.responsable).toEqual({
      personas: [{ nombre: 'Carla María Ríos', nombreCorto: 'Carla Ríos', rol: 'Coordinador' }],
      rol: 'Coordinador',
      texto: 'Carla Ríos',
    })
  })

  it('inherits every responsable of the nearest ancestor, marked as inherited', () => {
    const responsable = vista().detalle('video')?.responsable
    expect(responsable?.texto).toBe('Isaac Paez y Kelly Chaviel')
    expect(responsable?.heredadoDe).toEqual({ id: 'dps', label: 'DPS' })
    expect(vista().detalle('dps')?.hijos.find((hijo) => hijo.id === 'video')?.responsable?.texto).toBe('Isaac Paez y Kelly Chaviel')
  })

  it('takes every leader of the first listed rank on a node without director or coordinador', () => {
    const gdv = construirArbol<NodoEquipoArbol>([
      {
        origen: 'grupos_vida',
        tipo: 'grupo',
        id: 'grupo',
        label: 'Grupo Alfa',
        activo: true,
        responsables: [
          { personaId: personaId('p-1'), nombre: 'Lidia Ana Líder Paz', rol: 'lider' },
          { personaId: personaId('p-2'), nombre: 'Juan Líder', rol: 'lider' },
          { personaId: personaId('p-3'), nombre: 'Coli Der', rol: 'colider' },
        ],
      },
    ])
    const responsable = crearVistaEstructura({ ...entrada, arbol: gdv }).detalle('grupo')?.responsable
    expect(responsable?.texto).toBe('Lidia Líder y Juan Líder')
    expect(responsable?.rol).toBe('Líder')
  })
})

describe('the org chart box', () => {
  it('carries the card line and the first responsable, initials from the short name, for the avatar', () => {
    const organigrama = crearOrganigrama(entrada)
    expect(organigrama.nodo('dps')?.responsable).toEqual({
      nombre: 'Isaac José Paez Cordero',
      iniciales: 'IP',
      rol: 'Director',
      texto: 'Isaac Paez y Kelly Chaviel',
    })
    expect(organigrama.nodo('audio')?.responsable?.texto).toBe('Isaac Paez y 2 más')
  })
})

describe('responsablesDreamTeamPorEquipo', () => {
  const roles: DreamTeamRol[] = [{ id: 'rol-dir', equipoId: 'dps', label: 'director', nivel: 'director', activo: true } as DreamTeamRol]
  const servicio = (id: string, persona: string): DreamTeamServicio => ({
    id,
    personaId: personaId(persona),
    equipoId: 'dps',
    rolId: 'rol-dir',
    estado: 'activo',
    fechaInicio: '2026-01-01T00:00:00.000Z',
    motivoActual: 'admin_asignacion',
    version: 1,
  })

  it('carries nombre and apellido apart when the page gives them', () => {
    const resultado = responsablesDreamTeamPorEquipo(
      [servicio('s-1', 'p-isaac')],
      roles,
      new Map([[personaId('p-isaac'), 'Isaac José Paez Cordero']]),
      new Map([[personaId('p-isaac'), { nombre: 'Isaac José', apellido: 'Paez Cordero' }]]),
    )
    expect(resultado.get('dps')).toEqual([
      {
        personaId: personaId('p-isaac'),
        nombre: 'Isaac José Paez Cordero',
        rol: 'director',
        partes: { nombre: 'Isaac José', apellido: 'Paez Cordero' },
      },
    ])
  })

  it('leaves the parts out when the page does not give them, as before', () => {
    const resultado = responsablesDreamTeamPorEquipo([servicio('s-1', 'p-isaac')], roles, new Map([[personaId('p-isaac'), 'Isaac Paez']]))
    expect(resultado.get('dps')).toEqual([{ personaId: personaId('p-isaac'), nombre: 'Isaac Paez', rol: 'director' }])
  })
})
