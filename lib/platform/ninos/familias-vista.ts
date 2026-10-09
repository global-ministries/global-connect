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
  /** False for a child linked to a parent (e.g. "Agregar Familiar") that has no ninos_fichas row yet. */
  tiene_ficha: boolean
  autorizados: AutorizadoEncontrado[]
}

export type PadreDeFamilia = { id: string; nombre: string; apellido: string; telefono: string | null }

export type FamiliaEncontrada = {
  id: string
  nombre: string
  apellido: string
  telefono: string | null
  cedula: string | null
  hijos: HijoEncontrado[]
  /** Every parent of the family's children, the matched parent first. */
  padres: PadreDeFamilia[]
  /**
   * True for an existing adult with no Niños children, found by exact cédula
   * or phone (N11). Their telefono/cedula come masked (•••1234).
   */
  sin_hijos?: boolean
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
    .map((f) => {
      const familia = f as unknown as FamiliaEncontrada
      const padres = Array.isArray(f.padres)
        ? (f.padres as unknown[]).filter((p): p is PadreDeFamilia => esObjeto(p) && typeof p.id === 'string')
        : []
      return {
        ...familia,
        sin_hijos: f.sin_hijos === true,
        hijos: Array.isArray(f.hijos)
          ? (f.hijos as unknown[])
              .filter((h): h is Record<string, unknown> => esObjeto(h) && typeof h.id === 'string')
              .map((h) => ({
                ...(h as unknown as HijoEncontrado),
                tiene_ficha: h.tiene_ficha !== false,
                autorizados: Array.isArray(h.autorizados) ? (h.autorizados as AutorizadoEncontrado[]) : [],
              }))
          : [],
        padres:
          padres.length > 0
            ? padres
            : [{ id: familia.id, nombre: familia.nombre, apellido: familia.apellido, telefono: familia.telefono ?? null }],
      }
    })
}

/**
 * One card per family: search results whose children overlap (the mother and
 * the father of the same children both matched) are merged. The first result
 * keeps its place and id; children and parents are listed once.
 */
export function agruparFamilias(familias: readonly FamiliaEncontrada[]): FamiliaEncontrada[] {
  const grupos: FamiliaEncontrada[] = []
  for (const f of familias) {
    const ids = new Set(f.hijos.map((h) => h.id))
    const grupo = ids.size > 0 ? grupos.find((g) => g.hijos.some((h) => ids.has(h.id))) : undefined
    if (!grupo) {
      grupos.push({ ...f, hijos: [...f.hijos], padres: [...f.padres] })
      continue
    }
    for (const h of f.hijos) if (!grupo.hijos.some((x) => x.id === h.id)) grupo.hijos.push(h)
    for (const p of f.padres) if (!grupo.padres.some((x) => x.id === p.id)) grupo.padres.push(p)
  }
  return grupos
}

/**
 * The children an adult can be linked to from a search: each child once,
 * skipping those already in the adult's own family.
 */
export function hijosParaVincular(familias: readonly FamiliaEncontrada[], adultoId: string): HijoEncontrado[] {
  const propios = new Set(familias.filter((f) => f.id === adultoId).flatMap((f) => f.hijos.map((h) => h.id)))
  const vistos = new Set<string>()
  const hijos: HijoEncontrado[] = []
  for (const f of familias) {
    for (const h of f.hijos) {
      if (propios.has(h.id) || vistos.has(h.id)) continue
      vistos.add(h.id)
      hijos.push(h)
    }
  }
  return hijos
}

/** A child offered by ninos_buscar_hijos_vincular (N12): only name, age and masked cédula. */
export type HijoParaVincular = { id: string; nombre: string; apellido: string; edad_anos: number | null; cedula: string | null }

export function parseHijosParaVincular(data: unknown): HijoParaVincular[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null && typeof (h as { id?: unknown }).id === 'string')
    .map((h) => ({
      id: h.id as string,
      nombre: typeof h.nombre === 'string' ? h.nombre : '',
      apellido: typeof h.apellido === 'string' ? h.apellido : '',
      edad_anos: typeof h.edad_anos === 'number' ? h.edad_anos : null,
      cedula: typeof h.cedula === 'string' ? h.cedula : null,
    }))
}

/** "8 años · C.I. •••5504"; an unknown age (only in "Revisar edad") reads "Sin fecha de nacimiento". */
export function detalleHijo(h: HijoParaVincular): string {
  const edad = h.edad_anos === null ? 'Sin fecha de nacimiento' : h.edad_anos === 1 ? '1 año' : `${h.edad_anos} años`
  return [edad, h.cedula ? `C.I. ${h.cedula}` : null].filter(Boolean).join(' · ')
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
    salonPreferidoId: h.salon_preferido_id ?? '',
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
