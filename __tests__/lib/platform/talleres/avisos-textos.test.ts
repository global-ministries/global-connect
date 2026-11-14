/**
 * @jest-environment node
 *
 * R4b (odd/tasks/talleres-rediseno.md, S10; design/talleres-avisos 02–04) —
 * the editable texts of the talleres notices, app side: the variables list
 * read from talleres_aviso_variables() (never duplicated), the client
 * validation that mirrors talleres_aviso_texto_guardar, the Spanish «tú»
 * messages for its errors, «Quitar {x}», the render that mirrors
 * talleres_aviso_texto_render, and the custom texts of talleres_avisos_panel.
 */
import {
  mensajeErrorServidor,
  mensajeErrorTexto,
  parseTextosAvisos,
  parseVariablesAvisos,
  quitarVariable,
  renderPrevio,
  renderTextoAviso,
  validarTextoAviso,
  type DefinicionVariables,
} from '@/lib/platform/talleres/avisos-textos'
import { parsePanelAvisos } from '@/lib/platform/talleres/avisos-panel'

const APROBADA: DefinicionVariables = {
  variables: ['nombre', 'taller', 'edicion', 'fecha', 'hora', 'lugar', 'indicaciones'],
  asunto: ['nombre', 'taller', 'edicion'],
}

describe('parseVariablesAvisos (talleres_aviso_variables)', () => {
  it('reads every kind with its variables and those allowed in the subject', () => {
    const variables = parseVariablesAvisos({
      inscripcion_aprobada: { variables: APROBADA.variables, asunto: APROBADA.asunto },
      recordatorio_clase: { variables: ['nombre', 'numero', 'clase'], asunto: ['nombre', 'numero'] },
      raro: 'x',
    })
    expect(variables).toEqual({
      inscripcion_aprobada: APROBADA,
      recordatorio_clase: { variables: ['nombre', 'numero', 'clase'], asunto: ['nombre', 'numero'] },
    })
  })

  it('anything that is not an object is an empty list', () => {
    expect(parseVariablesAvisos(null)).toEqual({})
  })
})

describe('validarTextoAviso — mirrors talleres_aviso_texto_guardar', () => {
  it('a valid text has no errors', () => {
    expect(validarTextoAviso({ asunto: 'Aprobamos tu inscripción en {taller}', mensaje: 'Hola {nombre}.\nLugar: {lugar}' }, APROBADA)).toEqual([])
  })

  it('an unknown variable is VARIABLE_DESCONOCIDA, each once, subject first', () => {
    expect(
      validarTextoAviso({ asunto: 'Tu {grupo}', mensaje: 'Te contamos tu grupo: {grupo}. {facilitadora}' }, APROBADA),
    ).toEqual([{ codigo: 'VARIABLE_DESCONOCIDA', variables: ['grupo', 'facilitadora'] }])
  })

  it('a variable that can be missing is not allowed in the subject', () => {
    expect(validarTextoAviso({ asunto: 'Te esperamos en {lugar}', mensaje: 'Hola' }, APROBADA)).toEqual([
      { codigo: 'VARIABLE_NO_PERMITIDA_EN_ASUNTO', variables: ['lugar'] },
    ])
  })

  it('an unclosed brace is LLAVE_SIN_CERRAR', () => {
    expect(validarTextoAviso({ asunto: 'Hola', mensaje: 'Nos vemos en {lugar' }, APROBADA)).toEqual([{ codigo: 'LLAVE_SIN_CERRAR' }])
    expect(validarTextoAviso({ asunto: 'Hola }', mensaje: 'Hola' }, APROBADA)).toEqual([{ codigo: 'LLAVE_SIN_CERRAR' }])
  })

  it('empty subject or message (only spaces too) and the limits 200 / 1000', () => {
    expect(validarTextoAviso({ asunto: '   ', mensaje: '\n \n' }, APROBADA)).toEqual([
      { codigo: 'ASUNTO_VACIO' },
      { codigo: 'MENSAJE_VACIO' },
    ])
    expect(validarTextoAviso({ asunto: 'a'.repeat(200), mensaje: 'b'.repeat(1000) }, APROBADA)).toEqual([])
    expect(validarTextoAviso({ asunto: 'a'.repeat(201), mensaje: 'b'.repeat(1001) }, APROBADA)).toEqual([
      { codigo: 'ASUNTO_DEMASIADO_LARGO' },
      { codigo: 'MENSAJE_DEMASIADO_LARGO' },
    ])
  })

  it('counts like the server: spaces of the subject collapse, the message is trimmed', () => {
    expect(validarTextoAviso({ asunto: `  ${'a'.repeat(100)}   ${'a'.repeat(99)}  `, mensaje: `\n\n${'b'.repeat(1000)}\n\n` }, APROBADA)).toEqual([])
  })
})

describe('error messages («tú»)', () => {
  it('client errors', () => {
    expect(mensajeErrorTexto({ codigo: 'VARIABLE_DESCONOCIDA', variables: ['grupo'] }, 'Aprobada')).toBe(
      '{grupo} no es un dato de «Aprobada». El grupo se conoce al asignarlo; lo avisa «Grupo asignado».',
    )
    expect(mensajeErrorTexto({ codigo: 'VARIABLE_DESCONOCIDA', variables: ['facilitadora'] }, 'Aprobada')).toBe(
      '{facilitadora} no es un dato de «Aprobada». Revisa cómo está escrito o elige uno de la lista.',
    )
    expect(mensajeErrorTexto({ codigo: 'VARIABLE_NO_PERMITIDA_EN_ASUNTO', variables: ['lugar'] }, 'Aprobada')).toBe(
      'El asunto no puede usar {lugar}: a veces falta y el asunto quedaría cortado.',
    )
    expect(mensajeErrorTexto({ codigo: 'LLAVE_SIN_CERRAR' }, 'Aprobada')).toBe('Hay una llave { sin cerrar.')
    expect(mensajeErrorTexto({ codigo: 'ASUNTO_VACIO' }, 'Aprobada')).toBe('El asunto no puede quedar vacío.')
    expect(mensajeErrorTexto({ codigo: 'MENSAJE_DEMASIADO_LARGO' }, 'Aprobada')).toBe('El mensaje supera los 1000 caracteres.')
  })

  it('server errors (22023 codes, permissions, unknown)', () => {
    expect(mensajeErrorServidor({ code: '22023', message: 'VARIABLE_DESCONOCIDA: {grupo}, {x}' })).toBe(
      '{grupo}, {x} no son datos de este aviso. Quítalos o elige uno de la lista.',
    )
    expect(mensajeErrorServidor({ code: '22023', message: 'VARIABLE_DESCONOCIDA: {grupo}' })).toBe(
      '{grupo} no es un dato de este aviso. Quítalo o elige uno de la lista.',
    )
    expect(mensajeErrorServidor({ code: '22023', message: 'VARIABLE_NO_PERMITIDA_EN_ASUNTO: {lugar}' })).toBe(
      'El asunto no puede usar {lugar}: a veces falta y el asunto quedaría cortado.',
    )
    expect(mensajeErrorServidor({ code: '22023', message: 'ASUNTO_DEMASIADO_LARGO' })).toBe('El asunto supera los 200 caracteres.')
    expect(mensajeErrorServidor({ code: '22023', message: 'CLASE_INVALIDA' })).toBe(
      'Esa clase ya no está en la plantilla del taller. Recarga la página.',
    )
    expect(mensajeErrorServidor({ code: '42501', message: 'sin_permisos_para_este_taller' })).toBe(
      'Solo la coordinación o la dirección del taller puede cambiar el texto de sus avisos.',
    )
    expect(mensajeErrorServidor({ message: 'fetch failed' })).toBe('No se pudo guardar. Inténtalo de nuevo.')
  })
})

describe('quitarVariable («Quitar {x}»)', () => {
  it('removes every {x} and tidies the spaces and punctuation left', () => {
    expect(quitarVariable('En unos días te contamos tu grupo: {grupo}.\nHola {grupo} y más', 'grupo')).toBe(
      'En unos días te contamos tu grupo.\nHola y más',
    )
  })
})

describe('renderTextoAviso — mirrors talleres_aviso_texto_render', () => {
  const datos = { nombre: 'Carolina', taller: 'Mujer de Hoy', fecha: 'jueves 8 de octubre', hora: '7:00 p. m.', lugar: '', indicaciones: null }

  it('replaces the variables, drops a line with a missing one and collapses the blank lines', () => {
    expect(
      renderTextoAviso('¡Qué alegría tenerte en {taller}!\n\nNos vemos en {lugar}.\n\n\nEmpieza el {fecha} a las {hora}.\n{indicaciones}', datos),
    ).toBe('¡Qué alegría tenerte en Mujer de Hoy!\n\nEmpieza el jueves 8 de octubre a las 7:00 p. m.')
  })

  it('never doubles the period after a value that ends in one', () => {
    expect(renderTextoAviso('A las {hora}.', datos)).toBe('A las 7:00 p. m.')
  })

  it('a value is never scanned again for variables', () => {
    expect(renderTextoAviso('{nombre}', { nombre: '{taller}', taller: 'X' })).toBe('{taller}')
  })
})

describe('renderPrevio — the preview of the editor', () => {
  it('splits paragraphs, marks values and unknown variables and counts the dropped lines', () => {
    const previo = renderPrevio('Hola {taller}.\nLugar: {lugar}\n\nTu grupo: {grupo}', { taller: 'Mujer de Hoy', lugar: '' }, APROBADA.variables)
    expect(previo.caidas).toBe(1)
    expect(previo.parrafos).toEqual([
      [[{ tipo: 'texto', texto: 'Hola ' }, { tipo: 'valor', texto: 'Mujer de Hoy' }, { tipo: 'texto', texto: '.' }]],
      [[{ tipo: 'texto', texto: 'Tu grupo: ' }, { tipo: 'malo', texto: '{grupo}' }]],
    ])
  })
})

describe('parseTextosAvisos (talleres_avisos_panel.textos)', () => {
  it('reads tipo, clase, texts and who edited it when', () => {
    expect(
      parseTextosAvisos([
        {
          tipo: 'inscripcion_aprobada', clase_id: null, asunto: '¡Ya tienes tu lugar!', mensaje: 'Hola',
          editado_por: 'Neida Castillo', editado_en: '2026-11-04T14:00:00Z',
        },
        { tipo: 'recordatorio_clase', clase_id: 'c2', asunto: 'Mañana', mensaje: 'Clase', editado_por: null, editado_en: '2026-10-28T14:00:00Z' },
        { tipo: 'x' },
      ]),
    ).toEqual([
      { tipo: 'inscripcion_aprobada', claseId: null, asunto: '¡Ya tienes tu lugar!', mensaje: 'Hola', editadoPor: 'Neida Castillo', editadoEn: '2026-11-04T14:00:00Z' },
      { tipo: 'recordatorio_clase', claseId: 'c2', asunto: 'Mañana', mensaje: 'Clase', editadoPor: null, editadoEn: '2026-10-28T14:00:00Z' },
    ])
  })
})

describe('parsePanelAvisos — "textos"', () => {
  it('the panel carries the custom texts; without them, an empty list', () => {
    expect(parsePanelAvisos({ textos: [{ tipo: 'certificado_listo', clase_id: null, asunto: 'A', mensaje: 'B', editado_por: null, editado_en: null }] }).textos).toEqual([
      { tipo: 'certificado_listo', claseId: null, asunto: 'A', mensaje: 'B', editadoPor: null, editadoEn: null },
    ])
    expect(parsePanelAvisos({}).textos).toEqual([])
  })
})
