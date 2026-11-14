/**
 * T16c (odd/tasks/dps-asistencia-pco.md, S14.3; artboard
 * design/dps-avisos-correo 07) — the reminder configuration: reading
 * dps_config_leer().recordatorio / dps_recordatorio_guardar, the 1–7 days
 * rule, and the live preview line «El próximo sale el <día> a las 10:00
 * para el domingo <fecha>: N personas».
 */
import {
  DIAS_RECORDATORIO_POR_DEFECTO,
  fraseProximo,
  leerRecordatorio,
  textoDias,
  textoUltimo,
  validarDiasRecordatorio,
} from '@/lib/platform/dps/recordatorio'

const JSON_RECORDATORIO = {
  activo: true,
  dias: 2,
  hora: '10:00',
  puede_editar: true,
  proximo: { fecha: '2026-11-15', sale: '2026-11-13', personas: 31, con_botones: 7, no_pueden: 2, sin_correo: 1 },
  ultimo: { fecha: '2026-11-06', enviados: 29, total: 30 },
}

describe('leerRecordatorio', () => {
  it('reads the switch, the days, who edits, the next one and the last one', () => {
    expect(leerRecordatorio(JSON_RECORDATORIO)).toEqual({
      activo: true,
      dias: 2,
      hora: '10:00',
      puedeEditar: true,
      proximo: { fecha: '2026-11-15', sale: '2026-11-13', personas: 31, conBotones: 7, noPueden: 2, sinCorreo: 1 },
      ultimo: { fecha: '2026-11-06', enviados: 29, total: 30 },
    })
  })

  it('reads off without a next one, and a bad answer as nothing', () => {
    expect(leerRecordatorio({ activo: false, dias: 3, puede_editar: false, proximo: null, ultimo: null })).toEqual({
      activo: false,
      dias: 3,
      hora: '10:00',
      puedeEditar: false,
      proximo: null,
      ultimo: null,
    })
    expect(leerRecordatorio(null)).toBeNull()
    expect(leerRecordatorio('x')).toBeNull()
  })

  it('keeps the days within 1–7 (2 when unreadable) and never lets a missing flag edit', () => {
    expect(leerRecordatorio({ activo: true, dias: 12 })).toMatchObject({ dias: DIAS_RECORDATORIO_POR_DEFECTO, puedeEditar: false })
    expect(leerRecordatorio({ activo: true })).toMatchObject({ dias: 2 })
  })
})

describe('validarDiasRecordatorio', () => {
  it('takes 1 to 7 and refuses 0, 8, decimals and nothing', () => {
    expect(validarDiasRecordatorio(1)).toEqual({ ok: true, dias: 1 })
    expect(validarDiasRecordatorio(7)).toEqual({ ok: true, dias: 7 })
    for (const malo of [0, 8, 2.5, null, undefined, '3']) {
      expect(validarDiasRecordatorio(malo)).toEqual({ ok: false, mensaje: 'Elige entre 1 y 7 días antes.' })
    }
  })
})

describe('the preview', () => {
  it('says when the next one leaves and how many people get it', () => {
    expect(fraseProximo(leerRecordatorio(JSON_RECORDATORIO)!.proximo!)).toBe('El próximo sale el viernes 13 a las 10:00 para el domingo 15: 31 personas')
  })

  it('says «1 persona» and names the weekday of a plan that is not a Sunday', () => {
    expect(fraseProximo({ fecha: '2026-11-17', sale: '2026-11-16', personas: 1, conBotones: 0, noPueden: 0, sinCorreo: 0 })).toBe(
      'El próximo sale el lunes 16 a las 10:00 para el martes 17: 1 persona',
    )
  })

  it('reads the days and the last send', () => {
    expect(textoDias(1)).toBe('1 día antes')
    expect(textoDias(3)).toBe('3 días antes')
    expect(textoUltimo({ fecha: '2026-11-06', enviados: 29, total: 30 })).toBe('El último salió el viernes 6 a las 10:00: 29 correos.')
    expect(textoUltimo({ fecha: '2026-11-06', enviados: 1, total: 1 })).toBe('El último salió el viernes 6 a las 10:00: 1 correo.')
  })
})
