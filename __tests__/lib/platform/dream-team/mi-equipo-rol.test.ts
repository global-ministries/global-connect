/**
 * Mi equipo v2 — who may do what (S11 decision 10 of
 * odd/tasks/sistema-diseno-v2.md). The page maps the server's permission
 * flags to a role, and each servicio's actions combine the role with what the
 * server granted for that servicio (`fichaEditable`), so who sees what is the
 * same as with the old per-servicio menu (menu-persona.tsx).
 */
import { accionesPersonaMiEquipo, rolMiEquipo, textoTurnosMiEquipo } from '@/lib/platform/dream-team/mi-equipo-filtros'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { personaId } from '@/lib/platform/dream-team/types'

function servicio(over: Partial<PersonaVista> = {}): PersonaVista {
  return {
    clave: 's-1',
    servicioId: 's-1',
    version: 3,
    personaId: personaId('p-1'),
    nombre: 'Ana Ruiz',
    iniciales: 'AR',
    equipoId: 'eq-1',
    equipoLabel: 'Coro',
    rolClave: 'voluntario',
    rolLabel: 'Voluntario',
    rolOrden: 3,
    estado: 'activo',
    origen: 'dream_team',
    editable: true,
    telefono: null,
    tieneCuenta: false,
    fichaEditable: true,
    ...over,
  }
}

describe('rolMiEquipo', () => {
  it('the write capability is the director; registering without it is the coordinador; neither has no permissions', () => {
    expect(rolMiEquipo({ puedeEditar: true, puedeRegistrar: true })).toBe('director')
    expect(rolMiEquipo({ puedeEditar: true, puedeRegistrar: false })).toBe('director')
    expect(rolMiEquipo({ puedeEditar: false, puedeRegistrar: true })).toBe('coordinador')
    expect(rolMiEquipo({ puedeEditar: false, puedeRegistrar: false })).toBe('sin_permisos')
  })
})

describe('accionesPersonaMiEquipo', () => {
  it('director: every action on a servicio whose ficha the server lets them fix', () => {
    expect(accionesPersonaMiEquipo(servicio(), 'director')).toEqual({
      alguna: true,
      servicio: { id: 's-1', version: 3 },
      cambiarEtapa: true,
      turnosDe: 's-1',
      editarFicha: true,
      invitar: true,
    })
  })

  it('director without the ficha of that servicio: stage and shifts, no ficha nor invite (as the old menu)', () => {
    const acciones = accionesPersonaMiEquipo(servicio({ fichaEditable: false }), 'director')
    expect(acciones).toMatchObject({ alguna: true, cambiarEtapa: true, turnosDe: 's-1', editarFicha: false, invitar: false })
  })

  it('coordinador: ficha, shifts and invite, never the stage', () => {
    expect(accionesPersonaMiEquipo(servicio(), 'coordinador')).toEqual({
      alguna: true,
      servicio: null,
      cambiarEtapa: false,
      turnosDe: 's-1',
      editarFicha: true,
      invitar: true,
    })
  })

  it('coordinador outside the equipos they register in: nothing', () => {
    const acciones = accionesPersonaMiEquipo(servicio({ fichaEditable: false }), 'coordinador')
    expect(acciones).toMatchObject({ alguna: false, cambiarEtapa: false, turnosDe: undefined, editarFicha: false, invitar: false })
  })

  it('without permissions, a Grupos de Vida row or a retired servicio: no stage nor shift change', () => {
    expect(accionesPersonaMiEquipo(servicio(), 'sin_permisos').alguna).toBe(false)
    const gdv = servicio({ origen: 'grupos_vida', servicioId: undefined, version: undefined, editable: false, fichaEditable: false })
    expect(accionesPersonaMiEquipo(gdv, 'director').alguna).toBe(false)
    const retirado = accionesPersonaMiEquipo(servicio({ estado: 'retirado', fichaEditable: false }), 'director')
    expect(retirado).toMatchObject({ cambiarEtapa: false, turnosDe: undefined, editarFicha: false })
  })

  it('invites only someone known to have no account', () => {
    expect(accionesPersonaMiEquipo(servicio({ tieneCuenta: true }), 'coordinador').invitar).toBe(false)
    expect(accionesPersonaMiEquipo(servicio({ tieneCuenta: null }), 'coordinador').invitar).toBe(false)
  })
})

describe('textoTurnosMiEquipo', () => {
  const turnos = [
    { id: 't9', label: 'Domingo 9:00' },
    { id: 't11', label: 'Domingo 11:00' },
    { id: 'tlr', label: 'The Living Room', tipo: 'fechas' as const },
  ]

  it('names the shifts in campus order, a dash when none, "Por fechas" for a dated shift', () => {
    expect(textoTurnosMiEquipo(servicio({ turnoIds: ['t11', 't9'] }), turnos, '2026-10-29')).toBe('Domingo 9:00, Domingo 11:00')
    expect(textoTurnosMiEquipo(servicio({ turnoIds: [] }), turnos, '2026-10-29')).toBe('—')
    expect(textoTurnosMiEquipo(servicio(), turnos, '2026-10-29')).toBe('—')
    expect(textoTurnosMiEquipo(servicio({ turnoIds: ['tlr'] }), turnos, '2026-10-29')).toContain('Por fechas')
  })
})
