/**
 * Builders for the planner rule tests: one group of the board, one person of
 * the bank and the two localidades of production (Barquisimeto in Iribarren,
 * Cabudare in Palavecino). Peña (Yaritagua) has no localidad.
 */
import type { GrupoTablero, Localidad, PersonaBanco, PersonaGrupo } from '../tipos'

export const IRIBARREN = 'mun-iri'
export const PALAVECINO = 'mun-pal'
export const PENA = 'mun-pena'

export const NOMBRE_MUNICIPIO: Record<string, string> = {
  [IRIBARREN]: 'Iribarren',
  [PALAVECINO]: 'Palavecino',
  [PENA]: 'Peña',
}

export const LOCALIDADES: Localidad[] = [
  { id: 'loc-bqto', nombre: 'Barquisimeto', municipio_id: IRIBARREN },
  { id: 'loc-cab', nombre: 'Cabudare', municipio_id: PALAVECINO },
]

export const enGrupo = (usuario_id: string, lideres_origen: string[] = []): PersonaGrupo => ({
  usuario_id,
  nombre: usuario_id,
  apellido: 'Pérez',
  lideres_origen,
})

export const grupo = (parcial: Partial<GrupoTablero> = {}): GrupoTablero => ({
  grupo_id: 'g1',
  nombre: 'Grupo #14 Los Escalona',
  segmento_id: 'seg-mat',
  segmento_nombre: 'Matrimonios',
  localidad_id: 'loc-cab',
  localidad_nombre: 'Cabudare',
  localidad_municipio_id: PALAVECINO,
  localidad_municipio_nombre: 'Palavecino',
  dia_reunion: 'Jueves',
  hora_reunion: '19:30:00',
  capacidad_maxima: 15,
  estado_ciclo: 'proximo',
  estado_aprobacion: 'pendiente',
  activo: false,
  directores: [],
  lideres: [],
  aprendices: [],
  miembros: [],
  ...parcial,
})

/** Six people (two leaders, one aprendiz, three members) so the size rules stay quiet. */
export const grupoCompleto = (parcial: Partial<GrupoTablero> = {}): GrupoTablero =>
  grupo({
    lideres: [enGrupo('l1'), enGrupo('l2')],
    aprendices: [enGrupo('a1')],
    miembros: [enGrupo('m1'), enGrupo('m2'), enGrupo('m3')],
    ...parcial,
  })

export const persona = (parcial: Partial<PersonaBanco> & { usuario_id: string }): PersonaBanco => {
  const municipio = parcial.municipio_id === undefined ? PALAVECINO : parcial.municipio_id
  return {
    nombre: parcial.usuario_id,
    apellido: 'Pérez',
    edad: 40,
    genero: null,
    estado_civil: null,
    fecha_registro: null,
    conyuge_id: null,
    segmento_sugerido_id: null,
    segmento_sugerido_nombre: null,
    tiene_direccion: municipio !== null,
    municipio_id: municipio,
    municipio_nombre: municipio === null ? null : NOMBRE_MUNICIPIO[municipio] ?? null,
    grupo_actual_id: 'g1',
    grupo_actual_nombre: 'Grupo #14 Los Escalona',
    grupo_actual_rol: 'Miembro',
    grupo_actual_segmento_id: 'seg-mat',
    grupos_en_temporada: 1,
    origen_grupo_id: null,
    origen_grupo_nombre: null,
    origen_rol: null,
    origen_lideres: [],
    otras_temporadas: [],
    ...parcial,
  }
}

/** The bank rows of everyone in the groups, all living in Palavecino unless overridden. */
export const bancoDe = (grupos: GrupoTablero[], extra: PersonaBanco[] = []): PersonaBanco[] => {
  const propios = new Set(extra.map((p) => p.usuario_id))
  const deGrupos = grupos.flatMap((g) =>
    [...g.lideres, ...g.aprendices, ...g.miembros]
      .filter((p) => !propios.has(p.usuario_id))
      .map((p) =>
        persona({
          usuario_id: p.usuario_id,
          grupo_actual_id: g.grupo_id,
          grupo_actual_nombre: g.nombre,
          grupo_actual_segmento_id: g.segmento_id,
        }),
      ),
  )
  return [...deGrupos, ...extra]
}
