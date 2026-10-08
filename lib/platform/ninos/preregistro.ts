/**
 * Public family pre-registration (odd/tasks/ninos-checkin.md, N8).
 *
 * The page /ninos/registro (no login, QR at the church entrance) posts the
 * form to /api/ninos/preregistro. This module parses and size-limits that
 * untrusted body, turns it into the ninos_registrar_familia payload (plus the
 * optional email), and stores it through the service-role-only RPC
 * ninos_preregistro_crear, which also applies the per-IP rate limit. The
 * route never echoes data back and never says whether a person exists.
 */
import {
  validarFamilia,
  type AutorizadoForm,
  type AutorizadoPayload,
  type FamiliaForm,
  type Genero,
  type HijoForm,
  type HijoPayload,
} from './familia'

export const LIMITES_PREREGISTRO = {
  /** Bytes of the raw request body. */
  cuerpo: 32_000,
  hijos: 10,
  autorizados: 6,
  /** Characters of any single text field. */
  texto: 500,
} as const

export type PadrePreregistro = {
  nombre: string
  apellido: string
  telefono: string
  email: string | null
  cedula: string | null
  /** Not asked on the public form; the anfitrión picks it when confirming. */
  genero: Genero | null
}

export type PreregistroPayload = {
  padre: PadrePreregistro
  hijos: HijoPayload[]
  autorizados: AutorizadoPayload[]
}

export type ResultadoPreregistro =
  | { ok: true; honeypot: boolean; campusId: string; payload: PreregistroPayload }
  | { ok: false; errores: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Objeto = Record<string, unknown>

function esObjeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A string field, '' when missing or not a string. */
function cadena(o: Objeto, k: string): string {
  const v = o[k]
  return typeof v === 'string' ? v : ''
}

function siNo(o: Objeto, k: string): boolean | null {
  const v = o[k]
  return typeof v === 'boolean' ? v : null
}

// Split instead of a regex: linear on any input (same rule as account invitations).
function esEmailValido(email: string): boolean {
  if (email.length > 254 || /\s/.test(email)) return false
  const partes = email.split('@')
  if (partes.length !== 2 || !partes[0]) return false
  const etiquetas = partes[1].split('.')
  return etiquetas.length >= 2 && etiquetas.every((e) => e.length > 0)
}

function hijoDesde(o: Objeto): HijoForm {
  return {
    nombre: cadena(o, 'nombre'),
    apellido: cadena(o, 'apellido'),
    fechaNacimiento: cadena(o, 'fechaNacimiento'),
    genero: cadena(o, 'genero'),
    grado: cadena(o, 'grado'),
    alergias: cadena(o, 'alergias'),
    necesidadesEspeciales: cadena(o, 'necesidadesEspeciales'),
    habitos: cadena(o, 'habitos'),
    notas: cadena(o, 'notas'),
    puedeComer: siNo(o, 'puedeComer'),
    cambioPanal: siNo(o, 'cambioPanal'),
    autorizaImagen: siNo(o, 'autorizaImagen'),
    escolarizado: siNo(o, 'escolarizado'),
  }
}

function autorizadoDesde(o: Objeto): AutorizadoForm {
  return { nombre: cadena(o, 'nombre'), telefono: cadena(o, 'telefono'), relacion: cadena(o, 'relacion') }
}

function algunTextoLargo(objetos: readonly Objeto[]): boolean {
  return objetos.some((o) => Object.values(o).some((v) => typeof v === 'string' && v.length > LIMITES_PREREGISTRO.texto))
}

/** Parses the untrusted public form body. `hoy` is the Caracas date (YYYY-MM-DD). */
export function parsePreregistro(body: unknown, hoy: string): ResultadoPreregistro {
  if (!esObjeto(body)) return { ok: false, errores: ['Formulario inválido.'] }
  const honeypot = cadena(body, 'sitioWeb').trim() !== ''

  const campusId = cadena(body, 'campusId')
  const padre = esObjeto(body.padre) ? body.padre : {}
  const hijosRaw = Array.isArray(body.hijos) ? body.hijos.filter(esObjeto) : []
  const autorizadosRaw = Array.isArray(body.autorizados) ? body.autorizados.filter(esObjeto) : []

  const errores: string[] = []
  if (!UUID.test(campusId)) errores.push('Elige tu campus.')
  if (hijosRaw.length > LIMITES_PREREGISTRO.hijos) errores.push(`Puedes registrar hasta ${LIMITES_PREREGISTRO.hijos} niños.`)
  if (autorizadosRaw.length > LIMITES_PREREGISTRO.autorizados) {
    errores.push(`Puedes indicar hasta ${LIMITES_PREREGISTRO.autorizados} personas autorizadas.`)
  }
  if (algunTextoLargo([padre, ...hijosRaw, ...autorizadosRaw])) errores.push('Uno de los campos es demasiado largo.')
  if (errores.length > 0) return { ok: false, errores }

  const nombre = cadena(padre, 'nombre').trim()
  const apellido = cadena(padre, 'apellido').trim()
  const telefono = cadena(padre, 'telefono').trim()
  const email = cadena(padre, 'email').trim().toLowerCase()
  const cedula = cadena(padre, 'cedula').trim()
  if (!nombre) errores.push('Escribe tu nombre.')
  if (!apellido) errores.push('Escribe tu apellido.')
  if (telefono.replace(/\D/g, '').length < 7) errores.push('Escribe un teléfono válido.')
  if (email && !esEmailValido(email)) errores.push('Escribe un correo válido o déjalo vacío.')

  // Children and pickup people: the same rules as the table form. The parent
  // block is validated above, so a placeholder id skips it there.
  const familia = validarFamilia(
    {
      padre: { id: 'preregistro', nombre: '', apellido: '', telefono: '', cedula: '', genero: '' },
      hijos: hijosRaw.map(hijoDesde),
      autorizados: autorizadosRaw.map(autorizadoDesde),
    },
    hoy,
  )
  if (!familia.ok) errores.push(...familia.errores)
  if (errores.length > 0 || !familia.ok) return { ok: false, errores }

  return {
    ok: true,
    honeypot,
    campusId,
    payload: {
      padre: { nombre, apellido, telefono, email: email || null, cedula: cedula || null, genero: null },
      hijos: familia.payload.hijos,
      autorizados: familia.payload.autorizados,
    },
  }
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function booleano(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

/** The review form at the table, prefilled from a stored payload (defensive: it is jsonb). */
export function formDesdePreregistro(payload: PreregistroPayload): { form: FamiliaForm; email: string } {
  const p: Objeto = esObjeto(payload) ? (payload as unknown as Objeto) : {}
  const padre: Objeto = esObjeto(p.padre) ? p.padre : {}
  const hijos = (Array.isArray(p.hijos) ? p.hijos : []).filter(esObjeto)
  const autorizados = (Array.isArray(p.autorizados) ? p.autorizados : []).filter(esObjeto)
  const form: FamiliaForm = {
    padre: {
      nombre: texto(padre.nombre),
      apellido: texto(padre.apellido),
      telefono: texto(padre.telefono),
      cedula: texto(padre.cedula),
      genero: texto(padre.genero),
    },
    hijos: (hijos.length > 0 ? hijos : [{}]).map((h: Objeto) => ({
      nombre: texto(h.nombre),
      apellido: texto(h.apellido),
      fechaNacimiento: texto(h.fecha_nacimiento),
      genero: texto(h.genero),
      grado: typeof h.grado === 'number' ? String(h.grado) : '',
      alergias: texto(h.alergias),
      necesidadesEspeciales: texto(h.necesidades_especiales),
      habitos: texto(h.habitos),
      notas: texto(h.notas),
      puedeComer: booleano(h.puede_comer),
      cambioPanal: booleano(h.cambio_panal),
      autorizaImagen: booleano(h.autoriza_imagen),
      escolarizado: booleano(h.escolarizado),
    })),
    autorizados: autorizados.map((a) => ({ nombre: texto(a.nombre), telefono: texto(a.telefono), relacion: texto(a.relacion) })),
  }
  return { form, email: texto(padre.email) }
}
