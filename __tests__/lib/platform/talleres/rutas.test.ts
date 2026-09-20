/**
 * T1 (odd/tasks/talleres-consolidar-pantallas.md) — pure URL builders for
 * the new /talleres/[taller]/[edicion]/[grupo] tree, plus the old→new
 * route map (docs/talleres-de-punta-a-punta.md §8, "De 32 a once").
 *
 * The builders never touch the network or the DB — every dynamic
 * segment (slug, edicionId, grupoId) is passed in by the caller.
 */

import {
  rutaCatalogo,
  rutaTaller,
  rutaEdicion,
  rutaGrupo,
  rutaPendientes,
  rutaReportes,
  rutaTemporadas,
  rutaTemporada,
  rutaTemporadaCrear,
  rutaExplorar,
  rutaMiRecorrido,
  rutaCertificado,
  TALLERES_RUTAS_ANTIGUAS,
} from '@/lib/platform/talleres/rutas'

describe('rutas — pure URL builders', () => {
  it('rutaCatalogo', () => {
    expect(rutaCatalogo()).toBe('/talleres')
  })

  it('rutaTaller(slug)', () => {
    expect(rutaTaller('proximo-paso')).toBe('/talleres/proximo-paso')
  })

  it('rutaEdicion(slug, edicionId)', () => {
    expect(rutaEdicion('proximo-paso', 'ed-1')).toBe('/talleres/proximo-paso/ed-1')
  })

  it('rutaGrupo(slug, edicionId, grupoId)', () => {
    expect(rutaGrupo('proximo-paso', 'ed-1', 'grupo-1')).toBe(
      '/talleres/proximo-paso/ed-1/grupo-1',
    )
  })

  it('rutaPendientes', () => {
    expect(rutaPendientes()).toBe('/talleres/pendientes')
  })

  it('rutaReportes', () => {
    expect(rutaReportes()).toBe('/talleres/reportes')
  })

  it('rutaTemporadas / rutaTemporada / rutaTemporadaCrear', () => {
    expect(rutaTemporadas()).toBe('/talleres/temporadas')
    expect(rutaTemporada('temp-1')).toBe('/talleres/temporadas/temp-1')
    // T8 — "crear", not "nueva": 4 of the app's 6 creation routes use
    // "crear", and the same object in Grupos de Vida is already
    // grupos-vida/temporadas/crear. The docs/talleres-de-punta-a-punta.md
    // tree said "nueva"; the doc was fixed, not the app.
    expect(rutaTemporadaCrear()).toBe('/talleres/temporadas/crear')
  })

  it('rutaExplorar', () => {
    expect(rutaExplorar()).toBe('/talleres/explorar')
  })

  it('rutaMiRecorrido / rutaCertificado', () => {
    expect(rutaMiRecorrido()).toBe('/talleres/mi-recorrido')
    expect(rutaCertificado('cert-1')).toBe('/talleres/mi-recorrido/certificados/cert-1')
  })

  it('every builder rejects an empty dynamic segment (no silent //  in the URL)', () => {
    expect(() => rutaTaller('')).toThrow()
    expect(() => rutaEdicion('slug', '')).toThrow()
    expect(() => rutaGrupo('slug', 'ed', '')).toThrow()
    expect(() => rutaTemporada('')).toThrow()
    expect(() => rutaCertificado('')).toThrow()
  })
})

describe('TALLERES_RUTAS_ANTIGUAS — old→new route map', () => {
  it('every entry has a non-empty origen starting with /talleres or /admin/talleres', () => {
    for (const entry of TALLERES_RUTAS_ANTIGUAS) {
      expect(entry.origen.length).toBeGreaterThan(0)
      expect(
        entry.origen.startsWith('/talleres/') || entry.origen.startsWith('/admin/talleres/'),
      ).toBe(true)
    }
  })

  it('every origen is unique', () => {
    const origenes = TALLERES_RUTAS_ANTIGUAS.map((e) => e.origen)
    expect(new Set(origenes).size).toBe(origenes.length)
  })

  it('an entry marked activa:true always has a non-null destino', () => {
    for (const entry of TALLERES_RUTAS_ANTIGUAS) {
      if (entry.activa) expect(entry.destino).not.toBeNull()
    }
  })

  it('an entry marked activa:true matches one of the next.config.mjs redirects (T1 scope)', () => {
    const activas = TALLERES_RUTAS_ANTIGUAS.filter((e) => e.activa)
    expect(activas.map((e) => [e.origen, e.destino]).sort()).toEqual(
      [
        ['/talleres/grupos', '/talleres/equipo/mis-grupos'],
        ['/talleres/sesiones', '/talleres/equipo/proximas-sesiones'],
      ].sort(),
    )
  })

  it('every entry not yet active carries a non-empty nota explaining the deferral', () => {
    for (const entry of TALLERES_RUTAS_ANTIGUAS) {
      if (!entry.activa) expect(entry.nota.length).toBeGreaterThan(0)
    }
  })

  it('T6 resolves the /admin/talleres/inscripciones destino to the pendientes inbox (was null, "decisión pendiente para T6/T10")', () => {
    // Only the "pendiente cross-edición" half is covered — the admin
    // page's full multi-estado audit filter has no 1:1 replacement here.
    const entry = TALLERES_RUTAS_ANTIGUAS.find((e) => e.origen === '/admin/talleres/inscripciones')
    expect(entry?.destino).toBe('/talleres/pendientes')
    expect(entry?.activa).toBe(false)
  })

  it('includes the deleted screens (Recursos, Métricas) with destino: null', () => {
    const recursos = TALLERES_RUTAS_ANTIGUAS.find((e) => e.origen === '/talleres/equipo/recursos')
    const metricas = TALLERES_RUTAS_ANTIGUAS.find((e) => e.origen === '/talleres/direccion/metricas')
    expect(recursos?.destino).toBeNull()
    expect(metricas?.destino).toBeNull()
  })
})
