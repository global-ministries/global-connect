/**
 * `Servidor` — pure helpers shared by the two volunteer-listing screens
 * (servidores-client.tsx, mi-equipo-client.tsx) so both share one notion of
 * "a person serving", whatever the source: a Dream Team `servicio` or a
 * Grupos de Vida leader/co-leader (see lib/platform/dream-team/lideres-gdv.ts).
 */
import {
  claveDeServidor,
  equipoIdDeServidor,
  estadoDeServidor,
  personaIdDeServidor,
  type Servidor,
} from '@/lib/platform/dream-team/servidores'
import { personaId } from '@/lib/platform/dream-team/types'
import type { DreamTeamServicio } from '@/lib/platform/dream-team/types'
import type { DreamTeamLiderGdv } from '@/lib/platform/dream-team/lideres-gdv'

function servicio(overrides: Partial<DreamTeamServicio> = {}): DreamTeamServicio {
  return {
    id: 's-1',
    personaId: personaId('p-1'),
    equipoId: 'equipo-dps',
    rolId: 'rol-cam',
    estado: 'en_pausa',
    fechaInicio: '2026-01-01T00:00:00.000Z',
    motivoActual: 'admin_asignacion',
    version: 1,
    ...overrides,
  }
}

function lider(overrides: Partial<DreamTeamLiderGdv> = {}): DreamTeamLiderGdv {
  return {
    personaId: personaId('p-gdv-1'),
    equipoId: 'equipo-gdv',
    rol: 'lider',
    grupos: 1,
    desde: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('estadoDeServidor', () => {
  it("returns the servicio's own estado for a dream_team servidor", () => {
    const servidor: Servidor = { origen: 'dream_team', servicio: servicio({ estado: 'en_pausa' }) }
    expect(estadoDeServidor(servidor)).toBe('en_pausa')
  })

  it("is always 'activo' for a grupos_vida servidor — its lifecycle lives in Grupos de Vida", () => {
    const servidor: Servidor = { origen: 'grupos_vida', lider: lider() }
    expect(estadoDeServidor(servidor)).toBe('activo')
  })
})

describe('claveDeServidor', () => {
  it('uses the servicio id for a dream_team servidor', () => {
    const servidor: Servidor = { origen: 'dream_team', servicio: servicio({ id: 's-42' }) }
    expect(claveDeServidor(servidor)).toBe('s-42')
  })

  it('uses a gdv:-prefixed persona id for a grupos_vida servidor', () => {
    const servidor: Servidor = { origen: 'grupos_vida', lider: lider({ personaId: personaId('p-9') }) }
    expect(claveDeServidor(servidor)).toBe('gdv:p-9')
  })

  it('never collides between the two origins', () => {
    const dt: Servidor = { origen: 'dream_team', servicio: servicio({ id: 'gdv:p-9' }) }
    const gdv: Servidor = { origen: 'grupos_vida', lider: lider({ personaId: personaId('p-9') }) }
    // A pathological servicio id equal to the gdv key text is still distinguishable
    // in practice (uuids never look like this), but the helper itself never merges them.
    expect(claveDeServidor(dt)).toBe(claveDeServidor(gdv))
    expect(dt.origen).not.toBe(gdv.origen)
  })
})

describe('personaIdDeServidor', () => {
  it('resolves the persona id for a dream_team servidor', () => {
    const servidor: Servidor = { origen: 'dream_team', servicio: servicio({ personaId: personaId('p-7') }) }
    expect(personaIdDeServidor(servidor)).toBe(personaId('p-7'))
  })

  it('resolves the persona id for a grupos_vida servidor', () => {
    const servidor: Servidor = { origen: 'grupos_vida', lider: lider({ personaId: personaId('p-8') }) }
    expect(personaIdDeServidor(servidor)).toBe(personaId('p-8'))
  })
})

describe('equipoIdDeServidor', () => {
  it('resolves the equipo id for a dream_team servidor', () => {
    const servidor: Servidor = { origen: 'dream_team', servicio: servicio({ equipoId: 'equipo-a' }) }
    expect(equipoIdDeServidor(servidor)).toBe('equipo-a')
  })

  it('resolves the equipo id for a grupos_vida servidor', () => {
    const servidor: Servidor = { origen: 'grupos_vida', lider: lider({ equipoId: 'equipo-gdv-root' }) }
    expect(equipoIdDeServidor(servidor)).toBe('equipo-gdv-root')
  })
})
