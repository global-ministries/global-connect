/**
 * Mi equipo lists a person once (S12): someone serving in several nodes of
 * the viewed subtree is one row with all their servicios stacked, as
 * Servidores does since #599. Filters stay per servicio, the order is the
 * person's best rol then name, and the cards and header count people while
 * the etapa pills keep counting servicios (as Servidores).
 */
import {
  agruparPorPersona,
  contarPersonas,
  contadoresPorEstado,
  filtrarPersonas,
  listarDirecciones,
  personasDeSeleccion,
  vistaDeDireccion,
  type PersonaEntrada,
  type PersonasPorEquipo,
} from '@/lib/platform/dream-team/mi-equipo-vista'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { personaId, type DreamTeamEstado } from '@/lib/platform/dream-team/types'

function nodo(id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> {
  return {
    equipo: { origen: 'dream_team', id, label, experiencia: 'talleres_crecimiento', activo: true, responsables: [] },
    hijos,
    nivel,
  }
}

const arbol: readonly NodoArbol<NodoEquipoArbol>[] = [
  nodo('dir', 'Estudiantes', [nodo('coro', 'Coro', [], 1), nodo('banda', 'Banda', [], 1), nodo('sonido', 'Sonido', [], 1)]),
]

function servicio(
  quien: string,
  nombre: string,
  equipo: string,
  rolClave: string,
  estado: DreamTeamEstado = 'activo',
  extra: Partial<PersonaEntrada> = {},
): PersonaEntrada {
  return {
    clave: `${quien}-${equipo}`,
    personaId: personaId(`persona-${quien}`),
    nombre,
    rolClave,
    rolLabel: rolClave,
    estado,
    origen: 'dream_team',
    servicioId: `servicio-${quien}-${equipo}`,
    version: 1,
    ...extra,
  }
}

const personas: PersonasPorEquipo = {
  coro: [
    servicio('gabriel', 'Gabriel Salas', 'coro', 'voluntario', 'en_pausa', { telefono: null, tieneCuenta: null }),
    servicio('ana', 'Ana Ruiz', 'coro', 'voluntario'),
  ],
  banda: [
    servicio('gabriel', 'Gabriel Salas', 'banda', 'coordinador', 'activo', { telefono: '04125457346', tieneCuenta: false }),
    servicio('bea', 'Bea Mora', 'banda', 'coordinador', 'en_orientacion'),
  ],
  sonido: [servicio('ana', 'Ana Ruiz', 'sonido', 'voluntario', 'en_orientacion')],
}

function vista() {
  const resultado = vistaDeDireccion(arbol, personas, 'dir')
  if (!resultado) throw new Error('the direccion must resolve')
  return resultado
}

describe('agruparPorPersona', () => {
  it('lists a person serving in two nodes once, with both servicios stacked', () => {
    const grupos = agruparPorPersona(vista().personas)

    expect(grupos.filter((grupo) => grupo.nombre === 'Gabriel Salas')).toHaveLength(1)
    const gabriel = grupos.find((grupo) => grupo.nombre === 'Gabriel Salas')
    expect(gabriel?.personaId).toBe(personaId('persona-gabriel'))
    expect(gabriel?.servicios.map((s) => s.equipoLabel)).toEqual(['Banda', 'Coro'])
    expect(gabriel?.servicios.map((s) => s.servicioId)).toEqual(['servicio-gabriel-banda', 'servicio-gabriel-coro'])
  })

  it('orders people by their best rol, then by name', () => {
    expect(agruparPorPersona(vista().personas).map((grupo) => grupo.nombre)).toEqual(['Bea Mora', 'Gabriel Salas', 'Ana Ruiz'])
  })

  it('takes the phone and the account state from the first servicio that knows them', () => {
    const gabriel = agruparPorPersona(vista().personas).find((grupo) => grupo.nombre === 'Gabriel Salas')
    expect(gabriel?.telefono).toBe('04125457346')
    expect(gabriel?.tieneCuenta).toBe(false)
    expect(gabriel?.iniciales).toBe('GS')
  })

  it('applies the filters per servicio: a person keeps only the servicios that match', () => {
    const enPausa = agruparPorPersona(filtrarPersonas(vista().personas, { estado: 'en_pausa' }))
    expect(enPausa.map((grupo) => [grupo.nombre, grupo.servicios.map((s) => s.equipoLabel)])).toEqual([['Gabriel Salas', ['Coro']]])

    const porActivar = agruparPorPersona(filtrarPersonas(vista().personas, { estado: 'por_activar' }))
    expect(porActivar.map((grupo) => [grupo.nombre, grupo.servicios.map((s) => s.equipoLabel)])).toEqual([
      ['Bea Mora', ['Banda']],
      ['Ana Ruiz', ['Sonido']],
    ])
  })

  it('keeps grouping by card: a node card shows only the servicios of its branch', () => {
    const coro = agruparPorPersona(personasDeSeleccion(vista().personas, 'coro'))
    // Both are voluntarios in Coro: Gabriel's coordinador servicio (Banda) is out of the card, so name decides.
    expect(coro.map((grupo) => [grupo.nombre, grupo.servicios.map((s) => s.equipoLabel)])).toEqual([
      ['Ana Ruiz', ['Coro']],
      ['Gabriel Salas', ['Coro']],
    ])
  })

  it('groups a Grupos de Vida leader with the same person, and marks a leader who only serves there', () => {
    const gdv = (quien: string, nombre: string): PersonaEntrada => ({
      clave: `gdv:persona-${quien}:coro`,
      personaId: personaId(`persona-${quien}`),
      nombre,
      rolClave: 'lider',
      rolLabel: 'Líder',
      estado: 'activo',
      origen: 'grupos_vida',
    })
    const conGdv: PersonasPorEquipo = { ...personas, sonido: [...personas.sonido, gdv('gabriel', 'Gabriel Salas'), gdv('lia', 'Lía Paz')] }
    const resultado = vistaDeDireccion(arbol, conGdv, 'dir')
    const grupos = agruparPorPersona(resultado?.personas ?? [])

    const gabriel = grupos.find((grupo) => grupo.nombre === 'Gabriel Salas')
    expect(gabriel?.servicios.map((s) => s.origen)).toEqual(['dream_team', 'grupos_vida', 'dream_team'])
    expect(gabriel?.soloGruposVida).toBe(false)
    expect(grupos.find((grupo) => grupo.nombre === 'Lía Paz')?.soloGruposVida).toBe(true)
    expect(grupos.filter((grupo) => grupo.nombre === 'Gabriel Salas')).toHaveLength(1)
  })

  it('keeps a lone servicio as a one-servicio person', () => {
    const grupos = agruparPorPersona(vista().personas)
    expect(grupos.find((grupo) => grupo.nombre === 'Bea Mora')?.servicios).toHaveLength(1)
  })
})

describe('counts (people, as the Servidores KPI cards)', () => {
  it('counts distinct people in the header, the cards and "por activar"', () => {
    const v = vista()
    expect(v.total).toBe(3)
    expect(v.todaLaDireccion.total).toBe(3)
    expect(v.todaLaDireccion.porActivar).toBe(2)
    expect(listarDirecciones(arbol, personas)).toEqual([{ id: 'dir', label: 'Estudiantes', total: 3 }])
  })

  it('counts a person once in the card of an área that holds two of their servicios', () => {
    const arbolConArea: readonly NodoArbol<NodoEquipoArbol>[] = [
      nodo('dir', 'Estudiantes', [
        nodo('musica', 'Música', [nodo('coro', 'Coro', [], 2), nodo('banda', 'Banda', [], 2)], 1),
        nodo('sonido', 'Sonido', [], 1),
      ]),
    ]
    const v = vistaDeDireccion(arbolConArea, personas, 'dir')
    expect(v?.equipos.map((e) => [e.label, e.total, e.porActivar])).toEqual([
      ['Música', 3, 1],
      ['Sonido', 1, 1],
    ])
  })

  it('keeps the etapa pills counting servicios, as Servidores', () => {
    const contadores = contadoresPorEstado(vista().personas)
    expect(contadores.todos).toBe(5)
    expect(contadores.activo).toBe(2)
    expect(contadores.en_pausa).toBe(1)
  })

  it('contarPersonas counts distinct people of a servicio list', () => {
    expect(contarPersonas(vista().personas)).toBe(3)
    expect(contarPersonas([])).toBe(0)
  })
})
