/**
 * Family registration (odd/tasks/ninos-checkin.md, N3): the form shape used
 * by components/ninos, its validation, and the jsonb payload sent to the
 * ninos_registrar_familia RPC. The RPC validates again; this only gives the
 * volunteer early, readable errors.
 */

export const GENEROS = ['Masculino', 'Femenino', 'Otro'] as const
export type Genero = (typeof GENEROS)[number]

/** PreK = 0, 1st–6th = 1..6 (same scale as sugerirSalon). */
export const GRADOS: ReadonlyArray<{ valor: string; label: string }> = [
  { valor: '', label: 'Sin grado (no escolarizado)' },
  { valor: '0', label: 'Preescolar (PreK)' },
  { valor: '1', label: '1º grado' },
  { valor: '2', label: '2º grado' },
  { valor: '3', label: '3º grado' },
  { valor: '4', label: '4º grado' },
  { valor: '5', label: '5º grado' },
  { valor: '6', label: '6º grado' },
]

export type PadreForm = {
  /** Set when adding a child to a parent already found. */
  id?: string
  nombre: string
  apellido: string
  telefono: string
  cedula: string
  genero: string
}

export type HijoForm = {
  nombre: string
  apellido: string
  fechaNacimiento: string
  genero: string
  grado: string
  alergias: string
  necesidadesEspeciales: string
  habitos: string
  notas: string
  puedeComer: boolean | null
  cambioPanal: boolean | null
  autorizaImagen: boolean | null
  escolarizado: boolean | null
}

export type AutorizadoForm = { nombre: string; telefono: string; relacion: string }

export type FamiliaForm = { padre: PadreForm; hijos: HijoForm[]; autorizados: AutorizadoForm[] }

export type FichaPayload = {
  grado: number | null
  alergias: string | null
  necesidades_especiales: string | null
  habitos: string | null
  notas: string | null
  puede_comer: boolean | null
  cambio_panal: boolean | null
  autoriza_imagen: boolean | null
  escolarizado: boolean | null
}

export type HijoPayload = FichaPayload & {
  nombre: string
  apellido: string
  fecha_nacimiento: string
  genero: Genero
}

export type AutorizadoPayload = { nombre: string; telefono: string | null; relacion: string | null }

export type FamiliaPayload = {
  padre:
    | { id: string }
    | { nombre: string; apellido: string; telefono: string; cedula: string | null; genero: Genero }
  hijos: HijoPayload[]
  autorizados: AutorizadoPayload[]
}

export type ResultadoValidacion = { ok: true; payload: FamiliaPayload } | { ok: false; errores: string[] }

export function hijoVacio(): HijoForm {
  return {
    nombre: '',
    apellido: '',
    fechaNacimiento: '',
    genero: '',
    grado: '',
    alergias: '',
    necesidadesEspeciales: '',
    habitos: '',
    notas: '',
    puedeComer: null,
    cambioPanal: null,
    autorizaImagen: null,
    escolarizado: null,
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function texto(value: string): string | null {
  const t = value.trim()
  return t === '' ? null : t
}

function esGenero(value: string): value is Genero {
  return (GENEROS as readonly string[]).includes(value)
}

function telefonoValido(value: string): boolean {
  return value.replace(/\D/g, '').length >= 7
}

function fechaPasadaValida(value: string, hoy: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && value <= hoy
}

export function parseGrado(value: string): number | null | 'invalido' {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 'invalido'
}

/** Ficha fields shared by registration and edition. */
export function fichaPayload(h: HijoForm): FichaPayload {
  const grado = parseGrado(h.grado)
  return {
    grado: grado === 'invalido' ? null : grado,
    alergias: texto(h.alergias),
    necesidades_especiales: texto(h.necesidadesEspeciales),
    habitos: texto(h.habitos),
    notas: texto(h.notas),
    puede_comer: h.puedeComer,
    cambio_panal: h.cambioPanal,
    autoriza_imagen: h.autorizaImagen,
    escolarizado: h.escolarizado,
  }
}

export function validarAutorizados(autorizados: readonly AutorizadoForm[]): {
  errores: string[]
  payload: AutorizadoPayload[]
} {
  const errores: string[] = []
  const payload: AutorizadoPayload[] = []
  autorizados.forEach((a, i) => {
    const nombre = texto(a.nombre)
    const telefono = texto(a.telefono)
    const relacion = texto(a.relacion)
    if (!nombre && !telefono && !relacion) return
    if (!nombre) errores.push(`Autorizado ${i + 1}: el nombre es obligatorio.`)
    else payload.push({ nombre, telefono, relacion })
  })
  return { errores, payload }
}

export function validarFamilia(form: FamiliaForm, hoy: string = new Date().toISOString().slice(0, 10)): ResultadoValidacion {
  const errores: string[] = []

  let padre: FamiliaPayload['padre'] | null = null
  if (form.padre.id) {
    padre = { id: form.padre.id }
  } else {
    const p = form.padre
    if (!texto(p.nombre)) errores.push('El nombre del representante es obligatorio.')
    if (!texto(p.apellido)) errores.push('El apellido del representante es obligatorio.')
    if (!telefonoValido(p.telefono)) errores.push('El teléfono del representante no es válido.')
    if (!esGenero(p.genero)) errores.push('El género del representante es obligatorio.')
    if (esGenero(p.genero)) {
      padre = {
        nombre: p.nombre.trim(),
        apellido: p.apellido.trim(),
        telefono: p.telefono.trim(),
        cedula: texto(p.cedula),
        genero: p.genero,
      }
    }
  }

  if (form.hijos.length === 0) errores.push('Agrega al menos un niño.')

  const hijos: HijoPayload[] = []
  form.hijos.forEach((h, i) => {
    const n = `Niño ${i + 1}`
    if (!texto(h.nombre)) errores.push(`${n}: el nombre es obligatorio.`)
    if (!texto(h.apellido)) errores.push(`${n}: el apellido es obligatorio.`)
    if (!fechaPasadaValida(h.fechaNacimiento, hoy)) errores.push(`${n}: la fecha de nacimiento no es válida.`)
    if (!esGenero(h.genero)) errores.push(`${n}: el género es obligatorio.`)
    if (parseGrado(h.grado) === 'invalido') errores.push(`${n}: el grado no es válido.`)
    if (esGenero(h.genero)) {
      hijos.push({
        nombre: h.nombre.trim(),
        apellido: h.apellido.trim(),
        fecha_nacimiento: h.fechaNacimiento,
        genero: h.genero,
        ...fichaPayload(h),
      })
    }
  })

  const autorizados = validarAutorizados(form.autorizados)
  errores.push(...autorizados.errores)

  if (errores.length > 0 || !padre) return { ok: false, errores }
  return { ok: true, payload: { padre, hijos, autorizados: autorizados.payload } }
}

const MENSAJES: Record<string, string> = {
  sin_autoridad: 'No tienes permiso para registrar familias.',
  hijo_ya_registrado: 'Uno de los niños ya está registrado con este representante.',
  padre_no_encontrado: 'No se encontró el representante. Búscalo de nuevo.',
  sin_campus: 'No hay salones activos en tus áreas.',
  padre_existente: 'Ya existe una persona con ese teléfono o cédula. Confírmala antes de guardar.',
  nino_no_encontrado: 'No se encontró el niño. Búscalo de nuevo.',
  ficha_existente: 'Este niño ya tiene ficha. Búscalo de nuevo.',
  sin_padre: 'El niño no está vinculado a ningún representante.',
  vinculo_invalido: 'Esa persona no puede ser padre o madre de este niño.',
}

/** Spanish copy for an RPC error; the RPCs raise a snake_case code as the message. */
export function mensajeDeErrorFamilia(error: { code?: string; message?: string } | null): string {
  const clave = error?.message ?? ''
  if (MENSAJES[clave]) return MENSAJES[clave]
  if (error?.code === '42501') return MENSAJES.sin_autoridad
  if (error?.code === '22023') return 'Revisa los datos: hay campos inválidos.'
  return 'No se pudo guardar. Intenta de nuevo.'
}

/** An existing person returned by ninos_buscar_padre (phone and cédula masked). */
export type PadreCoincidencia = {
  id: string
  nombre: string
  apellido: string
  telefono: string | null
  cedula: string | null
  coincide_por: 'cedula' | 'telefono'
}

export function parseCoincidencias(data: unknown): PadreCoincidencia[] {
  if (!Array.isArray(data)) return []
  return data.filter(
    (c): c is PadreCoincidencia =>
      typeof c === 'object' && c !== null && typeof (c as { id?: unknown }).id === 'string',
  )
}

export type EdicionNinoPayload = FichaPayload & {
  nombre: string
  apellido: string
  fecha_nacimiento: string
  genero: Genero
}

/** Validates the edit screen: the child's name, birth date and gender plus the ficha. */
export function validarEdicionNino(
  h: HijoForm,
  hoy: string = new Date().toISOString().slice(0, 10),
): { ok: true; payload: EdicionNinoPayload } | { ok: false; errores: string[] } {
  const errores: string[] = []
  if (!texto(h.nombre)) errores.push('El nombre es obligatorio.')
  if (!texto(h.apellido)) errores.push('El apellido es obligatorio.')
  if (!fechaPasadaValida(h.fechaNacimiento, hoy)) errores.push('La fecha de nacimiento no es válida.')
  if (!esGenero(h.genero)) errores.push('El género es obligatorio.')
  if (parseGrado(h.grado) === 'invalido') errores.push('El grado no es válido.')
  if (errores.length > 0 || !esGenero(h.genero)) return { ok: false, errores }
  return {
    ok: true,
    payload: {
      nombre: h.nombre.trim(),
      apellido: h.apellido.trim(),
      fecha_nacimiento: h.fechaNacimiento,
      genero: h.genero,
      ...fichaPayload(h),
    },
  }
}

/** A new mother or father added to an existing family (ninos_vincular_padre). */
export type PadreNuevoForm = {
  nombre: string
  apellido: string
  telefono: string
  cedula: string
  email: string
  genero: string
}

export type PadreNuevoPayload = {
  nombre: string
  apellido: string
  telefono: string
  genero: Genero
  cedula: string | null
  email: string | null
}

export function padreNuevoVacio(): PadreNuevoForm {
  return { nombre: '', apellido: '', telefono: '', cedula: '', email: '', genero: '' }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function validarPadreNuevo(
  p: PadreNuevoForm,
): { ok: true; payload: PadreNuevoPayload } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const email = texto(p.email)
  if (!texto(p.nombre)) errores.push('El nombre es obligatorio.')
  if (!texto(p.apellido)) errores.push('El apellido es obligatorio.')
  if (!telefonoValido(p.telefono)) errores.push('El teléfono no es válido.')
  if (!esGenero(p.genero)) errores.push('El género es obligatorio.')
  if (email && !EMAIL.test(email)) errores.push('El correo no es válido.')
  if (errores.length > 0 || !esGenero(p.genero)) return { ok: false, errores }
  return {
    ok: true,
    payload: {
      nombre: p.nombre.trim(),
      apellido: p.apellido.trim(),
      telefono: p.telefono.trim(),
      genero: p.genero,
      cedula: texto(p.cedula),
      email,
    },
  }
}
