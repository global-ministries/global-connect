/**
 * Estudiantes — the 4 connections of The Living Room (C7c of
 * odd/tasks/estudiantes-fase-b.md, S21 with L54 / L55; artboards 13 / 14 of
 * design/estudiantes-asistencia, A35–A47): reading
 * estudiantes_reporte_conexiones, the figures of a Personas row and the four
 * cards of the person drawer. Every name is fictitious.
 */
import {
  leerConexionesPersona,
  leerReporteConexiones,
  resumenConexion,
  resumenesConexiones,
  vistaConexiones,
} from '@/lib/platform/estudiantes/conexiones'

const HOY = '2026-11-02'
const RANGO = { desde: '2026-09-08', hasta: HOY, hoy: HOY }

const personaRpc = (parche: Record<string, unknown> = {}) => ({
  persona_id: 'p1',
  nombre: 'Lucía',
  apellido: 'Mendoza',
  grupo_id: 'g1',
  grupo: 'Zona Este · Chicas',
  miembro_desde: '2026-02-10',
  lider: { realizados: 3, por_semana: 0.4, ultimo: '2026-10-21', ultimo_con: 'Carla Suárez', lideres: ['Carla Suárez', 'Irene Paz'], desconectado: false },
  otros: {
    grupo: { reuniones: 8, presentes: 7, ausentes: 1, sin_marcar: 0, porcentaje: 87.5 },
    sirve: true,
    servicios: [
      { servicio_id: 'sv1', equipo_id: 'e1', equipo: 'Luces', area: 'Producción', rol: 'Servidor', esperadas: 4, presentes: 3, justificados: 1, ausentes: 0, porcentaje: 75 },
    ],
  },
  iglesia: { talleres: 2, lista: [{ taller: 'Fundamentos', fecha: '2025-06-20', anio: 2025 }, { taller: 'Identidad', fecha: '2026-03-14', anio: 2026 }] },
  jesus: { registrado: false },
  ...parche,
})

const sinNada = personaRpc({
  persona_id: 'p2',
  nombre: 'Gabriel',
  apellido: 'Rojas',
  grupo: 'Zona Este · Chicos',
  lider: { realizados: 0, por_semana: 0, ultimo: '2026-08-13', ultimo_con: 'Óscar Lugo', lideres: ['Óscar Lugo'], desconectado: true },
  otros: { grupo: { reuniones: 8, presentes: 4, ausentes: 4, sin_marcar: 0, porcentaje: 50 }, sirve: false, servicios: [] },
  iglesia: { talleres: 0, lista: [] },
})

const reporteRpc = (parche: Record<string, unknown> = {}) => ({
  ambito_id: 'tlr',
  campus_id: 'c1',
  subarea_id: null,
  persona_id: null,
  desde: '2026-09-08',
  hasta: HOY,
  semanas: 8,
  desconectado_si_antes_de: '2026-09-03',
  resumen: { personas: 2, desconectados: 1, sin_servicio: 1, con_talleres: 1 },
  personas: [personaRpc(), sinNada],
  ...parche,
})

describe('leerReporteConexiones', () => {
  it('reads the range, the summary and each person with their four connections', () => {
    const r = leerReporteConexiones(reporteRpc())!
    expect(r).toMatchObject({ desde: '2026-09-08', hasta: HOY, semanas: 8, desconectadoSiAntesDe: '2026-09-03', resumen: { personas: 2, desconectados: 1, sinServicio: 1, conTalleres: 1 } })
    expect(r.personas).toHaveLength(2)
    expect(r.personas[0]).toEqual({
      personaId: 'p1',
      nombre: 'Lucía Mendoza',
      grupoId: 'g1',
      grupo: 'Zona Este · Chicas',
      lider: { realizados: 3, porSemana: 0.4, ultimo: '2026-10-21', ultimoCon: 'Carla Suárez', lideres: ['Carla Suárez', 'Irene Paz'], desconectado: false },
      otros: {
        grupo: { reuniones: 8, presentes: 7, ausentes: 1, sinMarcar: 0, porcentaje: 87.5 },
        sirve: true,
        servicios: [{ servicioId: 'sv1', equipo: 'Luces', area: 'Producción', rol: 'Servidor', esperadas: 4, presentes: 3, justificados: 1, ausentes: 0, porcentaje: 75 }],
      },
      iglesia: { talleres: 2, lista: [{ taller: 'Fundamentos', fecha: '2025-06-20', anio: 2025 }, { taller: 'Identidad', fecha: '2026-03-14', anio: 2026 }] },
      jesus: { registrado: false },
    })
  })

  it('is null for a payload that is not a connections report and drops malformed people', () => {
    expect(leerReporteConexiones(null)).toBeNull()
    expect(leerReporteConexiones({ desde: '2026-09-08', hasta: HOY })).toBeNull()
    expect(leerReporteConexiones([])).toBeNull()
    const r = leerReporteConexiones(reporteRpc({ personas: [{ nombre: 'Sin id' }, personaRpc({ lider: null, otros: null, iglesia: null, jesus: null })] }))!
    expect(r.personas).toHaveLength(1)
    // A missing block reads as nothing recorded, never as an error.
    expect(r.personas[0]).toMatchObject({
      lider: { realizados: 0, ultimo: null, lideres: [], desconectado: true },
      otros: { sirve: false, servicios: [], grupo: { porcentaje: null } },
      iglesia: { talleres: 0, lista: [] },
      jesus: { registrado: false },
    })
  })
})

describe('leerConexionesPersona', () => {
  it('takes the one person of a p_persona_id answer', () => {
    expect(leerConexionesPersona(reporteRpc({ persona_id: 'p2', personas: [sinNada] }), 'p2')).toMatchObject({ personaId: 'p2', nombre: 'Gabriel Rojas' })
  })

  it('is null when that person is not in the answer', () => {
    expect(leerConexionesPersona(reporteRpc({ personas: [personaRpc()] }), 'p2')).toBeNull()
    expect(leerConexionesPersona({ boom: true }, 'p1')).toBeNull()
  })
})

describe('resumenConexion / resumenesConexiones (the Personas row, A37)', () => {
  it('has the 1:1 in the range, the desconectado flag (L55), the service and the talleres', () => {
    const [lucia, gabriel] = leerReporteConexiones(reporteRpc())!.personas
    expect(resumenConexion(lucia)).toEqual({ unos: 3, desconectado: false, servicio: { porcentaje: 75, presentes: 3, esperadas: 4 }, talleres: 2 })
    expect(resumenConexion(gabriel)).toEqual({ unos: 0, desconectado: true, servicio: null, talleres: 0 })
  })

  it('adds up two services and has no % without expected dates (O6)', () => {
    const dos = leerReporteConexiones(
      reporteRpc({
        personas: [
          personaRpc({
            otros: {
              grupo: {},
              sirve: true,
              servicios: [
                { servicio_id: 'a', equipo: 'Luces', area: 'Producción', esperadas: 4, presentes: 3, justificados: 1, ausentes: 0, porcentaje: 75 },
                { servicio_id: 'b', equipo: 'Bienvenida', area: null, esperadas: 2, presentes: 0, justificados: 0, ausentes: 2, porcentaje: 0 },
              ],
            },
          }),
          personaRpc({ persona_id: 'p3', otros: { grupo: {}, sirve: true, servicios: [{ servicio_id: 'c', equipo: 'Luces', esperadas: 0, presentes: 0, justificados: 0, ausentes: 0, porcentaje: null }] } }),
        ],
      }),
    )!
    const mapa = resumenesConexiones(dos)
    expect(mapa.get('p1')?.servicio).toEqual({ porcentaje: 50, presentes: 3, esperadas: 6 })
    expect(mapa.get('p3')?.servicio).toEqual({ porcentaje: null, presentes: 0, esperadas: 0 })
  })
})

describe('vistaConexiones (the four cards, A42–A47)', () => {
  it('builds Con su líder, Con otros, Con la Iglesia and Con Jesús in the plan order', () => {
    const v = vistaConexiones(leerReporteConexiones(reporteRpc())!.personas[0], RANGO)
    expect(v.hint).toBe('8 sep – 2 nov · talleres en total')
    expect(v.lider).toEqual({
      titulo: 'Con su líder',
      cantidad: 3,
      etiqueta: '1:1 realizados en el rango',
      alerta: null,
      datos: [
        { etiqueta: 'Por semana', valor: '0,4' },
        { etiqueta: 'El último', valor: '21 oct · hace 1 semana' },
        { etiqueta: 'Su líder', valor: 'Carla Suárez' },
      ],
      nota: 'Los temas del 1:1 todavía no se registran.',
    })
    expect(v.otros).toEqual({
      titulo: 'Con otros',
      filas: [
        { clave: 'grupo', titulo: 'Su grupo', subtitulo: 'Zona Este · Chicas', valor: '88%', detalle: '7 de 8 reuniones', porcentaje: 87.5 },
        { clave: 'sv1', titulo: 'Su servicio', subtitulo: 'Producción · Luces', valor: '75%', detalle: '3 de 4 fechas · 1 justificada', porcentaje: 75 },
      ],
    })
    expect(v.iglesia).toEqual({
      titulo: 'Con la Iglesia',
      cantidad: 2,
      etiqueta: 'talleres completados · en total',
      talleres: [
        { clave: '0|Fundamentos', taller: 'Fundamentos', anio: '2025' },
        { clave: '1|Identidad', taller: 'Identidad', anio: '2026' },
      ],
      vacio: null,
      sinRegistro: { titulo: 'Retiros, CGL e Irresistibles', texto: 'Aún no se registran.' },
    })
    expect(v.jesus).toEqual({
      titulo: 'Con Jesús',
      sinRegistro: { titulo: 'Aún no se registra', texto: 'Las disciplinas privadas que su líder conversa en el 1:1 todavía no se guardan en la app.' },
    })
  })

  it('warns "Sin 1:1 en 2 meses" when disconnected, dates a 1:1 before the range and says who did it', () => {
    const v = vistaConexiones(leerReporteConexiones(reporteRpc())!.personas[1], RANGO)
    expect(v.lider).toMatchObject({
      cantidad: 0,
      etiqueta: '1:1 realizados en el rango',
      alerta: 'Sin 1:1 en 2 meses',
      datos: [
        { etiqueta: 'Por semana', valor: '0' },
        { etiqueta: 'El último', valor: '13 ago · antes del rango' },
        { etiqueta: 'Su líder', valor: 'Óscar Lugo' },
      ],
    })
    expect(v.otros.filas[1]).toEqual({ clave: 'sin-servicio', titulo: 'Su servicio', subtitulo: 'No sirve todavía en el Dream Team', valor: '—', detalle: null, porcentaje: null })
    expect(v.iglesia).toMatchObject({ cantidad: 0, etiqueta: 'talleres completados · en total', talleres: [], vacio: 'Todavía no completó un taller.' })
  })

  it('says "Nunca", falls back to the group leader, one 1:1 / one taller, no meetings and a service without dates', () => {
    const p = leerReporteConexiones(
      reporteRpc({
        personas: [
          personaRpc({
            lider: { realizados: 1, por_semana: 0.1, ultimo: null, ultimo_con: null, lideres: ['Irene Paz'], desconectado: false },
            otros: { grupo: { reuniones: 0, presentes: 0, ausentes: 0, sin_marcar: 0, porcentaje: null }, sirve: true, servicios: [{ servicio_id: 'sv9', equipo: 'Alabanza', area: null, esperadas: 0, presentes: 0, justificados: 0, ausentes: 0, porcentaje: null }] },
            iglesia: { talleres: 1, lista: [{ taller: 'Propósito', fecha: '2026-05-02', anio: 2026 }] },
          }),
        ],
      }),
    )!.personas[0]
    const v = vistaConexiones(p, RANGO)
    expect(v.lider).toMatchObject({ etiqueta: '1:1 realizado en el rango', datos: [{ valor: '0,1' }, { valor: 'Nunca' }, { valor: 'Irene Paz' }] })
    expect(v.otros.filas).toEqual([
      { clave: 'grupo', titulo: 'Su grupo', subtitulo: 'Zona Este · Chicas', valor: '—', detalle: 'sin reuniones en el rango', porcentaje: null },
      { clave: 'sv9', titulo: 'Su servicio', subtitulo: 'Alabanza', valor: '—', detalle: 'sin fechas en el rango', porcentaje: null },
    ])
    expect(v.iglesia.etiqueta).toBe('taller completado · en total')
    const sinLider = vistaConexiones({ ...p, lider: { ...p.lider, lideres: [] } }, RANGO)
    expect(sinLider.lider.datos[2]).toEqual({ etiqueta: 'Su líder', valor: 'Sin líder' })
  })

  it('never uses voseo, "acá" or the plan names Foyer / Living Room / Kitchen (L49)', () => {
    const textos = leerReporteConexiones(reporteRpc())!.personas.map((p) => JSON.stringify(vistaConexiones(p, RANGO))).join(' ')
    expect(textos).not.toMatch(/\b(acá|tenés|podés|querés|sabés|vos)\b/i)
    expect(textos).not.toMatch(/Foyer|Living Room|Kitchen/)
  })
})
