/**
 * The publish button and the blocker summary (S14, S16 of
 * odd/tasks/planner-gdv.md).
 */
import {
  botonPublicar,
  contarBloqueos,
  puedeMarcarSegmento,
  resumenBloqueos,
  type Bloqueo,
  type EstadoPublicacion,
  type SegmentoPublicacion,
} from '@/lib/platform/grupos-vida/planner'

const estado = (parcial: Partial<EstadoPublicacion> & { total?: number } = {}): EstadoPublicacion => {
  const { total = 0, ...resto } = parcial
  return {
    temporada: { id: 't2', nombre: '2026-II', estado: 'planificacion', activa: true, cohorte: 'II' },
    bloqueos: { total, sin_lider: 0, sin_director: 0, sin_localidad: total, persona_en_dos_grupos: 0 },
    grupos: 27,
    segmentos: [],
    segmentos_con_grupos: 4,
    segmentos_terminados: 4,
    faltan_segmentos: 0,
    rol_puede_publicar: true,
    puede_publicar: total === 0 && (resto.faltan_segmentos ?? 0) === 0,
    origen: null,
    otras_activas: [],
    ...resto,
  }
}

describe('botonPublicar (S16)', () => {
  it('blockers and missing segments', () => {
    expect(botonPublicar(estado({ total: 20, faltan_segmentos: 2 }))).toEqual({ texto: 'Publicar · 20 bloqueos · faltan 2 segmentos', listo: false })
  })

  it('singular', () => {
    expect(botonPublicar(estado({ total: 1, faltan_segmentos: 1 })).texto).toBe('Publicar · 1 bloqueo · falta 1 segmento')
  })

  it('only missing segments', () => {
    expect(botonPublicar(estado({ faltan_segmentos: 2 }))).toEqual({ texto: 'Publicar · faltan 2 segmentos', listo: false })
  })

  it('ready', () => {
    expect(botonPublicar(estado())).toEqual({ texto: 'Publicar', listo: true })
  })

  it('a season without groups', () => {
    expect(botonPublicar(estado({ grupos: 0, segmentos_con_grupos: 0, segmentos_terminados: 0, puede_publicar: false }))).toEqual({
      texto: 'Publicar · sin grupos',
      listo: false,
    })
  })

  it('is ready only when the server says so', () => {
    expect(botonPublicar(estado({ puede_publicar: false })).listo).toBe(false)
  })
})

describe('contarBloqueos and resumenBloqueos', () => {
  const fila = (tipo: Bloqueo['tipo']): Bloqueo => ({ tipo, segmento_id: 's1', grupo_id: 'g1', grupo_nombre: 'Grupo', usuario_id: null, detalle: '' })

  it('counts the rows of planner_bloqueos by kind', () => {
    expect(contarBloqueos([fila('sin_localidad'), fila('sin_localidad'), fila('sin_lider')])).toEqual({
      total: 3,
      sin_lider: 1,
      sin_director: 0,
      sin_localidad: 2,
      persona_en_dos_grupos: 0,
    })
  })

  it('lists the four kinds in a fixed order with Spanish labels', () => {
    expect(resumenBloqueos({ total: 22, sin_lider: 1, sin_director: 0, sin_localidad: 19, persona_en_dos_grupos: 2 })).toEqual([
      { tipo: 'sin_localidad', etiqueta: 'Sin localidad', cantidad: 19 },
      { tipo: 'sin_lider', etiqueta: 'Sin Líder', cantidad: 1 },
      { tipo: 'sin_director', etiqueta: 'Sin director de etapa', cantidad: 0 },
      { tipo: 'persona_en_dos_grupos', etiqueta: 'Persona en dos grupos', cantidad: 2 },
    ])
  })
})

describe('puedeMarcarSegmento (S14)', () => {
  const segmento = (parcial: Partial<SegmentoPublicacion> = {}): SegmentoPublicacion => ({
    id: 's1',
    nombre: 'Mujeres +36',
    grupos: 9,
    bloqueos: 0,
    terminado: false,
    marcado_por: null,
    marcado_en: null,
    ...parcial,
  })

  it('0 blockers and groups: can mark', () => {
    expect(puedeMarcarSegmento(segmento())).toEqual({ puede: true, motivo: null })
  })

  it('with blockers: the reason counts them', () => {
    expect(puedeMarcarSegmento(segmento({ bloqueos: 8 }))).toEqual({ puede: false, motivo: 'Primero resuelve los 8 bloqueos' })
    expect(puedeMarcarSegmento(segmento({ bloqueos: 1 }))).toEqual({ puede: false, motivo: 'Primero resuelve el bloqueo' })
  })

  it('without groups', () => {
    expect(puedeMarcarSegmento(segmento({ grupos: 0 }))).toEqual({ puede: false, motivo: 'Mujeres +36 no tiene grupos en esta temporada' })
  })
})
