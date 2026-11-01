/**
 * Pure view model of /estudiantes/promocion (C6b3 of
 * odd/tasks/estudiantes-fase-b.md, S11–S15; artboards 09 / 10). The input is
 * the jsonb of estudiantes_promocion_vista
 * (supabase/migrations/20261102100000_estudiantes_promocion.sql) with
 * fictitious people.
 */
import {
  FILTROS_PROMOCION,
  calcularPromocion,
  campusDePromocion,
  codigoErrorPromocion,
  decisionesParaAplicar,
  detallePromocion,
  elegirCampus,
  leerFiltrosPromocion,
  leerResumenPromocion,
  leerVistaPromocion,
  mensajeErrorPromocion,
  urlPromocion,
  type Decisiones,
  type VistaPromocion,
} from '@/lib/platform/estudiantes/promocion'
import type { SubareaGestionable } from '@/lib/platform/estudiantes/grupos-datos'

const TRANSIT = 'a0000000-0000-4000-8000-000000000001'
const IO = 'a0000000-0000-4000-8000-000000000002'
const TLR = 'a0000000-0000-4000-8000-000000000003'
const T_CHICAS = 'b0000000-0000-4000-8000-000000000001'
const T_CHICOS = 'b0000000-0000-4000-8000-000000000002'
const IO_CHICAS = 'b0000000-0000-4000-8000-000000000003'
const IO_CHICOS = 'b0000000-0000-4000-8000-000000000004'
const TLR_CHICAS = 'b0000000-0000-4000-8000-000000000005'
const G_T1 = 'c0000000-0000-4000-8000-000000000001'
const G_T3 = 'c0000000-0000-4000-8000-000000000003'
const G_T7 = 'c0000000-0000-4000-8000-000000000007'
const G_I2 = 'c0000000-0000-4000-8000-000000000012'
const G_I3 = 'c0000000-0000-4000-8000-000000000013'
const CAMPUS = 'd0000000-0000-4000-8000-000000000001'

const destino = (nombre: string, anio: number, ambito: 'Transit' | 'Inside Out', subarea: string, extra: Record<string, unknown> = {}) => ({
  nombre,
  nombre_cambia: true,
  choca: null,
  anio,
  anio_etiqueta: ['', '1er año', '2do año', '3er año', '4to año', '5to año', '6to año'][anio],
  subarea_id: ({ 'Transit|Grupos de Chicas': T_CHICAS, 'Transit|Grupos de Chicos': T_CHICOS, 'Inside Out|Grupos de Chicas': IO_CHICAS, 'Inside Out|Grupos de Chicos': IO_CHICOS } as Record<string, string>)[`${ambito}|${subarea}`],
  subarea,
  ambito_id: ambito === 'Transit' ? TRANSIT : IO,
  ambito,
  ...extra,
})

const integrante = (persona_id: string, nombre: string, apellido: string, anio: number, extra: Record<string, unknown> = {}) => ({
  persona_id,
  nombre,
  apellido,
  estado: 'miembro',
  anio,
  anio_etiqueta: ['', '1er año', '2do año', '3er año', '4to año', '5to año', '6to año'][anio],
  egresa: false,
  anio_nuevo: anio + 1,
  anio_nuevo_etiqueta: ['', '1er año', '2do año', '3er año', '4to año', '5to año', '6to año', ''][anio + 1] || null,
  ...extra,
})

const lider = (servicio_id: string, nombre: string, apellido: string) => ({ servicio_id, persona_id: `p-${servicio_id}`, nombre, apellido, rol: 'Líder' })

function crudo(): Record<string, unknown> {
  return {
    campus: { id: CAMPUS, nombre: 'Campus Norte' },
    bloqueado: false,
    ultima: null,
    ambitos: [
      { ambito_id: TRANSIT, nombre: 'Transit', primer_anio: 1, ultimo_anio: 3, primer_etiqueta: '1er año', ultimo_etiqueta: '3er año' },
      { ambito_id: IO, nombre: 'Inside Out', primer_anio: 4, ultimo_anio: 6, primer_etiqueta: '4to año', ultimo_etiqueta: '6to año' },
    ],
    the_living_room: { ambito_id: TLR, nombre: 'The Living Room' },
    grupos: [
      {
        grupo_id: G_I2,
        nombre: 'Chicas en Acción',
        ambito_id: IO,
        ambito: 'Inside Out',
        subarea_id: IO_CHICAS,
        subarea: 'Grupos de Chicas',
        anio: 5,
        anio_etiqueta: '5to año',
        tipo: 'sube',
        lideres: [lider('s-i2', 'Claudia', 'Mora')],
        miembros: 3,
        visitantes: 0,
        egresan: 1,
        visitantes_egresan: 0,
        suben: 2,
        queda_vacio: false,
        despues: destino('Chicas en Acción', 6, 'Inside Out', 'Grupos de Chicas', { nombre_cambia: false }),
        opciones: null,
        integrantes: [
          integrante('p-31', 'Marcela', 'Rondón', 5, { egresa: true, anio_nuevo: null, anio_nuevo_etiqueta: null }),
          integrante('p-32', 'Celeste', 'Viloria', 5),
          integrante('p-33', 'Juliana', 'Rangel', 5),
        ],
      },
      {
        grupo_id: G_I3,
        nombre: '6to año · Chicas',
        ambito_id: IO,
        ambito: 'Inside Out',
        subarea_id: IO_CHICAS,
        subarea: 'Grupos de Chicas',
        anio: 6,
        anio_etiqueta: '6to año',
        tipo: 'vuelve',
        lideres: [lider('s-i3', 'Mariela', 'Duarte')],
        miembros: 2,
        visitantes: 0,
        egresan: 2,
        visitantes_egresan: 0,
        suben: 0,
        queda_vacio: true,
        despues: destino('4to año · Chicas', 4, 'Inside Out', 'Grupos de Chicas'),
        opciones: null,
        integrantes: [
          integrante('p-41', 'Adriana', 'Belisario', 6, { egresa: true, anio_nuevo: null, anio_nuevo_etiqueta: null }),
          integrante('p-42', 'Verónica', 'Tovar', 6, { egresa: true, anio_nuevo: null, anio_nuevo_etiqueta: null }),
        ],
      },
      {
        grupo_id: G_T1,
        nombre: '1er año · Chicas',
        ambito_id: TRANSIT,
        ambito: 'Transit',
        subarea_id: T_CHICAS,
        subarea: 'Grupos de Chicas',
        anio: 1,
        anio_etiqueta: '1er año',
        tipo: 'sube',
        lideres: [lider('s-t1', 'Fernanda', 'Ochoa')],
        miembros: 10,
        visitantes: 2,
        egresan: 0,
        visitantes_egresan: 0,
        suben: 10,
        queda_vacio: false,
        despues: destino('2do año · Chicas', 2, 'Transit', 'Grupos de Chicas'),
        opciones: null,
        integrantes: [integrante('p-11', 'Bárbara', 'Acosta', 1), integrante('p-12', 'Sofía', 'Linares', 1, { estado: 'visitante' })],
      },
      {
        grupo_id: G_T3,
        nombre: '3er año · Chicas',
        ambito_id: TRANSIT,
        ambito: 'Transit',
        subarea_id: T_CHICAS,
        subarea: 'Grupos de Chicas',
        anio: 3,
        anio_etiqueta: '3er año',
        tipo: 'por_decidir',
        lideres: [lider('s-t3', 'Karla', 'Mujica')],
        miembros: 13,
        visitantes: 1,
        egresan: 0,
        visitantes_egresan: 0,
        suben: 13,
        queda_vacio: false,
        despues: null,
        opciones: {
          pasan_chicos: {
            grupo: destino('1er año · Chicas', 1, 'Transit', 'Grupos de Chicas'),
            nuevo: destino('4to año · Chicas B', 4, 'Inside Out', 'Grupos de Chicas', { choca: '4to año · Chicas' }),
            llegan: 13,
            llegan_visitantes: 1,
          },
          pasa_grupo: {
            grupo: destino('4to año · Chicas B', 4, 'Inside Out', 'Grupos de Chicas', { choca: '4to año · Chicas' }),
            sin_primer_anio: true,
            servicios: [{ ...lider('s-t3', 'Karla', 'Mujica'), rol_destino: 'Líder', turnos: 1, turnos_destino: 1 }],
          },
        },
        integrantes: [
          integrante('p-21', 'Elena', 'Durán', 3, { anio_nuevo: 4, anio_nuevo_etiqueta: '4to año' }),
          integrante('p-22', 'Elisa', 'Cordero', 3, { estado: 'visitante', anio_nuevo: 4, anio_nuevo_etiqueta: '4to año' }),
        ],
      },
      {
        grupo_id: G_T7,
        nombre: '3er año · Chicos',
        ambito_id: TRANSIT,
        ambito: 'Transit',
        subarea_id: T_CHICOS,
        subarea: 'Grupos de Chicos',
        anio: 3,
        anio_etiqueta: '3er año',
        tipo: 'por_decidir',
        lideres: [lider('s-t7a', 'Luis', 'Bastidas'), lider('s-t7b', 'Diego', 'Carrasco')],
        miembros: 12,
        visitantes: 0,
        egresan: 0,
        visitantes_egresan: 0,
        suben: 12,
        queda_vacio: false,
        despues: null,
        opciones: {
          pasan_chicos: {
            grupo: destino('1er año · Chicos', 1, 'Transit', 'Grupos de Chicos'),
            nuevo: destino('4to año · Chicos', 4, 'Inside Out', 'Grupos de Chicos'),
            llegan: 12,
            llegan_visitantes: 0,
          },
          pasa_grupo: {
            grupo: destino('4to año · Chicos', 4, 'Inside Out', 'Grupos de Chicos'),
            sin_primer_anio: true,
            servicios: [
              { ...lider('s-t7a', 'Luis', 'Bastidas'), rol_destino: 'Líder', turnos: 2, turnos_destino: 2 },
              { ...lider('s-t7b', 'Diego', 'Carrasco'), rol_destino: 'Líder', turnos: 1, turnos_destino: 1 },
            ],
          },
        },
        integrantes: [integrante('p-51', 'Gael', 'Hidalgo', 3, { anio_nuevo: 4, anio_nuevo_etiqueta: '4to año' })],
      },
    ],
    egresados: [
      { persona_id: 'p-41', nombre: 'Adriana', apellido: 'Belisario', genero: 'Femenino', grupo_id: G_I3, grupo: '6to año · Chicas', estado: 'miembro', anio: 6, anio_etiqueta: '6to año', anio_final: 6, anio_final_etiqueta: '6to año', destino: { ambito_id: TLR, subarea_id: TLR_CHICAS, subarea: 'Grupos de Chicas' } },
      { persona_id: 'p-31', nombre: 'Marcela', apellido: 'Rondón', genero: 'Femenino', grupo_id: G_I2, grupo: 'Chicas en Acción', estado: 'miembro', anio: 5, anio_etiqueta: '5to año', anio_final: 5, anio_final_etiqueta: '5to año', destino: { ambito_id: TLR, subarea_id: TLR_CHICAS, subarea: 'Grupos de Chicas' } },
      { persona_id: 'p-42', nombre: 'Verónica', apellido: 'Tovar', genero: 'Femenino', grupo_id: G_I3, grupo: '6to año · Chicas', estado: 'miembro', anio: 6, anio_etiqueta: '6to año', anio_final: 6, anio_final_etiqueta: '6to año', destino: { ambito_id: TLR, subarea_id: TLR_CHICAS, subarea: 'Grupos de Chicas' } },
      { persona_id: 'p-61', nombre: 'Tomás', apellido: 'Urbina', genero: null, grupo_id: null, grupo: null, estado: null, anio: 6, anio_etiqueta: '6to año', anio_final: 6, anio_final_etiqueta: '6to año', destino: null },
    ],
    sin_grupo: [
      { persona_id: 'p-71', nombre: 'Rosa', apellido: 'Pérez', anio: 2, anio_etiqueta: '2do año', egresa: false, anio_nuevo: 3, anio_nuevo_etiqueta: '3er año' },
      { persona_id: 'p-61', nombre: 'Tomás', apellido: 'Urbina', anio: 6, anio_etiqueta: '6to año', egresa: true, anio_nuevo: null, anio_nuevo_etiqueta: null },
    ],
    totales: { grupos: 5, integrantes: 40, visitantes: 3, suben: 37, pasan_inside_out: 25, egresan: 4, sin_grupo: 1, por_decidir: 2, quedan_vacios: 1 },
  }
}

type GrupoCrudo = {
  grupo_id: string
  opciones: { pasan_chicos: { nuevo: Record<string, unknown> }; pasa_grupo: { servicios: Record<string, unknown>[] } }
}

const vista = (cambios: (v: Record<string, unknown>) => void = () => {}): VistaPromocion => {
  const v = crudo()
  cambios(v)
  const leida = leerVistaPromocion(v)
  if (!leida) throw new Error('fixture no válida')
  return leida
}

const calcular = (decisiones: Decisiones = {}, filtros = FILTROS_PROMOCION, v: VistaPromocion = vista()) => calcularPromocion({ vista: v, decisiones, filtros })
const AMBAS: Decisiones = { [G_T3]: 'pasan_chicos', [G_T7]: 'pasa_grupo' }

describe('leerVistaPromocion', () => {
  it('reads the preview of the campus', () => {
    const v = vista()
    expect(v.campus).toEqual({ id: CAMPUS, nombre: 'Campus Norte' })
    expect(v.bloqueado).toBe(false)
    expect(v.ambitos.map((a) => a.nombre)).toEqual(['Transit', 'Inside Out'])
    expect(v.grupos).toHaveLength(5)
    expect(v.grupos.find((g) => g.id === G_T7)?.lideres.map((l) => l.nombre)).toEqual(['Luis Bastidas', 'Diego Carrasco'])
    expect(v.egresados[0]).toMatchObject({ personaId: 'p-41', nombre: 'Adriana Belisario', grupo: '6to año · Chicas', anioFinalEtiqueta: '6to año' })
    expect(v.totales).toMatchObject({ grupos: 5, suben: 37, pasanInsideOut: 25, egresan: 4, sinGrupo: 1, porDecidir: 2 })
  })

  it('returns null for anything that is not the preview', () => {
    expect(leerVistaPromocion(null)).toBeNull()
    expect(leerVistaPromocion([])).toBeNull()
    expect(leerVistaPromocion({ campus: null })).toBeNull()
  })

  it('drops a malformed group and keeps the rest', () => {
    const v = vista((c) => {
      ;(c.grupos as unknown[]).push({ nombre: 'Sin id' }, 'x')
    })
    expect(v.grupos).toHaveLength(5)
  })
})

describe('calcularPromocion · summary and metrics', () => {
  it('sums up what the promotion does in the hero', () => {
    expect(calcular().resumen).toEqual({ campus: 'Campus Norte', grupos: 5, suben: 37, pasanInsideOut: 25, egresan: 4 })
  })

  it('shows the four attention metrics, with Por decidir until every 3er año group has a choice', () => {
    const m = calcular().metricas
    expect(m.map((x) => [x.id, x.etiqueta, x.valor, x.total, x.pista, x.tono])).toEqual([
      ['decidir', 'Por decidir', 2, 2, 'Grupos de 3er año sin elegir', 'warning'],
      ['cruzan', 'Pasan a Inside Out', 25, undefined, 'Estudiantes de 3er año de Transit', 'info'],
      ['egresan', 'Egresan', 4, undefined, 'A The Living Room, sin grupo', 'muted'],
      ['vacios', 'Quedan vacíos', 1, 5, 'Con su líder, listos para recibir', 'success'],
    ])
    const decididas = calcular(AMBAS).metricas
    expect(decididas[0].valor).toBe(0)
    expect(decididas[1].pista).toBe('En 1 grupo nuevo sin líder')
    // The 3er año group whose members leave goes back empty to 1er año.
    expect(decididas[3].valor).toBe(2)
  })

  it('marks the pressed metric', () => {
    expect(calcular({}, { ...FILTROS_PROMOCION, metrica: 'egresan' }).metricas.map((m) => m.activa)).toEqual([false, false, true, false])
  })

  it('shows one scope card per ámbito with its flags', () => {
    const [transit, io] = calcular().ambitos
    expect(transit).toMatchObject({ id: TRANSIT, label: 'Transit', subtitulo: '3 grupos · 1er año a 3er año', total: 35, activa: false })
    expect(transit.insignias).toEqual([
      { texto: '2 grupos por decidir', tono: 'warning' },
      { texto: '25 pasan a Inside Out', tono: 'info' },
    ])
    expect(io).toMatchObject({ label: 'Inside Out', subtitulo: '2 grupos · 4to año a 6to año', total: 5 })
    expect(io.insignias).toEqual([{ texto: '4 egresan', tono: 'info' }])
    expect(calcular(AMBAS).ambitos[1].insignias[0]).toEqual({ texto: '1 grupo nuevo sin líder', tono: 'warning' })
  })
})

describe('calcularPromocion · 3er año decisions', () => {
  it('offers both options per 3er año group, named after its sub-área', () => {
    const [chicas, chicos] = calcular().decisiones
    expect(chicas).toMatchObject({ grupoId: G_T3, titulo: '3er año · Chicas', decidido: false, decision: null })
    expect(chicas.ruta).toBe('Grupos de Chicas · Karla Mujica · 13 integrantes y 1 visitante')
    expect(chicas.opciones.map((o) => [o.valor, o.titulo, o.disponible])).toEqual([
      ['pasan_chicos', 'Pasan las chicas', true],
      ['pasa_grupo', 'Pasa el grupo con su líder', true],
    ])
    expect(chicas.opciones[0].descripcion).toBe(
      'Sus 13 integrantes y 1 visitante van a un grupo nuevo de 4to año de Inside Out, sin líder. 3er año · Chicas vuelve a 1er año con Karla Mujica, vacío.',
    )
    expect(chicas.opciones[1].descripcion).toBe('Todo el grupo pasa a Inside Out como 4to año. Karla Mujica empieza a servir en Inside Out.')
    expect(chicos.opciones[0].titulo).toBe('Pasan los chicos')
    expect(chicos.ruta).toBe('Grupos de Chicos · Luis Bastidas y Diego Carrasco · 12 integrantes')
    expect(chicos.opciones[1].descripcion).toContain('Luis Bastidas y Diego Carrasco empiezan a servir en Inside Out.')
  })

  it('explains option (a): the new group without leader, its " B" name, and the group going back to 1er año', () => {
    const tarjeta = calcular({ [G_T3]: 'pasan_chicos' }).decisiones[0]
    expect(tarjeta).toMatchObject({ decidido: true, decision: 'pasan_chicos' })
    expect(tarjeta.avisos).toEqual([
      {
        tono: 'info',
        titulo: '→ Inside Out · 4to año · Chicas (grupo nuevo, sin líder)',
        texto: 'Se llamará «4to año · Chicas B»: «4to año · Chicas» ya es el grupo que hoy es 6to año. Asígnale líder después en Grupos.',
      },
    ])
    expect(tarjeta.nota).toBe('3er año · Chicas queda como 1er año · Chicas en Transit, con Karla Mujica y sin integrantes, para quienes llegan de Niños.')
  })

  it('explains option (b): the leaders move with their turnos, the " B" name and the Transit sub-área left without 1er año', () => {
    const chicas = calcular({ [G_T3]: 'pasa_grupo' }).decisiones[0]
    expect(chicas.avisos).toEqual([
      { tono: 'marca', titulo: null, texto: 'Karla Mujica deja de servir en Transit · Grupos de Chicas y empieza en Inside Out · Grupos de Chicas, con sus mismos turnos.' },
      { tono: 'warning', titulo: null, texto: 'Transit se queda sin grupo de 1er año · Chicas para quienes llegan de Niños. Puedes crearlo después en Grupos.' },
    ])
    expect(chicas.nota).toBe('El grupo queda como 4to año · Chicas B: «4to año · Chicas» ya es el grupo que hoy es 6to año.')
    const chicos = calcular({ [G_T7]: 'pasa_grupo' }).decisiones[1]
    expect(chicos.avisos[0].texto).toBe(
      'Luis Bastidas y Diego Carrasco dejan de servir en Transit · Grupos de Chicos y empiezan en Inside Out · Grupos de Chicos, con sus mismos turnos.',
    )
    expect(chicos.nota).toBeNull()
  })

  it('does not warn about 1er año when another 3er año group of the sub-área goes back to it', () => {
    const v = vista((c) => {
      const grupos = c.grupos as Record<string, unknown>[]
      const otro = { ...grupos.find((g) => g.grupo_id === G_T3)!, grupo_id: 'c0000000-0000-4000-8000-000000000033', nombre: '3er año · Chicas B' }
      grupos.push(otro)
    })
    const tarjeta = calcular({ [G_T3]: 'pasa_grupo', 'c0000000-0000-4000-8000-000000000033': 'pasan_chicos' }, FILTROS_PROMOCION, v).decisiones.find((d) => d.grupoId === G_T3)!
    expect(tarjeta.avisos.map((a) => a.tono)).toEqual(['marca'])
  })

  it('says when only some turnos carry over to Inside Out', () => {
    const v = vista((c) => {
      const g = (c.grupos as GrupoCrudo[]).find((x) => x.grupo_id === G_T3)!
      g.opciones.pasa_grupo.servicios[0].turnos = 2
      g.opciones.pasa_grupo.servicios[0].turnos_destino = 1
    })
    expect(calcular({ [G_T3]: 'pasa_grupo' }, FILTROS_PROMOCION, v).decisiones[0].avisos[0].texto).toBe(
      'Karla Mujica deja de servir en Transit · Grupos de Chicas y empieza en Inside Out · Grupos de Chicas, con 1 de sus 2 turnos.',
    )
  })

  it('disables an option Inside Out cannot take and keeps the group pending', () => {
    const v = vista((c) => {
      const g = (c.grupos as GrupoCrudo[]).find((x) => x.grupo_id === G_T7)!
      g.opciones.pasa_grupo.servicios[1].rol_destino = null
      g.opciones.pasan_chicos.nuevo.subarea_id = null
      g.opciones.pasan_chicos.nuevo.nombre = null
    })
    const r = calcular({ [G_T7]: 'pasa_grupo' }, FILTROS_PROMOCION, v)
    const [a, b] = r.decisiones[1].opciones
    expect(a).toMatchObject({ disponible: false, motivo: 'Inside Out no tiene «Grupos de Chicos». Créalo en Estructura o elige la otra opción.' })
    expect(b).toMatchObject({ disponible: false, motivo: 'Inside Out · Grupos de Chicos no tiene el rol «Líder» de Diego Carrasco. Créalo en Estructura o elige la otra opción.' })
    expect(r.decisiones[1].decidido).toBe(false)
    expect(r.pendientes).toEqual(['3er año · Chicas', '3er año · Chicos'])
  })
})

describe('calcularPromocion · confirm', () => {
  it('keeps "Promover temporada" disabled with a status line until every 3er año group is decided', () => {
    const r = calcular({ [G_T3]: 'pasa_grupo' })
    expect(r.puedeConfirmar).toBe(false)
    expect(r.estadoPie).toBe('Falta decidir 1 grupo de 3er año: 3er año · Chicos.')
    expect(calcular().estadoPie).toBe('Falta decidir 2 grupos de 3er año: 3er año · Chicas y 3er año · Chicos.')
    expect(calcular().pistaDecisiones).toBe('2 por decidir · obligatorio para confirmar')
    const listo = calcular(AMBAS)
    expect(listo.puedeConfirmar).toBe(true)
    expect(listo.estadoPie).toBe('Todo listo. Al confirmar verás el resumen antes de aplicar.')
    expect(listo.pistaDecisiones).toBe('Todo decidido')
  })

  it('sends one decision per 3er año group, nothing while one is missing', () => {
    expect(decisionesParaAplicar(vista(), { [G_T3]: 'pasan_chicos' })).toBeNull()
    expect(decisionesParaAplicar(vista(), { ...AMBAS, 'c-otro': 'pasa_grupo' })).toEqual(AMBAS)
    expect(decisionesParaAplicar(vista((c) => (c.bloqueado = true)), AMBAS)).toBeNull()
  })

  it('lists the totals and each decision in the confirmation', () => {
    const c = calcular(AMBAS).confirmacion
    expect(c.titulo).toBe('¿Promover Campus Norte?')
    expect(c.descripcion).toBe('Transit e Inside Out suben un año ahora mismo. No se puede deshacer desde la app.')
    expect(c.lineas).toEqual([
      { icono: 'subir', texto: '5 grupos y 37 estudiantes suben un año.' },
      { icono: 'flecha', texto: '3er año · Chicas: pasan las chicas a 4to año · Chicas B, grupo nuevo de Inside Out sin líder; el grupo vuelve a 1er año con Karla Mujica.' },
      { icono: 'flecha', texto: '3er año · Chicos: pasa entero a Inside Out como 4to año · Chicos, con Luis Bastidas y Diego Carrasco.' },
      { icono: 'grupo', texto: 'Se crea 1 grupo nuevo en Inside Out, sin líder: 4to año · Chicas B.' },
      { icono: 'egresan', texto: '4 egresan a The Living Room, sin grupo.' },
      { icono: 'grupo', texto: '1 estudiante sin grupo sube de año en su ficha.' },
    ])
  })
})

describe('calcularPromocion · groups "Grupo hoy → Queda como"', () => {
  it('lists the groups by ámbito and sub-área, by año', () => {
    const { bloques } = calcular()
    expect(bloques.map((b) => b.titulo)).toEqual(['Transit · Grupos de Chicas', 'Transit · Grupos de Chicos', 'Inside Out · Grupos de Chicas'])
    expect(bloques[0].filas.map((f) => f.hoy.nombre)).toEqual(['1er año · Chicas', '3er año · Chicas'])
    expect(bloques[2].filas.map((f) => f.hoy.nombre)).toEqual(['Chicas en Acción', '6to año · Chicas'])
  })

  it('shows what each group becomes', () => {
    const filas = calcular().bloques.flatMap((b) => b.filas)
    const fila = (id: string) => filas.find((f) => f.id === id)!
    expect(fila(G_T1)).toMatchObject({
      hoy: { nombre: '1er año · Chicas', detalle: '1er año · Fernanda Ochoa', sinLider: false },
      quedaComo: { nombre: '2do año · Chicas', detalle: 'Transit · 2do año', pendiente: false },
      integrantes: 10,
      cifra: 'y 2 visitantes',
    })
    expect(fila(G_I2)).toMatchObject({ quedaComo: { nombre: 'Chicas en Acción', detalle: 'Inside Out · 6to año · el nombre no cambia' }, cifra: '1 egresa · 2 suben' })
    expect(fila(G_I3)).toMatchObject({ quedaComo: { nombre: '4to año · Chicas', detalle: 'Inside Out · 4to año · vacío, con su líder' }, cifra: '2 egresan' })
    expect(fila(G_I3).insignias).toEqual([
      { texto: '2 egresan', tono: 'default' },
      { texto: 'Queda vacío', tono: 'success' },
    ])
    expect(fila(G_T3)).toMatchObject({ quedaComo: { nombre: 'Falta decidir', detalle: 'Elige qué pasa en la tarjeta del grupo', pendiente: true }, cifra: '13 pasan a Inside Out' })
    expect(fila(G_T3).insignias).toEqual([
      { texto: 'Por decidir', tono: 'warning' },
      { texto: 'Pasa a Inside Out', tono: 'info' },
    ])
  })

  it('adds the new group of option (a) at the end of its Inside Out block', () => {
    const { bloques, pie } = calcular({ [G_T3]: 'pasan_chicos' })
    const transit = bloques[0].filas.find((f) => f.id === G_T3)!
    expect(transit).toMatchObject({ quedaComo: { nombre: '1er año · Chicas', detalle: 'Transit · 1er año · vacío, con su líder' }, cifra: '13 pasan a 4to año · Chicas B' })
    expect(transit.insignias).toEqual([{ texto: 'Queda vacío', tono: 'success' }])
    const io = bloques[2].filas
    expect(io.at(-1)).toMatchObject({
      id: `nuevo:${G_T3}`,
      nuevo: true,
      hoy: { nombre: 'Grupo nuevo', detalle: 'Se crea al promover' },
      quedaComo: { nombre: '4to año · Chicas B', detalle: 'Inside Out · 4to año', sinLider: true },
      integrantes: 13,
      cifra: 'llegan de 3er año · Chicas',
      etiqueta: 'Abrir 4to año · Chicas B (grupo nuevo)',
    })
    expect(io.at(-1)!.insignias).toEqual([
      { texto: 'Grupo nuevo', tono: 'info' },
      { texto: 'Sin líder', tono: 'warning' },
    ])
    expect(pie).toEqual({ resumen: '6 de 6 grupos (1 nuevo) · 40 integrantes', sinGrupo: 'Además, 1 estudiante sin grupo sube de año en su ficha' })
  })

  it('shows option (b) as the group crossing with its leader', () => {
    const fila = calcular({ [G_T7]: 'pasa_grupo' }).bloques[1].filas[0]
    expect(fila.quedaComo).toMatchObject({ nombre: '4to año · Chicos', detalle: 'Inside Out · 4to año · con su líder' })
    expect(fila.insignias).toEqual([{ texto: 'Pasa a Inside Out', tono: 'info' }])
  })

  it('filters by metric, ámbito and search (group, leader or student)', () => {
    const ids = (filtros: Partial<typeof FILTROS_PROMOCION>, d: Decisiones = {}) =>
      calcular(d, { ...FILTROS_PROMOCION, ...filtros }).bloques.flatMap((b) => b.filas.map((f) => f.id))
    expect(ids({ metrica: 'decidir' })).toEqual([G_T3, G_T7])
    expect(ids({ metrica: 'cruzan' }, { [G_T3]: 'pasan_chicos' })).toEqual([G_T3, G_T7, `nuevo:${G_T3}`])
    expect(ids({ metrica: 'egresan' })).toEqual([G_I2, G_I3])
    expect(ids({ metrica: 'vacios' })).toEqual([G_I3])
    expect(ids({ ambito: IO })).toEqual([G_I2, G_I3])
    expect(ids({ q: 'mujica' })).toEqual([G_T3])
    expect(ids({ q: 'BARBARA' })).toEqual([G_T1])
    const vacio = calcular({}, { ...FILTROS_PROMOCION, q: 'nadie' })
    expect(vacio.bloques).toEqual([])
    expect(vacio.pie.resumen).toBe('0 de 5 grupos · 0 integrantes')
  })
})

describe('calcularPromocion · graduates', () => {
  it('lists who graduates with their The Living Room destination', () => {
    const { egresados, pieEgresados } = calcular()
    expect(egresados.map((e) => e.nombre)).toEqual(['Adriana Belisario', 'Marcela Rondón', 'Verónica Tovar', 'Tomás Urbina'])
    expect(egresados[0]).toEqual({
      personaId: 'p-41',
      nombre: 'Adriana Belisario',
      grupo: '6to año · Chicas',
      grupoDetalle: 'Inside Out · 6to año',
      anioFinal: '6to año',
      pasaA: 'The Living Room · Sin grupo · Chicas',
      pasaADetalle: 'Un director de The Living Room le asigna grupo',
    })
    expect(egresados[3]).toMatchObject({ grupo: 'Sin grupo', grupoDetalle: 'Inside Out · 6to año', pasaA: 'The Living Room · Sin grupo' })
    expect(pieEgresados).toBe('4 de 4 · los grupos de 6to año quedan con su líder en 4to año')
  })

  it('filters graduates by ámbito and search', () => {
    expect(calcular({}, { ...FILTROS_PROMOCION, ambito: TRANSIT }).egresados).toEqual([])
    expect(calcular({}, { ...FILTROS_PROMOCION, q: 'acción' }).egresados.map((e) => e.nombre)).toEqual(['Marcela Rondón'])
  })
})

describe('calcularPromocion · blocked', () => {
  it('shows the last promotion, who did it and the next date', () => {
    const v = vista((c) => {
      c.bloqueado = true
      c.ultima = {
        promocion_id: 'e1',
        aplicada_at: '2026-09-14T13:15:00+00:00',
        por: { persona_id: 'p-99', nombre: 'Rosa', apellido: 'Díaz' },
        proxima: '2027-03-13',
        resumen: { grupos: 13, renombrados: 10, egresan: 16, fichas_suben: 115, fichas_creadas: 2, miembros_movidos: 13, servicios_retirados: 2, servicios_abiertos: 2, grupos_nuevos: [{ grupo_id: 'n1', nombre: '4to año · Chicas B' }], pasan_grupo: [] },
      }
    })
    const r = calcular(AMBAS, FILTROS_PROMOCION, v)
    expect(r.puedeConfirmar).toBe(false)
    expect(r.bloqueado).toEqual({
      titulo: 'Ya se promovió este campus el 14 sep 2026',
      fecha: '14 sep 2026',
      texto:
        'Lo hizo Rosa Díaz a las 9:15. La próxima promoción de Campus Norte se habilita el 13 mar 2027, 180 días después. Se guardó una copia de cómo estaba todo; si algo salió mal, pide ayuda en Soporte.',
      datos: [
        { etiqueta: 'Grupos que subieron', valor: 13 },
        { etiqueta: 'Fichas que subieron de año', valor: 115 },
        { etiqueta: 'Grupos nuevos sin líder', valor: 1 },
        { etiqueta: 'Egresaron a The Living Room', valor: 16 },
      ],
    })
  })

  it('is not blocked while the campus can be promoted', () => {
    expect(calcular().bloqueado).toBeNull()
  })
})

describe('detallePromocion', () => {
  it('previews a pending group with its members and visitors', () => {
    const d = detallePromocion(vista(), {}, G_T3)!
    expect(d).toMatchObject({ titulo: '3er año · Chicas', meta: 'Transit · Grupos de Chicas · 3er año', pendiente: true, grupoDecision: G_T3 })
    expect(d.datos).toEqual([
      { etiqueta: 'Hoy', valor: '3er año' },
      { etiqueta: 'Después', valor: '—' },
      { etiqueta: 'Integrantes', valor: 13 },
      { etiqueta: 'Egresan', valor: 0 },
    ])
    expect(d.quedaComo).toBeNull()
    expect(d.integrantes).toEqual([{ personaId: 'p-21', nombre: 'Elena Durán', detalle: '3er año → 4to año · Inside Out', egresa: false }])
    expect(d.visitantes).toEqual([{ personaId: 'p-22', nombre: 'Elisa Cordero', detalle: 'Visitante · se mueve con el grupo', egresa: false }])
  })

  it('previews a group that moves up and who graduates from it', () => {
    const d = detallePromocion(vista(), {}, G_I2)!
    expect(d.quedaComo).toEqual({ nombre: 'Chicas en Acción', detalle: 'Inside Out · 6to año · el nombre no cambia', nota: 'Sigue con Claudia Mora.' })
    expect(d.integrantes[0]).toEqual({ personaId: 'p-31', nombre: 'Marcela Rondón', detalle: 'Año final 5to año · pasa a The Living Room', egresa: true })
    expect(d.integrantes[1].detalle).toBe('5to año → 6to año')
  })

  it('previews the new group of option (a)', () => {
    const d = detallePromocion(vista(), { [G_T3]: 'pasan_chicos' }, `nuevo:${G_T3}`)!
    expect(d).toMatchObject({ titulo: '4to año · Chicas B', meta: 'Inside Out · Grupos de Chicas · grupo nuevo', pendiente: false, sinLider: true })
    expect(d.datos).toEqual([
      { etiqueta: 'Hoy', valor: 'No existe' },
      { etiqueta: 'Después', valor: '4to año' },
      { etiqueta: 'Integrantes', valor: 13 },
      { etiqueta: 'Llegan de', valor: '3er año · Chicas' },
    ])
    expect(d.integrantes[0].detalle).toBe('3er año · Transit → 4to año · Inside Out')
    expect(detallePromocion(vista(), {}, `nuevo:${G_T3}`)).toBeNull()
  })

  it('previews the crossing group with its leaders', () => {
    const d = detallePromocion(vista(), { [G_T7]: 'pasa_grupo' }, G_T7)!
    expect(d.quedaComo?.nota).toBe('Luis Bastidas y Diego Carrasco empiezan a servir en Inside Out · Grupos de Chicos.')
  })
})

describe('errors', () => {
  it.each([
    ['sin_autoridad', '42501', 'No tienes permiso para promover este campus.'],
    ['campus_invalido', '22023', 'Ese campus ya no está activo. Recarga la página.'],
    ['escala_invalida', '22023', 'Este campus no tiene la escala de años de Transit e Inside Out. Pide que la configuren antes de promover.'],
    ['promocion_reciente', '22023', 'Este campus ya se promovió hace menos de 180 días. Recarga la página para ver cuándo se habilita.'],
    ['decision_invalida', '22023', 'Cambiaron los grupos de 3er año. Recarga la página y vuelve a decidir.'],
    ['subarea_invalida', '22023', 'Inside Out no tiene la sub-área a la que pasaría un grupo. Créala en Estructura o elige la otra opción.'],
    ['rol_invalido', '22023', 'Un líder no tiene su mismo rol en Inside Out. Créalo en Estructura o elige la otra opción.'],
  ])('explains %s', (codigo, code, texto) => {
    expect(codigoErrorPromocion({ code, message: codigo })).toBe(codigo)
    expect(mensajeErrorPromocion({ code, message: codigo })).toBe(texto)
  })

  it('reads a bare 42501 as sin_autoridad and falls back for anything else', () => {
    expect(codigoErrorPromocion({ code: '42501', message: 'permission denied' })).toBe('sin_autoridad')
    expect(mensajeErrorPromocion({ code: 'XX000', message: 'boom' })).toBe('No se pudo promover. Inténtalo de nuevo.')
  })
})

describe('resumen of aplicar', () => {
  it('reads the summary the RPC returns', () => {
    expect(
      leerResumenPromocion({ grupos: 5, egresan: 4, fichas_suben: 30, grupos_nuevos: [{ grupo_id: 'n1', nombre: '4to año · Chicas B' }], aplicada_at: '2026-11-01T14:42:00+00:00', proxima: '2027-04-30' }),
    ).toMatchObject({ grupos: 5, egresan: 4, fichasSuben: 30, gruposNuevos: ['4to año · Chicas B'], aplicadaAt: '2026-11-01T14:42:00+00:00', proxima: '2027-04-30' })
    expect(leerResumenPromocion(null)).toBeNull()
  })
})

describe('campus', () => {
  const subarea = (campusId: string, campus: string, experiencia: 'estudiantes' | 'the_living_room'): SubareaGestionable => ({
    subareaId: `${campusId}-${experiencia}`,
    subarea: 'Grupos de Chicas',
    ambitoId: experiencia,
    ambito: experiencia === 'estudiantes' ? 'Transit' : 'The Living Room',
    experiencia,
    campusId,
    campus,
    responsables: [],
  })

  it('offers the campuses where the caller manages Transit or Inside Out, by name', () => {
    expect(
      campusDePromocion([subarea('c2', 'Oeste', 'estudiantes'), subarea('c1', 'Norte', 'estudiantes'), subarea('c1', 'Norte', 'estudiantes'), subarea('c3', 'Sur', 'the_living_room')]),
    ).toEqual([
      { id: 'c1', nombre: 'Norte' },
      { id: 'c2', nombre: 'Oeste' },
    ])
  })

  it('opens the requested campus when it is one of them, else the first', () => {
    const campus = [
      { id: 'c1', nombre: 'Norte' },
      { id: 'c2', nombre: 'Oeste' },
    ]
    expect(elegirCampus(campus, 'c2')).toEqual(campus[1])
    expect(elegirCampus(campus, 'otro')).toEqual(campus[0])
    expect(elegirCampus(campus, undefined)).toEqual(campus[0])
  })
})

describe('URL', () => {
  it('reads ?ambito&metrica&q and ignores an unknown metric', () => {
    expect(leerFiltrosPromocion({ ambito: IO, metrica: 'egresan', q: 'ana' })).toEqual({ ambito: IO, metrica: 'egresan', q: 'ana' })
    expect(leerFiltrosPromocion({ metrica: 'otra', ambito: ['a', 'b'] })).toEqual({ ambito: 'a', metrica: null, q: '' })
    expect(leerFiltrosPromocion({})).toEqual(FILTROS_PROMOCION)
  })

  it('writes the campus and the active filters', () => {
    expect(urlPromocion(CAMPUS, FILTROS_PROMOCION)).toBe(`/estudiantes/promocion?campus=${CAMPUS}`)
    expect(urlPromocion(null, { ambito: IO, metrica: 'vacios', q: ' ana ' })).toBe(`/estudiantes/promocion?ambito=${IO}&metrica=vacios&q=ana`)
    expect(urlPromocion(null, FILTROS_PROMOCION)).toBe('/estudiantes/promocion')
  })
})
