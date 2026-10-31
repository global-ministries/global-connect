/**
 * Spanish (tuteo) messages for the errors the Estudiantes group RPCs raise
 * (supabase/migrations/20261029100100_estudiantes_asistencia_rpcs.sql and
 * 20261029130000_estudiantes_gestion_grupos.sql).
 */
import { MENSAJES_ERROR_GRUPOS, codigoErrorGrupos, mensajeErrorGrupos } from '@/lib/platform/estudiantes/errores'

const CODIGOS = [
  'sin_autoridad',
  'grupo_invalido',
  'nombre_invalido',
  'nombre_duplicado',
  'anio_invalido',
  'horario_invalido',
  'texto_muy_largo',
  'servicio_invalido',
  'servicios_invalidos',
  'persona_invalida',
  'persona_en_otro_grupo',
  'estado_invalido',
  'campus_invalido',
  'subarea_invalida',
  'datos_invalidos',
  // Leader list and visitor registration (C3).
  'fecha_invalida',
  'turno_invalido',
  'genero_requerido',
  'nombre_y_apellido_requeridos',
  'representante_incompleto',
  'representante_no_aplica',
  'representante_no_encontrado',
  'tipo_representante_invalido',
  'cedula_existente',
  'posibles_duplicados',
] as const

describe('mensajeErrorGrupos', () => {
  it('has a message for every error code of the RPCs', () => {
    for (const codigo of CODIGOS) {
      expect(mensajeErrorGrupos({ code: 'P0001', message: codigo })).toBe(MENSAJES_ERROR_GRUPOS[codigo])
    }
  })

  it('uses tuteo, never voseo or "acá"', () => {
    for (const texto of Object.values(MENSAJES_ERROR_GRUPOS)) {
      expect(texto).not.toMatch(/\b(acá|tenés|podés|elegí|revisá|probá|recargá|usá|quitá|volvé)\b/i)
    }
  })

  it('maps the main codes to clear messages', () => {
    expect(mensajeErrorGrupos({ message: 'sin_autoridad' })).toBe('No tienes permiso para gestionar este grupo.')
    expect(mensajeErrorGrupos({ message: 'nombre_duplicado' })).toBe('Ya hay un grupo con ese nombre en esta sub-área. Elige otro.')
    expect(mensajeErrorGrupos({ message: 'persona_en_otro_grupo' })).toBe(
      'Ya está en otro grupo de este ámbito. Usa «Mover aquí» para traerla.',
    )
  })

  it('falls back on the SQLSTATE and then on the given text', () => {
    expect(mensajeErrorGrupos({ code: '42501', message: 'permission denied for function x' })).toBe(MENSAJES_ERROR_GRUPOS.sin_autoridad)
    expect(mensajeErrorGrupos({ code: 'XX000', message: 'boom' }, 'No se pudo crear el grupo.')).toBe('No se pudo crear el grupo.')
    expect(mensajeErrorGrupos(null)).toBe('No se pudo guardar. Inténtalo de nuevo.')
  })
})

describe('codigoErrorGrupos', () => {
  it('returns the known code so the screen can react to it', () => {
    expect(codigoErrorGrupos({ code: '23505', message: 'posibles_duplicados' })).toBe('posibles_duplicados')
    expect(codigoErrorGrupos({ code: '23505', message: 'cedula_existente' })).toBe('cedula_existente')
    expect(codigoErrorGrupos({ code: '42501', message: 'permission denied' })).toBe('sin_autoridad')
    expect(codigoErrorGrupos({ code: 'XX000', message: 'boom' })).toBeNull()
    expect(codigoErrorGrupos(null)).toBeNull()
  })

  it('explains the meeting and visitor errors in tuteo', () => {
    expect(mensajeErrorGrupos({ message: 'fecha_invalida' })).toBe('Esa fecha no tiene reunión para marcar. Elige otra.')
    expect(mensajeErrorGrupos({ message: 'cedula_existente' })).toBe('Ya hay alguien con esa cédula. Búscalo en el paso anterior y agrégalo desde ahí.')
  })
})
