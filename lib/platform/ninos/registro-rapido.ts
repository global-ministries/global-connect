/**
 * One-screen family registration (odd/tasks/ninos-v2.md N4b, S5–S6;
 * prototypes docs/design-system/prototipos/ninos/01 and 04). The same form
 * runs on the parent's phone (public QR, POST /api/ninos/preregistro) and in
 * the check-in desk panel (ninos_registrar_familia[_mesa]). This module holds
 * its state shape, what is missing per section (keys are the DOM ids, so the
 * form can focus the first one), folding, the default pickup person and the
 * payloads of both modes. The server validates again.
 */
import type { Seleccion } from './checkin'
import {
  EDAD_MAXIMA_NINOS_ANOS,
  GENEROS,
  enRangoNinos,
  fechaPasadaValida,
  hijoVacio,
  parseGrado,
  type AutorizadoForm,
  type FamiliaForm,
  type HijoForm,
} from './familia'
import { aplicarNivel, nivelSugerido, valorNivel, type SalonNivel } from './nivel'
import { erroresPadrePreregistro } from './preregistro'
import { edadEnMeses, sugerirSalon, type SalonSugerible } from './sugerir-salon'

export type ModoRegistro = 'publico' | 'mesa'
export type SeccionRegistro = 'tu' | 'ninos' | 'retiran' | 'despues'

export type PadreRapido = { nombre: string; apellido: string; telefono: string; genero: string; cedula: string; email: string }

export type HijoRapido = HijoForm & {
  /** Explicit Sí / No; null = not answered (required on the public page only). */
  tieneAlergias: boolean | null
  tieneNecesidades: boolean | null
  /** The level last preselected from the birth date (desk); a level picked by hand is never replaced. */
  nivelAuto: string
}

/** `fotos`: the public "¿Autorizas fotos…?" for every child; the desk sets it per child. */
export type DatosRapido = { campusId: string; padre: PadreRapido; hijos: HijoRapido[]; autorizados: AutorizadoForm[]; fotos: boolean | null }

/**
 * `hoy`: Caracas date. `campusIds` (public): the campuses the QR may name.
 * `padreConocido` / `padreNombre` (desk): the parent is an existing person.
 */
export type ContextoRegistro = { modo: ModoRegistro; hoy: string; campusIds?: readonly string[]; padreConocido?: boolean; padreNombre?: string }

type CampoHijo = 'nombre' | 'apellido' | 'nacimiento' | 'genero' | 'tiene-alergias' | 'alergias' | 'tiene-nee' | 'nee'

export const idRapido = {
  campus: 'rr-campus',
  padre: (campo: keyof PadreRapido) => `rr-padre-${campo}`,
  hijo: (i: number, campo: CampoHijo) => `rr-nino-${i + 1}-${campo}`,
  autorizado: (i: number) => `rr-autorizado-${i + 1}-nombre`,
  agregarHijo: 'rr-agregar-nino',
}

export function hijoRapidoVacio(apellido = ''): HijoRapido {
  return { ...hijoVacio(), apellido, tieneAlergias: null, tieneNecesidades: null, nivelAuto: '' }
}

/** A stored child (pre-registration under review): a text means "Sí". */
export function hijoRapidoDesde(h: HijoForm): HijoRapido {
  return { ...h, tieneAlergias: h.alergias.trim() ? true : null, tieneNecesidades: h.necesidadesEspeciales.trim() ? true : null, nivelAuto: '' }
}

export function datosIniciales({ campusId = '', form, email = '' }: { campusId?: string; form?: FamiliaForm; email?: string } = {}): DatosRapido {
  const p = form?.padre
  return {
    campusId,
    padre: { nombre: p?.nombre ?? '', apellido: p?.apellido ?? '', telefono: p?.telefono ?? '', cedula: p?.cedula ?? '', genero: p?.genero ?? '', email },
    hijos: form?.hijos.length ? form.hijos.map(hijoRapidoDesde) : [hijoRapidoVacio()],
    autorizados: form?.autorizados ?? [],
    fotos: null,
  }
}

export const autorizadoEnBlanco = (a: AutorizadoForm) => !a.nombre.trim() && !a.telefono.trim() && !a.relacion.trim()

const esGenero = (g: string) => (GENEROS as readonly string[]).includes(g)

export type Faltante = { id: string; seccion: SeccionRegistro; etiqueta: string; mensaje: string }

/** "Con esa fecha Andrés tendría 14 años…" (prototype 01, state C). */
export function avisoFueraDeRango(nombre: string, fechaNacimiento: string, hoy: string): string {
  const quien = nombre.trim() || 'este niño'
  const anos = Math.floor((edadEnMeses(fechaNacimiento, hoy) ?? 0) / 12)
  return `Con esa fecha ${quien} tendría ${anos} años. Niños recibe menores de ${EDAD_MAXIMA_NINOS_ANOS}: revisa la fecha o quita a ${quien} de este registro.`
}

/** Everything that blocks the send, in form order. */
export function faltantes(d: DatosRapido, ctx: ContextoRegistro): Faltante[] {
  const f: Faltante[] = []
  const add = (id: string, seccion: SeccionRegistro, etiqueta: string, mensaje: string) => f.push({ id, seccion, etiqueta, mensaje })
  const pub = ctx.modo === 'publico'
  if (pub && ctx.campusIds && !ctx.campusIds.includes(d.campusId)) add(idRapido.campus, 'tu', 'Tu campus', 'Elige tu campus.')
  if (!ctx.padreConocido) {
    const e = erroresPadrePreregistro(d.padre)
    const [nom, ape, tel, gen] = pub
      ? ['Tu nombre', 'Tu apellido', 'Tu teléfono', 'Si eres mamá o papá']
      : ['Nombre del representante', 'Apellido del representante', 'Teléfono del representante', 'Género del representante']
    if (e.nombre) add(idRapido.padre('nombre'), 'tu', nom, pub ? e.nombre : 'Escribe el nombre.')
    if (e.apellido) add(idRapido.padre('apellido'), 'tu', ape, pub ? e.apellido : 'Escribe el apellido.')
    if (e.telefono) add(idRapido.padre('telefono'), 'tu', tel, e.telefono)
    if (!esGenero(d.padre.genero)) add(idRapido.padre('genero'), 'tu', gen, 'Elige mamá o papá.')
  }
  if (d.hijos.length === 0) add(idRapido.agregarHijo, 'ninos', 'Un niño', 'Agrega al menos un niño.')
  d.hijos.forEach((h, i) => {
    const id = (c: CampoHijo) => idRapido.hijo(i, c)
    const nombre = h.nombre.trim()
    const de = nombre ? `de ${nombre}` : `del niño ${i + 1}`
    if (!nombre) add(id('nombre'), 'ninos', `Nombre del niño ${i + 1}`, 'Escribe su nombre.')
    if (!h.apellido.trim()) add(id('apellido'), 'ninos', `Apellido ${de}`, 'Escribe su apellido.')
    if (!fechaPasadaValida(h.fechaNacimiento, ctx.hoy)) add(id('nacimiento'), 'ninos', `Fecha de nacimiento ${de}`, 'Elige una fecha de nacimiento válida.')
    else if (!enRangoNinos(h.fechaNacimiento, ctx.hoy)) add(id('nacimiento'), 'ninos', `Edad ${de}`, avisoFueraDeRango(nombre, h.fechaNacimiento, ctx.hoy))
    if (!esGenero(h.genero)) add(id('genero'), 'ninos', `Si ${nombre || `el niño ${i + 1}`} es niño o niña`, 'Elige si es niño o niña.')
    if (pub && h.tieneAlergias === null) add(id('tiene-alergias'), 'ninos', `Alergias ${de}`, 'Elige Sí o No.')
    else if (h.tieneAlergias && !h.alergias.trim()) add(id('alergias'), 'ninos', `Alergias ${de}: ¿a qué?`, 'Cuéntanos a qué.')
    if (pub && h.tieneNecesidades === null) add(id('tiene-nee'), 'ninos', `Condición médica ${de}`, 'Elige Sí o No.')
    else if (h.tieneNecesidades && !h.necesidadesEspeciales.trim()) add(id('nee'), 'ninos', `Condición médica ${de}: ¿cuál?`, 'Cuéntanos cuál.')
  })
  d.autorizados.forEach((a, i) => {
    if (!autorizadoEnBlanco(a) && !a.nombre.trim()) {
      add(idRapido.autorizado(i), 'retiran', `Nombre de la persona ${i + 1} que retira`, 'Escribe su nombre o quita esta persona.')
    }
  })
  const email = pub ? erroresPadrePreregistro(d.padre).email : undefined
  if (email) add(idRapido.padre('email'), 'despues', 'Tu correo', email)
  return f
}

export const seccionCompleta = (f: readonly Faltante[], s: SeccionRegistro) => !f.some((x) => x.seccion === s)

/** A complete section folds to one line once the person leaves it ("Editar" opens it again). */
export const debePlegarse = (completa: boolean, salio: boolean) => completa && salio

export type PersonaQueRetira = { nombre: string; detalle: string; numero: string | null; indice: number | null }

/** The parent first (always), then each named pickup person. */
export function personasRetiran(d: DatosRapido, ctx: ContextoRegistro): PersonaQueRetira[] {
  const pub = ctx.modo === 'publico'
  const padre = ctx.padreNombre ?? (`${d.padre.nombre.trim()} ${d.padre.apellido.trim()}`.trim() || (pub ? 'Tú' : 'Representante'))
  const otros = d.autorizados.flatMap((a, i) =>
    a.nombre.trim() ? [{ nombre: a.nombre.trim(), detalle: a.relacion.trim() || 'Puede retirar', numero: a.telefono.trim() || null, indice: i }] : [],
  )
  return [{ nombre: padre, detalle: pub ? 'Tú · siempre' : 'Representante · siempre', numero: null, indice: null }, ...otros]
}

function edadHijo(fecha: string, hoy: string): string | null {
  const meses = fechaPasadaValida(fecha, hoy) ? edadEnMeses(fecha, hoy) : null
  if (meses === null) return null
  if (meses < 12) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  const anos = Math.floor(meses / 12)
  return `${anos} ${anos === 1 ? 'año' : 'años'}`
}

/** The one line of a folded section; `numero` is shown in mono. */
export function resumenSeccion(d: DatosRapido, s: SeccionRegistro, ctx: ContextoRegistro): { texto: string; numero?: string } {
  if (s === 'tu') {
    const rol = d.padre.genero === 'Femenino' ? 'mamá' : d.padre.genero === 'Masculino' ? 'papá' : ''
    return { texto: [`${d.padre.nombre.trim()} ${d.padre.apellido.trim()}`.trim(), rol].filter(Boolean).join(' · '), numero: d.padre.telefono.trim() }
  }
  if (s === 'ninos') {
    const uno = (h: HijoRapido) => {
      const edad = edadHijo(h.fechaNacimiento, ctx.hoy)
      return edad ? `${h.nombre.trim()} (${edad})` : h.nombre.trim()
    }
    return { texto: d.hijos.map(uno).join(', ') }
  }
  const nombres = personasRetiran(d, ctx).map((p, i) => (i === 0 && ctx.modo === 'publico' ? 'Tú' : p.nombre))
  return { texto: nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0] }
}

export type EstadoBarra = { faltan: number; primero: string | null; ninos: number; retiran: number }

export function estadoBarra(f: readonly Faltante[], d: DatosRapido, ctx: ContextoRegistro): EstadoBarra {
  return { faltan: f.length, primero: f[0]?.etiqueta ?? null, ninos: d.hijos.length, retiran: personasRetiran(d, ctx).length }
}

export function textoBarra(e: EstadoBarra): string {
  if (e.faltan === 1) return `Falta 1 dato: ${e.primero}`
  if (e.faltan > 1) return `Faltan ${e.faltan} datos: ${e.primero}…`
  return `Todo listo: ${e.ninos} ${e.ninos === 1 ? 'niño' : 'niños'} · ${e.retiran} ${e.retiran === 1 ? 'persona retira' : 'personas retiran'}`
}

/** A "No" (or no answer) sends no text; `fotos` (public) applies to every child. */
export function aHijoForm(h: HijoRapido, fotos?: boolean | null): HijoForm {
  const { tieneAlergias, tieneNecesidades, nivelAuto: _nivelAuto, ...form } = h
  return {
    ...form,
    alergias: tieneAlergias ? h.alergias : '',
    necesidadesEspeciales: tieneNecesidades ? h.necesidadesEspeciales : '',
    autorizaImagen: fotos === undefined ? h.autorizaImagen : fotos,
  }
}

/** The POST /api/ninos/preregistro body (same shape as the old wizard, plus the parent género). */
export function cuerpoPublico(d: DatosRapido, sitioWeb: string) {
  const autorizados = d.autorizados.filter((a) => !autorizadoEnBlanco(a))
  return { campusId: d.campusId, padre: { ...d.padre }, hijos: d.hijos.map((h) => aHijoForm(h, d.fotos)), autorizados, sitioWeb }
}

/** The desk form for validarFamilia; `padreId` when the parent is a known person. */
export function familiaMesa(d: DatosRapido, padreId?: string): FamiliaForm {
  const { nombre, apellido, telefono, cedula, genero } = d.padre
  return { padre: { id: padreId, nombre, apellido, telefono, cedula, genero }, hijos: d.hijos.map((h) => aHijoForm(h)), autorizados: d.autorizados }
}

/** Desk: a new birth date preselects the suggested level unless one was picked by hand (as CamposNino did). */
export function conFechaNacimiento(h: HijoRapido, fechaNacimiento: string, salones: readonly SalonNivel[], hoy: string): HijoRapido {
  const siguiente = { ...h, fechaNacimiento }
  const actual = valorNivel(h, salones)
  if (actual !== '' && actual !== h.nivelAuto) return siguiente
  const sugerido = nivelSugerido(siguiente, salones, hoy)
  return { ...siguiente, ...aplicarNivel(siguiente, sugerido), nivelAuto: sugerido }
}

type HijoParaSalon = { fechaNacimiento: string; grado: string; salonPreferidoId: string; necesidadesEspeciales: string }

/** The salón a child goes to, as the check-in decides it (hand-picked room, else the rule); null when none fits. */
export function salonVivo<S extends SalonSugerible>(h: HijoParaSalon, salones: readonly S[], hoy: string): S | null {
  const elegido = salones.find((s) => s.id === h.salonPreferidoId && s.activo)
  if (elegido) return elegido
  const grado = parseGrado(h.grado)
  return sugerirSalon({
    fechaNacimiento: h.fechaNacimiento || null,
    grado: typeof grado === 'number' ? grado : null,
    necesidadesEspeciales: h.necesidadesEspeciales.trim() !== '',
    fechaServicio: hoy,
    salones,
  })
}

type HijoRegistrado = { nombre: string; fecha_nacimiento: string; grado: number | null; salon_preferido_id: string | null; necesidades_especiales: string | null }

/** The children just registered (ids in payload order) with their salón, for ninos_checkin. */
export function seleccionIngreso(hijos: readonly HijoRegistrado[], ids: readonly string[], salones: readonly SalonSugerible[], fecha: string): Seleccion[] {
  return hijos.map((h, i) => {
    const comoForm = { fechaNacimiento: h.fecha_nacimiento, grado: h.grado === null ? '' : String(h.grado), salonPreferidoId: h.salon_preferido_id ?? '', necesidadesEspeciales: h.necesidades_especiales ?? '' }
    return { ninoId: ids[i], salonId: salonVivo(comoForm, salones, fecha)?.id ?? null, nombre: h.nombre }
  })
}
