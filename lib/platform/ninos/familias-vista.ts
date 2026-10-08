/**
 * Read side of the Familias screen (odd/tasks/ninos-checkin.md, N3): parses
 * the ninos_buscar_familias jsonb and decides which room to show for a child.
 * D4: when the rule finds no room the result is 'ninguno' and the UI asks for
 * a manual choice; a room picked by hand (salon_preferido_id) wins.
 */
import type { HijoForm } from './familia'
import { sugerirSalon, type SalonSugerible } from './sugerir-salon'

export type AutorizadoEncontrado = { id: string; nombre: string; telefono: string | null; relacion: string | null }

export type HijoEncontrado = {
  id: string
  nombre: string
  apellido: string
  fecha_nacimiento: string | null
  genero: string | null
  grado: number | null
  alergias: string | null
  necesidades_especiales: string | null
  habitos: string | null
  notas: string | null
  puede_comer: boolean | null
  cambio_panal: boolean | null
  autoriza_imagen: boolean | null
  escolarizado: boolean | null
  salon_preferido_id: string | null
  es_vip_desde: string | null
  autorizados: AutorizadoEncontrado[]
}

export type FamiliaEncontrada = {
  id: string
  nombre: string
  apellido: string
  telefono: string | null
  cedula: string | null
  hijos: HijoEncontrado[]
}

/** A ninos_salones row as selected by the screen. */
export type SalonFila = {
  id: string
  nombre: string
  area: 'waumba' | 'upstreet'
  edad_min_meses: number | null
  edad_max_meses: number | null
  grado_min: number | null
  grado_max: number | null
  es_necesidades_especiales: boolean
  activo: boolean
  orden: number
}

export type SalonVista = SalonSugerible & { nombre: string }

export type SalonParaHijo =
  | { tipo: 'elegido'; salon: SalonVista }
  | { tipo: 'sugerido'; salon: SalonVista }
  | { tipo: 'ninguno' }

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function parseFamilias(data: unknown): FamiliaEncontrada[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((f): f is Record<string, unknown> => esObjeto(f) && typeof f.id === 'string')
    .map((f) => ({
      ...(f as unknown as FamiliaEncontrada),
      hijos: Array.isArray(f.hijos)
        ? (f.hijos as unknown[])
            .filter((h): h is HijoEncontrado => esObjeto(h) && typeof h.id === 'string')
            .map((h) => ({ ...h, autorizados: Array.isArray(h.autorizados) ? h.autorizados : [] }))
        : [],
    }))
}

export function aSalonSugerible(s: SalonFila): SalonVista {
  return {
    id: s.id,
    nombre: s.nombre,
    area: s.area,
    edadMinMeses: s.edad_min_meses,
    edadMaxMeses: s.edad_max_meses,
    gradoMin: s.grado_min,
    gradoMax: s.grado_max,
    esNecesidadesEspeciales: s.es_necesidades_especiales,
    activo: s.activo,
    orden: s.orden,
  }
}

export function salonParaHijo(hijo: HijoEncontrado, salones: readonly SalonFila[], fechaServicio: string): SalonParaHijo {
  const vistas = salones.map(aSalonSugerible)
  const elegido = vistas.find((s) => s.id === hijo.salon_preferido_id && s.activo)
  if (elegido) return { tipo: 'elegido', salon: elegido }
  const sugerido = sugerirSalon({
    fechaNacimiento: hijo.fecha_nacimiento,
    grado: hijo.grado,
    necesidadesEspeciales: Boolean(hijo.necesidades_especiales),
    fechaServicio,
    salones: vistas,
  })
  return sugerido ? { tipo: 'sugerido', salon: sugerido } : { tipo: 'ninguno' }
}

export function hijoAForm(h: HijoEncontrado): HijoForm {
  return {
    nombre: h.nombre,
    apellido: h.apellido,
    fechaNacimiento: h.fecha_nacimiento ?? '',
    genero: h.genero ?? '',
    grado: h.grado === null ? '' : String(h.grado),
    alergias: h.alergias ?? '',
    necesidadesEspeciales: h.necesidades_especiales ?? '',
    habitos: h.habitos ?? '',
    notas: h.notas ?? '',
    puedeComer: h.puede_comer,
    cambioPanal: h.cambio_panal,
    autorizaImagen: h.autoriza_imagen,
    escolarizado: h.escolarizado,
  }
}
