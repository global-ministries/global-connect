/**
 * The per-servicio action rule shared by the Servidores menu and drawer and
 * by Mi equipo's person panel (T7a-2 of odd/tasks/sistema-diseno-v2.md, S11
 * decision 10: the coordinator registers, edits fichas and turnos, invites,
 * but does not change the etapa).
 */
import {
  accionesDeServicio,
  accionesDeServicioMiEquipo,
  permisosMiEquipo,
  tieneMenu,
  type ServicioMiEquipo,
} from '@/lib/platform/dream-team/acciones-servicio'
import * as desdeMenu from '@/components/dream-team/servidores/menu-servidor'
import type { FilaServidor } from '@/lib/platform/dream-team/servidores-vista'
import type { PersonaId } from '@/lib/platform/dream-team/types'

const FILA: FilaServidor = {
  clave: 's-1',
  personaId: 'p-1' as PersonaId,
  nombre: 'Ana Ruiz',
  equipoId: 'e-1',
  equipoLabel: 'Coro',
  equipoRuta: 'Alabanza',
  direccionId: 'dir-1',
  rolLabel: 'Integrante',
  estado: 'activo',
  fechaInicio: '2026-01-10',
  telefono: null,
  tieneCuenta: true,
  origen: 'dream_team',
  servicioId: 's-1',
  version: 3,
  editable: true,
}

const SERVICIO: ServicioMiEquipo = {
  origen: 'dream_team',
  estado: 'activo',
  servicioId: 's-1',
  version: 3,
  tieneCuenta: false,
}

describe('accionesDeServicio (Servidores)', () => {
  it('stays exported from menu-servidor, so existing imports keep working', () => {
    expect(desdeMenu.accionesDeServicio).toBe(accionesDeServicio)
    expect(desdeMenu.tieneMenu).toBe(tieneMenu)
  })

  it('an editor may change the stage and the shifts', () => {
    expect(accionesDeServicio(FILA)).toEqual({
      alguna: true,
      servicio: { id: 's-1', version: 3 },
      cambiarEtapa: true,
      turnosDe: 's-1',
      editarFicha: false,
      invitar: false,
    })
  })

  it('whoever may fix the ficha gets the shifts and the invite, never the stage', () => {
    expect(accionesDeServicio({ ...FILA, editable: false, fichaEditable: true, tieneCuenta: false })).toEqual({
      alguna: true,
      servicio: null,
      cambiarEtapa: false,
      turnosDe: 's-1',
      editarFicha: true,
      invitar: true,
    })
  })

  it('a retired servicio keeps the menu but offers no stage or shift change', () => {
    const acciones = accionesDeServicio({ ...FILA, estado: 'retirado' })
    expect(acciones.alguna).toBe(true)
    expect(acciones.cambiarEtapa).toBe(false)
    expect(acciones.turnosDe).toBeUndefined()
  })

  it('a read-only row has nothing at all', () => {
    expect(tieneMenu({ ...FILA, editable: false })).toBe(false)
    expect(accionesDeServicio({ ...FILA, editable: false }).alguna).toBe(false)
  })
})

describe('permisosMiEquipo (S11 decision 10)', () => {
  it('director: everything', () => {
    expect(permisosMiEquipo('director')).toEqual({
      registrar: true,
      cambiarEtapa: true,
      editarFicha: true,
      turnos: true,
      invitar: true,
    })
  })

  it('coordinador: registers, edits fichas and turnos, invites, but does not change the etapa', () => {
    expect(permisosMiEquipo('coordinador')).toEqual({
      registrar: true,
      cambiarEtapa: false,
      editarFicha: true,
      turnos: true,
      invitar: true,
    })
  })

  it('sin permisos: nothing', () => {
    expect(permisosMiEquipo('sin_permisos')).toEqual({
      registrar: false,
      cambiarEtapa: false,
      editarFicha: false,
      turnos: false,
      invitar: false,
    })
  })
})

describe('accionesDeServicioMiEquipo', () => {
  it('director: stage, shifts, ficha and invite for someone without account', () => {
    expect(accionesDeServicioMiEquipo(SERVICIO, 'director')).toEqual({
      alguna: true,
      servicio: { id: 's-1', version: 3 },
      cambiarEtapa: true,
      turnosDe: 's-1',
      editarFicha: true,
      invitar: true,
    })
  })

  it('coordinador: shifts, ficha and invite, never the stage', () => {
    expect(accionesDeServicioMiEquipo(SERVICIO, 'coordinador')).toEqual({
      alguna: true,
      servicio: null,
      cambiarEtapa: false,
      turnosDe: 's-1',
      editarFicha: true,
      invitar: true,
    })
  })

  it('sin permisos: no action', () => {
    expect(accionesDeServicioMiEquipo(SERVICIO, 'sin_permisos')).toEqual({
      alguna: false,
      servicio: null,
      cambiarEtapa: false,
      turnosDe: undefined,
      editarFicha: false,
      invitar: false,
    })
  })

  it('invites only someone known to have no account', () => {
    expect(accionesDeServicioMiEquipo({ ...SERVICIO, tieneCuenta: true }, 'director').invitar).toBe(false)
    expect(accionesDeServicioMiEquipo({ ...SERVICIO, tieneCuenta: null }, 'coordinador').invitar).toBe(false)
  })

  it('a Grupos de Vida servicio is read-only for every role', () => {
    const gdv: ServicioMiEquipo = { ...SERVICIO, origen: 'grupos_vida', servicioId: undefined, version: undefined }
    for (const rol of ['director', 'coordinador', 'sin_permisos'] as const) {
      expect(accionesDeServicioMiEquipo(gdv, rol).alguna).toBe(false)
    }
  })

  it('a retired servicio: the director keeps the row but no stage or shift change; the coordinador has nothing', () => {
    const retirado: ServicioMiEquipo = { ...SERVICIO, estado: 'retirado' }
    expect(accionesDeServicioMiEquipo(retirado, 'director')).toEqual({
      alguna: true,
      servicio: { id: 's-1', version: 3 },
      cambiarEtapa: false,
      turnosDe: undefined,
      editarFicha: false,
      invitar: false,
    })
    expect(accionesDeServicioMiEquipo(retirado, 'coordinador').alguna).toBe(false)
  })
})
