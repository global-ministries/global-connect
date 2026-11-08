/**
 * Niños › Salones (odd/tasks/ninos-checkin-pco.md, T1d, S5, S8.3, S8.4):
 * reading the salones and carpetas, the checks of the rules and of the salón's
 * data, the texts of the screen, «Probar reglas» and the server actions (input
 * checks, RPC and table arguments, the RPC HINT shown as is).
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()
const tabla = {
  update: jest.fn(),
  insert: jest.fn(),
  select: jest.fn(),
  eq: jest.fn(),
  order: jest.fn(),
  limit: jest.fn(),
}
const from = jest.fn(() => tabla)

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc, from }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import { crearSalon, guardarCarpeta, guardarDatosSalon, guardarReglasSalon } from '@/lib/actions/ninos-salones.actions'
import {
  carpetaDe,
  leerCarpetas,
  leerDiaMes,
  leerSalones,
  mensajeErrorSalones,
  probarReglas,
  reglasDe,
  resumenSalones,
  textoDiaMes,
  textoEdad,
  textoQuienEntra,
  textoVoluntarios,
  validarDatosSalon,
  validarReglas,
  voluntariosNecesarios,
  type ReglasSalon,
  type SalonAdmin,
} from '@/lib/platform/ninos/salones-reglas'

const CAMPUS = '11111111-1111-4111-8111-111111111111'
const SALON = '22222222-2222-4222-8222-222222222222'
const EQUIPO = '33333333-3333-4333-8333-333333333333'

const fila = (o: Record<string, unknown> = {}) => ({
  id: SALON,
  campus_id: CAMPUS,
  equipo_id: EQUIPO,
  area: 'waumba',
  nombre: 'Preescolar II',
  capacidad: 20,
  edad_min_meses: 36,
  edad_max_meses: 47,
  grado_min: null,
  grado_max: null,
  es_necesidades_especiales: false,
  orden: 30,
  activo: true,
  cupo_visitantes: 2,
  ninos_por_voluntario: 5,
  min_voluntarios: 2,
  abierto: true,
  opcion_panal: false,
  opcion_merienda: true,
  corte_mes: null,
  corte_dia: null,
  promocion_mes: null,
  promocion_dia: null,
  ...o,
})

const salon = (o: Record<string, unknown> = {}): SalonAdmin => leerSalones([fila(o)])[0]

const REGLAS: ReglasSalon = {
  cupoVisitantes: 2,
  ninosPorVoluntario: 5,
  minVoluntarios: 2,
  abierto: true,
  opcionPanal: false,
  opcionMerienda: true,
  corteMes: null,
  corteDia: null,
  promocionMes: null,
  promocionDia: null,
}

describe('leerSalones and leerCarpetas', () => {
  it('reads every column of a salón', () => {
    expect(salon({ corte_mes: 12, corte_dia: 1, promocion_mes: 8, promocion_dia: 1 })).toEqual({
      id: SALON,
      campusId: CAMPUS,
      equipoId: EQUIPO,
      area: 'waumba',
      nombre: 'Preescolar II',
      capacidad: 20,
      edadMinMeses: 36,
      edadMaxMeses: 47,
      gradoMin: null,
      gradoMax: null,
      esNecesidadesEspeciales: false,
      orden: 30,
      activo: true,
      cupoVisitantes: 2,
      ninosPorVoluntario: 5,
      minVoluntarios: 2,
      abierto: true,
      opcionPanal: false,
      opcionMerienda: true,
      corteMes: 12,
      corteDia: 1,
      promocionMes: 8,
      promocionDia: 1,
    })
  })

  it('reads a salón saved before the rules with their defaults, drops rows it cannot trust and sorts by orden', () => {
    const viejo = { ...fila({ id: 'b', orden: 10 }) } as Record<string, unknown>
    for (const k of ['cupo_visitantes', 'ninos_por_voluntario', 'min_voluntarios', 'abierto', 'opcion_panal', 'opcion_merienda']) delete viejo[k]
    const leidos = leerSalones([fila({ id: 'a', orden: 20 }), viejo, fila({ id: null }), fila({ area: 'otra' }), 'x'])
    expect(leidos.map((s) => s.id)).toEqual(['b', 'a'])
    expect(leidos[0]).toMatchObject({ cupoVisitantes: 0, ninosPorVoluntario: null, minVoluntarios: 0, abierto: true, opcionPanal: false, opcionMerienda: false })
    expect(leerSalones(null)).toEqual([])
  })

  it('reads the carpetas and gives an area without a row the table defaults', () => {
    const carpetas = leerCarpetas([{ area: 'upstreet', distribucion: 'equilibrada', mantener_regulares: false }, { area: 'x' }])
    expect(carpetas).toEqual([{ area: 'upstreet', distribucion: 'equilibrada', mantenerRegulares: false }])
    expect(carpetaDe(carpetas, 'upstreet')).toEqual({ area: 'upstreet', distribucion: 'equilibrada', mantenerRegulares: false })
    expect(carpetaDe(carpetas, 'waumba')).toEqual({ area: 'waumba', distribucion: 'en_orden', mantenerRegulares: true })
  })
})

describe('mensajeErrorSalones', () => {
  it('shows the HINT of the RPC as is', () => {
    expect(mensajeErrorSalones({ message: 'cupo_invalido', hint: 'El cupo de visitantes va de 0 a 500.' })).toBe('El cupo de visitantes va de 0 a 500.')
  })

  it('explains a refusal of the table and falls back to a Spanish sentence', () => {
    expect(mensajeErrorSalones({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe('Ya hay un salón con ese nombre en este campus.')
    expect(mensajeErrorSalones({ code: '42501', message: 'new row violates row-level security policy' })).toBe('No tienes permiso para configurar este salón.')
    expect(mensajeErrorSalones({ message: 'sin_autoridad' })).toBe('No tienes permiso para configurar este salón.')
    expect(mensajeErrorSalones({ message: 'salon_no_encontrado' })).toBe('El salón no existe.')
    expect(mensajeErrorSalones({ message: 'boom' })).toBe('No se pudo guardar. Inténtalo de nuevo.')
    expect(mensajeErrorSalones(null)).toBe('No se pudo guardar. Inténtalo de nuevo.')
  })
})

describe('validarReglas', () => {
  it('accepts the rules of a salón', () => {
    expect(validarReglas(REGLAS)).toBeNull()
    expect(validarReglas({ ...REGLAS, ninosPorVoluntario: null, minVoluntarios: 0, cupoVisitantes: 0 })).toBeNull()
    expect(validarReglas({ ...REGLAS, corteMes: 2, corteDia: 29, promocionMes: 8, promocionDia: 1 })).toBeNull()
  })

  it('says what to fix with the RPC sentences', () => {
    expect(validarReglas({ ...REGLAS, cupoVisitantes: 501 })).toBe('El cupo de visitantes va de 0 a 500.')
    expect(validarReglas({ ...REGLAS, cupoVisitantes: -1 })).toBe('El cupo de visitantes va de 0 a 500.')
    expect(validarReglas({ ...REGLAS, cupoVisitantes: 1.5 })).toBe('El cupo de visitantes va de 0 a 500.')
    expect(validarReglas({ ...REGLAS, ninosPorVoluntario: 0 })).toBe('Niños por voluntario va de 1 a 100 y el mínimo de voluntarios de 0 a 50.')
    expect(validarReglas({ ...REGLAS, minVoluntarios: 51 })).toBe('Niños por voluntario va de 1 a 100 y el mínimo de voluntarios de 0 a 50.')
    expect(validarReglas({ ...REGLAS, corteMes: 2, corteDia: 30 })).toBe('La fecha de corte necesita un día y un mes válidos.')
    expect(validarReglas({ ...REGLAS, corteMes: 12, corteDia: null })).toBe('La fecha de corte necesita un día y un mes válidos.')
    expect(validarReglas({ ...REGLAS, promocionMes: 13, promocionDia: 1 })).toBe('La fecha de promoción necesita un día y un mes válidos.')
  })
})

describe('validarDatosSalon', () => {
  const datos = { nombre: 'Preescolar II', capacidad: 20, edadMinMeses: 36, edadMaxMeses: 47, gradoMin: null, gradoMax: null }

  it('accepts a name, a quota and the ranges, each end optional', () => {
    expect(validarDatosSalon(datos)).toBeNull()
    expect(validarDatosSalon({ ...datos, edadMinMeses: null, edadMaxMeses: null, gradoMin: 1, gradoMax: 1 })).toBeNull()
    expect(validarDatosSalon({ ...datos, edadMinMeses: 36, edadMaxMeses: 36 })).toBeNull()
  })

  it('says what to fix', () => {
    expect(validarDatosSalon({ ...datos, nombre: '  ' })).toBe('El salón necesita un nombre de hasta 80 caracteres.')
    expect(validarDatosSalon({ ...datos, nombre: 'x'.repeat(81) })).toBe('El salón necesita un nombre de hasta 80 caracteres.')
    expect(validarDatosSalon({ ...datos, capacidad: 0 })).toBe('El cupo de regulares va de 1 a 500.')
    expect(validarDatosSalon({ ...datos, edadMinMeses: 48, edadMaxMeses: 47 })).toBe('La edad «desde» no puede ser mayor que «hasta».')
    expect(validarDatosSalon({ ...datos, edadMaxMeses: 216 })).toBe('Escribe la edad en meses, de 0 a 215: 5 años son 60 meses.')
    expect(validarDatosSalon({ ...datos, gradoMin: 13 })).toBe('El grado va de 0 (preescolar) a 12.')
    expect(validarDatosSalon({ ...datos, gradoMin: 6, gradoMax: 5 })).toBe('El grado «desde» no puede ser mayor que «hasta».')
  })
})

describe('texts of the screen', () => {
  it('says ages in years and months', () => {
    expect(textoEdad(0)).toBe('0 meses')
    expect(textoEdad(1)).toBe('1 mes')
    expect(textoEdad(12)).toBe('1 año')
    expect(textoEdad(50)).toBe('4 años 2 meses')
    expect(textoEdad(25)).toBe('2 años 1 mes')
  })

  it('reads and writes a day of the year as «1 dic»', () => {
    expect(leerDiaMes('1 dic')).toEqual({ mes: 12, dia: 1 })
    expect(leerDiaMes(' 15 Ago ')).toEqual({ mes: 8, dia: 15 })
    expect(leerDiaMes('29 feb')).toEqual({ mes: 2, dia: 29 })
    expect(leerDiaMes('31 abr')).toBeNull()
    expect(leerDiaMes('1/12')).toBeNull()
    expect(leerDiaMes('')).toBeNull()
    expect(textoDiaMes(12, 1)).toBe('1 dic')
    expect(textoDiaMes(null, null)).toBe('')
  })

  it('says who goes into a salón', () => {
    expect(textoQuienEntra(salon())).toBe('36–47 meses')
    expect(textoQuienEntra(salon({ edad_max_meses: null }))).toBe('Desde 36 meses')
    expect(textoQuienEntra(salon({ corte_mes: 12, corte_dia: 1, promocion_mes: 8, promocion_dia: 1 }))).toBe('36–47 meses · corte 1 dic')
    expect(textoQuienEntra(salon({ area: 'upstreet', edad_min_meses: null, edad_max_meses: null, grado_min: 1, grado_max: 1 }))).toBe('1º grado')
    expect(textoQuienEntra(salon({ area: 'upstreet', edad_min_meses: null, edad_max_meses: null, grado_min: 5, grado_max: 6 }))).toBe('5º a 6º grado')
    expect(textoQuienEntra(salon({ edad_min_meses: null, edad_max_meses: null, es_necesidades_especiales: true }))).toBe('Por asignación · necesidades especiales')
    expect(textoQuienEntra(salon({ edad_min_meses: null, edad_max_meses: null }))).toBe('Sin edad ni grado: no se sugiere a nadie')
  })

  it('counts the volunteers a number of children needs', () => {
    expect(voluntariosNecesarios(salon(), 22)).toBe(5)
    expect(voluntariosNecesarios(salon(), 4)).toBe(2)
    expect(voluntariosNecesarios(salon({ ninos_por_voluntario: null, min_voluntarios: 3 }), 22)).toBe(3)
    expect(textoVoluntarios(salon())).toBe('1 cada 5 · mín 2')
    expect(textoVoluntarios(salon({ ninos_por_voluntario: null, min_voluntarios: 3 }))).toBe('Mínimo 3')
    expect(textoVoluntarios(salon({ ninos_por_voluntario: null, min_voluntarios: 0 }))).toBe('Sin regla')
  })

  it('sums the open salones for the hero', () => {
    const salones = [salon({ id: 'a' }), salon({ id: 'b', area: 'upstreet', capacidad: 10, cupo_visitantes: 0 }), salon({ id: 'c', abierto: false })]
    expect(resumenSalones(salones)).toEqual({ salones: 3, carpetas: 2, regulares: 30, visitantes: 2, cerrados: 1 })
  })

  it('copies the rules of a salón to save one change', () => {
    expect(reglasDe(salon())).toEqual(REGLAS)
  })
})

describe('probarReglas', () => {
  const SALONES = [
    salon({ id: 'maternal', nombre: 'Maternal', edad_min_meses: 0, edad_max_meses: 23, orden: 10, cupo_visitantes: 0 }),
    salon({ id: 'pre2', nombre: 'Preescolar II', orden: 30, corte_mes: 12, corte_dia: 1, promocion_mes: 8, promocion_dia: 1 }),
    salon({ id: 'pre3', nombre: 'Preescolar III', edad_min_meses: 48, edad_max_meses: 71, orden: 40, corte_mes: 12, corte_dia: 1, promocion_mes: 8, promocion_dia: 1 }),
    salon({ id: 'plus', nombre: 'Waumba Land Plus', edad_min_meses: null, edad_max_meses: null, es_necesidades_especiales: true, orden: 50 }),
    salon({ id: 'g1', nombre: '1º grado', area: 'upstreet', edad_min_meses: null, edad_max_meses: null, grado_min: 1, grado_max: 1, orden: 110 }),
    salon({ id: 'g1b', nombre: '1º grado B', area: 'upstreet', edad_min_meses: null, edad_max_meses: null, grado_min: 1, grado_max: 1, orden: 120 }),
  ]
  const probar = (o: Partial<Parameters<typeof probarReglas>[0]> = {}) =>
    probarReglas({
      fechaNacimiento: '2022-11-20',
      grado: null,
      necesidadesEspeciales: false,
      visitante: false,
      fechaServicio: '2026-11-08',
      salones: SALONES,
      carpetas: [],
      ...o,
    })

  it('asks for the birth date or the grade first', () => {
    expect(probar({ fechaNacimiento: null })).toMatchObject({ estado: 'faltan_datos', salon: null, titulo: 'Escribe la fecha de nacimiento o elige el grado.' })
    expect(probar({ fechaNacimiento: '2027-01-01' })).toMatchObject({ estado: 'faltan_datos' })
  })

  it('says which salón and why, with the fecha de corte', () => {
    const r = probar()
    expect(r.estado).toBe('asignado')
    expect(r.salon?.id).toBe('pre3')
    expect(r.titulo).toBe('Va a Preescolar III')
    expect(r.edad).toBe('3 años 11 meses')
    expect(r.porque).toEqual([
      'Fecha de corte: cuenta su edad al 1 dic 2026',
      '48 meses está entre 48 y 71',
      'Regular: cupo de 20',
      'Es el único salón que le sirve',
    ])
    expect(r.descartados).toEqual([
      'Maternal: 47 meses no está entre 0 y 23',
      'Preescolar II: 48 meses no está entre 36 y 47',
      'Waumba Land Plus: solo por asignación del coordinador',
    ])
  })

  it('tells a visitor about the visitor places', () => {
    const r = probar({ visitante: true })
    expect(r.porque).toContain('Visitante: puede usar los 2 puestos de visitantes además del cupo de 20')
  })

  it('counts the children inside and follows the distribution of the carpeta', () => {
    const base = { fechaNacimiento: '2019-06-01', grado: 1, ocupados: { g1: 12, g1b: 5 } }
    const enOrden = probar(base)
    expect(enOrden.salon?.id).toBe('g1')
    expect(enOrden.porque).toEqual(['1º grado coincide', 'Hay 12 niños de 20 regulares', 'En orden: es el primero con cupo de 2 que le sirven'])
    expect(enOrden.descartados).toEqual(['1º grado B: va después en el orden'])
    const equilibrada = probar({ ...base, carpetas: [{ area: 'upstreet', distribucion: 'equilibrada', mantenerRegulares: true }] })
    expect(equilibrada.salon?.id).toBe('g1b')
    expect(equilibrada.porque).toEqual(['1º grado coincide', 'Hay 5 niños de 20 regulares', 'Equilibrada: es el de menos niños de 2 que le sirven'])
    expect(equilibrada.descartados).toEqual(['1º grado: tiene más niños (12)'])
  })

  it('says when the salón that fits is closed or full', () => {
    const cerrados = SALONES.map((s) => (s.id === 'pre3' ? { ...s, abierto: false } : s))
    expect(probar({ salones: cerrados })).toMatchObject({
      estado: 'cerrado',
      salon: null,
      titulo: 'Le toca Preescolar III, pero está cerrado',
      queHacer: 'Abre el salón o, en la mesa, elige otro a mano.',
    })
    const lleno = probar({ ocupados: { pre3: 20 } })
    expect(lleno).toMatchObject({ estado: 'lleno', salon: null, titulo: 'Preescolar III está lleno' })
    expect(lleno.descartados).toContain('Preescolar III: lleno, 20 de 20')
    expect(probar({ ocupados: { pre3: 20 }, visitante: true }).salon?.id).toBe('pre3')
  })

  it('says when no salón takes the child', () => {
    const r = probar({ fechaNacimiento: '2015-01-01' })
    expect(r).toMatchObject({ estado: 'ninguno', salon: null, titulo: 'Ningún salón recibe a este niño', queHacer: 'Revisa las edades y grados o crea un salón para esa edad.' })
    expect(r.descartados[0]).toBe('Maternal: 142 meses no está entre 0 y 23')
  })

  it('sends a child with special needs to the salón of asignación', () => {
    const r = probar({ necesidadesEspeciales: true })
    expect(r.salon?.id).toBe('plus')
    expect(r.porque[0]).toBe('Necesidades especiales: va al salón de asignación')
  })
})

// ── server actions ─────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  for (const f of ['update', 'insert', 'select', 'eq', 'order'] as const) tabla[f].mockReturnValue(tabla)
})

describe('guardarReglasSalon', () => {
  it('saves every rule through ninos_salon_reglas_guardar and revalidates the screen', async () => {
    rpc.mockResolvedValue({ data: SALON, error: null })
    const r = await guardarReglasSalon({ salonId: SALON, reglas: { ...REGLAS, corteMes: 12, corteDia: 1 } })
    expect(r).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('ninos_salon_reglas_guardar', {
      p_salon_id: SALON,
      p_cupo_visitantes: 2,
      p_ninos_por_voluntario: 5,
      p_min_voluntarios: 2,
      p_abierto: true,
      p_opcion_panal: false,
      p_opcion_merienda: true,
      p_corte_mes: 12,
      p_corte_dia: 1,
      p_promocion_mes: null,
      p_promocion_dia: null,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/ninos/salones')
  })

  it('shows the HINT when the RPC refuses (an area coordinator on another area)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_autoridad', hint: 'No tienes permiso para configurar este salón.' } })
    expect(await guardarReglasSalon({ salonId: SALON, reglas: REGLAS })).toEqual({ ok: false, message: 'No tienes permiso para configurar este salón.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('checks the rules before calling', async () => {
    expect(await guardarReglasSalon({ salonId: SALON, reglas: { ...REGLAS, cupoVisitantes: 900 } })).toEqual({ ok: false, message: 'El cupo de visitantes va de 0 a 500.' })
    expect(await guardarReglasSalon({ salonId: 'x', reglas: REGLAS })).toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.' })
    expect(await guardarReglasSalon({ salonId: SALON, reglas: { ...REGLAS, abierto: 'si' } as unknown as ReglasSalon })).toEqual({
      ok: false,
      message: 'Revisa los datos e inténtalo de nuevo.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks to sign in again without a session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await guardarReglasSalon({ salonId: SALON, reglas: REGLAS })).toEqual({ ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('guardarCarpeta', () => {
  it('saves the distribution of an area', async () => {
    rpc.mockResolvedValue({ data: 'c1', error: null })
    expect(await guardarCarpeta({ campusId: CAMPUS, area: 'upstreet', distribucion: 'equilibrada', mantenerRegulares: false })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('ninos_carpeta_guardar', {
      p_campus_id: CAMPUS,
      p_area: 'upstreet',
      p_distribucion: 'equilibrada',
      p_mantener_regulares: false,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/ninos/salones')
  })

  it('refuses bad input and shows the HINT', async () => {
    expect(await guardarCarpeta({ campusId: CAMPUS, area: 'otra' as 'waumba', distribucion: 'en_orden', mantenerRegulares: true })).toEqual({
      ok: false,
      message: 'Revisa los datos e inténtalo de nuevo.',
    })
    rpc.mockResolvedValue({ data: null, error: { message: 'sin_autoridad', hint: 'No tienes permiso para configurar esta área en este campus.' } })
    expect(await guardarCarpeta({ campusId: CAMPUS, area: 'waumba', distribucion: 'en_orden', mantenerRegulares: true })).toEqual({
      ok: false,
      message: 'No tienes permiso para configurar esta área en este campus.',
    })
  })
})

describe('guardarDatosSalon', () => {
  const datos = { nombre: ' Preescolar 2 ', capacidad: 18, edadMinMeses: 36, edadMaxMeses: 47, gradoMin: null, gradoMax: null }

  it('updates the name, quota and ranges of the salón', async () => {
    tabla.select.mockResolvedValue({ data: [{ id: SALON }], error: null })
    expect(await guardarDatosSalon({ salonId: SALON, datos })).toEqual({ ok: true, data: null })
    expect(from).toHaveBeenCalledWith('ninos_salones')
    expect(tabla.update).toHaveBeenCalledWith({
      nombre: 'Preescolar 2',
      capacidad: 18,
      edad_min_meses: 36,
      edad_max_meses: 47,
      grado_min: null,
      grado_max: null,
    })
    expect(tabla.eq).toHaveBeenCalledWith('id', SALON)
    expect(revalidatePath).toHaveBeenCalledWith('/ninos/salones')
  })

  it('says so when the row was not changed (no permission) or the name is taken', async () => {
    tabla.select.mockResolvedValue({ data: [], error: null })
    expect(await guardarDatosSalon({ salonId: SALON, datos })).toEqual({ ok: false, message: 'No tienes permiso para configurar este salón.' })
    tabla.select.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    expect(await guardarDatosSalon({ salonId: SALON, datos })).toEqual({ ok: false, message: 'Ya hay un salón con ese nombre en este campus.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('checks the data before writing', async () => {
    expect(await guardarDatosSalon({ salonId: SALON, datos: { ...datos, capacidad: 0 } })).toEqual({ ok: false, message: 'El cupo de regulares va de 1 a 500.' })
    expect(tabla.update).not.toHaveBeenCalled()
  })
})

describe('crearSalon', () => {
  it('creates the salón in the area’s team, after the last one', async () => {
    tabla.limit.mockResolvedValueOnce({ data: [{ equipo_id: EQUIPO, orden: 50 }], error: null })
    tabla.select.mockReturnValueOnce(tabla).mockReturnValueOnce({ single: async () => ({ data: { id: 'nuevo' }, error: null }) })
    expect(await crearSalon({ campusId: CAMPUS, area: 'waumba', nombre: ' Sala cuna ' })).toEqual({ ok: true, data: { id: 'nuevo' } })
    expect(tabla.insert).toHaveBeenCalledWith({ campus_id: CAMPUS, equipo_id: EQUIPO, area: 'waumba', nombre: 'Sala cuna', orden: 60 })
    expect(revalidatePath).toHaveBeenCalledWith('/ninos/salones')
  })

  it('needs a salón of the area in the campus to know its team', async () => {
    tabla.limit.mockResolvedValueOnce({ data: [], error: null })
    expect(await crearSalon({ campusId: CAMPUS, area: 'upstreet', nombre: '5º grado' })).toEqual({
      ok: false,
      message: 'Esta área todavía no tiene salones en el campus: pide a soporte que cree el primero.',
    })
    expect(tabla.insert).not.toHaveBeenCalled()
  })

  it('checks the name before writing', async () => {
    expect(await crearSalon({ campusId: CAMPUS, area: 'waumba', nombre: ' ' })).toEqual({ ok: false, message: 'El salón necesita un nombre de hasta 80 caracteres.' })
    expect(from).not.toHaveBeenCalled()
  })
})
