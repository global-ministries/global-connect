/**
 * Personas — the pure rules of «Fusionar personas»
 * (odd/tasks/dream-team-estructura-correcciones.md, T5, S6c): which ficha
 * stays by default, which choices are refused, the typed confirmation, the
 * RPC answer mapping and the Spanish error messages.
 */
import {
  confirmacionValida,
  etiquetaCampo,
  etiquetaConteo,
  mapBusquedaFusion,
  mapResultadoFusion,
  mapResumenFusion,
  mensajeErrorFusion,
  puedeQuedar,
  supervivientePorDefecto,
  type ResumenPersonaFusion,
} from '@/lib/platform/personas/fusion'

function persona(p: Partial<ResumenPersonaFusion> & { id: string }): ResumenPersonaFusion {
  return {
    nombre: 'Ana',
    apellido: 'Pérez',
    tieneCuenta: false,
    cedula: null,
    telefono: null,
    email: null,
    fechaRegistro: '2024-01-01T00:00:00Z',
    fechaNacimiento: null,
    campus: null,
    grupos: 0,
    servicios: 0,
    asistencias: 0,
    asistenciasDps: 0,
    ...p,
  }
}

describe('supervivientePorDefecto', () => {
  it('keeps the one with an account', () => {
    const a = persona({ id: 'a' })
    const b = persona({ id: 'b', tieneCuenta: true })
    expect(supervivientePorDefecto(a, b)).toEqual({ quedaId: 'b', bloqueo: null })
    expect(supervivientePorDefecto(b, a)).toEqual({ quedaId: 'b', bloqueo: null })
  })

  it('refuses when both have an account', () => {
    expect(supervivientePorDefecto(persona({ id: 'a', tieneCuenta: true }), persona({ id: 'b', tieneCuenta: true }))).toEqual({
      quedaId: null,
      bloqueo: 'Las dos fichas tienen cuenta. No se pueden fusionar.',
    })
  })

  it('without accounts keeps the older ficha (it has the history)', () => {
    const nueva = persona({ id: 'n', fechaRegistro: '2026-10-01T00:00:00Z' })
    const vieja = persona({ id: 'v', fechaRegistro: '2021-03-01T00:00:00Z' })
    expect(supervivientePorDefecto(nueva, vieja)).toEqual({ quedaId: 'v', bloqueo: null })
  })

  it('refuses the same ficha twice', () => {
    expect(supervivientePorDefecto(persona({ id: 'a' }), persona({ id: 'a' }))).toEqual({
      quedaId: null,
      bloqueo: 'Elige dos fichas distintas.',
    })
  })
})

describe('puedeQuedar', () => {
  it('only the ficha with the account may stay when the other has none', () => {
    const conCuenta = persona({ id: 'c', tieneCuenta: true })
    const sinCuenta = persona({ id: 's' })
    expect(puedeQuedar(conCuenta, sinCuenta)).toBe(true)
    expect(puedeQuedar(sinCuenta, conCuenta)).toBe(false)
  })
  it('either may stay when none has an account', () => {
    expect(puedeQuedar(persona({ id: 'a' }), persona({ id: 'b' }))).toBe(true)
  })
})

describe('confirmacionValida', () => {
  const queda = persona({ id: 'q', nombre: 'Isaac José', apellido: 'Paez Cordero' })
  it('accepts the full name, ignoring case, accents and extra blanks', () => {
    expect(confirmacionValida('Isaac José Paez Cordero', queda)).toBe(true)
    expect(confirmacionValida('  isaac   jose paez  CORDERO ', queda)).toBe(true)
  })
  it('refuses anything else', () => {
    expect(confirmacionValida('Isaac Paez', queda)).toBe(false)
    expect(confirmacionValida('', queda)).toBe(false)
  })
})

describe('mensajeErrorFusion', () => {
  it.each([
    [{ code: '42501', message: 'sin_autoridad' }, 'No tienes permiso para fusionar personas.'],
    [{ code: '22023', message: 'misma_persona' }, 'Elige dos fichas distintas.'],
    [{ code: '22023', message: 'persona_no_encontrada' }, 'Una de las fichas ya no existe. Vuelve a buscarlas.'],
    [{ code: '22023', message: 'ambas_con_cuenta' }, 'Las dos fichas tienen cuenta. No se pueden fusionar.'],
    [{ code: '22023', message: 'se_va_tiene_cuenta' }, 'La ficha con cuenta tiene que ser la que queda.'],
    [{ code: '22023', message: 'demasiados_ids' }, 'Elige solo dos fichas.'],
    [
      { code: '22023', message: 'historial_inmutable' },
      'La ficha que se borra tiene historial que no se puede cambiar. No se cambió nada; avisa a soporte.',
    ],
    // T7 (B1): a collision only a human settles names its area.
    [
      { code: '22023', message: 'fusion_conflicto', details: 'casas_anfitrionas' },
      'Las dos fichas tienen una casa anfitriona y cada persona solo puede tener una. No se cambió nada; deja una sola casa en Casas anfitrionas y vuelve a intentarlo.',
    ],
    [
      { code: '22023', message: 'fusion_conflicto', details: 'taller_inscripciones' },
      'Las dos fichas están inscritas en la misma edición de un taller y una de esas inscripciones es en pareja. No se cambió nada; retira una de las dos inscripciones en Talleres y vuelve a intentarlo.',
    ],
    [
      { code: '22023', message: 'fusion_conflicto', details: 'otra_tabla' },
      'Las dos fichas tienen datos que no se pueden juntar solos. No se cambió nada; avisa a soporte.',
    ],
    [
      { code: '22023', message: 'fusion_conflicto' },
      'Las dos fichas tienen datos que no se pueden juntar solos. No se cambió nada; avisa a soporte.',
    ],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, 'No se pudo fusionar. No se cambió nada; intenta de nuevo o avisa a soporte.'],
    [null, 'No se pudo fusionar. No se cambió nada; intenta de nuevo o avisa a soporte.'],
  ])('%j → %s', (error, mensaje) => {
    expect(mensajeErrorFusion(error)).toBe(mensaje)
  })
})

describe('mapBusquedaFusion', () => {
  it('maps the rows and drops malformed ones', () => {
    expect(
      mapBusquedaFusion([
        { id: 'a', nombre: 'Ana', apellido: 'Pérez', email: null, tiene_cuenta: true },
        { id: 1 },
      ]),
    ).toEqual([{ id: 'a', nombre: 'Ana', apellido: 'Pérez', email: null, tieneCuenta: true }])
    expect(mapBusquedaFusion(null)).toEqual([])
  })
})

describe('mapResumenFusion', () => {
  it('maps the summary of each person', () => {
    expect(
      mapResumenFusion([
        {
          id: 'a', nombre: 'Ana', apellido: 'Pérez', tiene_cuenta: true, cedula: '123', telefono: '0414', email: 'a@x.test',
          fecha_registro: '2020-01-01T00:00:00Z', fecha_nacimiento: '1990-05-05', campus: 'Valencia',
          grupos: 2, servicios: 1, asistencias: 10, asistencias_dps: 3,
        },
      ]),
    ).toEqual([
      persona({
        id: 'a', nombre: 'Ana', apellido: 'Pérez', tieneCuenta: true, cedula: '123', telefono: '0414', email: 'a@x.test',
        fechaRegistro: '2020-01-01T00:00:00Z', fechaNacimiento: '1990-05-05', campus: 'Valencia',
        grupos: 2, servicios: 1, asistencias: 10, asistenciasDps: 3,
      }),
    ])
  })
})

describe('mapResultadoFusion', () => {
  it('maps the counts per table, most rows first, the conserved append-only rows last, and the totals', () => {
    expect(
      mapResultadoFusion({
        simulado: true,
        queda_id: 'q',
        se_va_id: 's',
        conteos: {
          'grupo_miembros.usuario_id': { movidos: 1, descartados: 1 },
          'operating_core_participation_eventos.subject_id': { movidos: 0, descartados: 0, conservados: 3 },
          'dream_team_servicios.persona_id': { movidos: 2, descartados: 0, retirados: 1 },
          'tabla_nueva.persona_id': { movidos: 5, descartados: 0 },
        },
        total_movidos: 8,
        total_descartados: 1,
        total_conservados: 3,
        campos_completados: ['cedula', 'fecha_registro'],
      }),
    ).toEqual({
      simulado: true,
      quedaId: 'q',
      seVaId: 's',
      conteos: [
        { clave: 'tabla_nueva.persona_id', etiqueta: 'tabla_nueva.persona_id', movidos: 5, descartados: 0, retirados: 0, conservados: 0 },
        { clave: 'dream_team_servicios.persona_id', etiqueta: 'Servicios en Dream Team', movidos: 2, descartados: 0, retirados: 1, conservados: 0 },
        { clave: 'grupo_miembros.usuario_id', etiqueta: 'Grupos de vida', movidos: 1, descartados: 1, retirados: 0, conservados: 0 },
        {
          clave: 'operating_core_participation_eventos.subject_id',
          etiqueta: 'Historial de participación',
          movidos: 0,
          descartados: 0,
          retirados: 0,
          conservados: 3,
        },
      ],
      totalMovidos: 8,
      totalDescartados: 1,
      totalConservados: 3,
      camposCompletados: ['cedula', 'fecha_registro'],
    })
  })

  it('an answer without conserved rows has totalConservados 0', () => {
    const r = mapResultadoFusion({ simulado: false, queda_id: 'q', se_va_id: 's', conteos: {}, total_movidos: 0, total_descartados: 0 })
    expect(r.totalConservados).toBe(0)
    expect(r.conteos).toEqual([])
  })
})

describe('labels', () => {
  it('names the known tables and fields in Spanish', () => {
    expect(etiquetaConteo('asistencia.usuario_id')).toBe('Asistencia a grupos')
    expect(etiquetaConteo('relaciones_usuarios.entre_ambas')).toBe('Vínculo familiar entre las dos fichas')
    expect(etiquetaConteo('otra.columna')).toBe('otra.columna')
    // T7: the tables behind rule triggers read in Spanish too.
    expect(etiquetaConteo('taller_inscripciones.persona_principal_id')).toBe('Inscripciones a talleres')
    expect(etiquetaConteo('taller_reportes.firma_lider_persona_id')).toBe('Reportes de talleres que firmó')
    expect(etiquetaConteo('taller_grupo_asignaciones.persona_id')).toBe('Grupos de talleres que acompañó')
    expect(etiquetaConteo('estudiantes_grupos.created_by')).toBe('Grupos de Estudiantes que creó')
    expect(etiquetaConteo('operating_core_participation_eventos.subject_id')).toBe('Historial de participación')
    expect(etiquetaConteo('operating_core_participation_eventos.actor_persona_id')).toBe(
      'Historial de participación (registrado por esta ficha)',
    )
    expect(etiquetaCampo('fecha_registro')).toBe('Fecha de registro (la más antigua)')
    expect(etiquetaCampo('cedula')).toBe('Cédula')
    expect(etiquetaCampo('otro')).toBe('otro')
  })
})
