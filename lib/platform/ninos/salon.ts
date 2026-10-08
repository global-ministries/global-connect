/**
 * Room list logic (odd/tasks/ninos-checkin.md, N5): one row of
 * ninos_lista_salon, its age or grade, and the alerts the room must see.
 */
import { GRADOS } from './familia'
import { edadEnMeses } from './sugerir-salon'

export type FilaLista = {
  nino_id: string
  nombre: string
  apellido: string
  fecha_nacimiento: string | null
  grado: number | null
  codigo: string
  entrada_at: string
  alergias: string | null
  necesidades_especiales: string | null
  habitos: string | null
  puede_comer: boolean | null
  cambio_panal: boolean | null
  autoriza_imagen: boolean | null
}

/** "2º grado" when the child has a grade, else "18 meses" / "4 años". */
export function edadOGrado(f: Pick<FilaLista, 'grado' | 'fecha_nacimiento'>, fechaServicio: string): string {
  if (f.grado !== null && f.grado !== undefined) {
    return GRADOS.find((g) => g.valor === String(f.grado))?.label ?? `${f.grado}º grado`
  }
  const meses = edadEnMeses(f.fecha_nacimiento, fechaServicio)
  if (meses === null) return ''
  return meses < 24 ? `${meses} meses` : `${Math.floor(meses / 12)} años`
}

export type AlertaLista = { texto: string; grave: boolean }

/** Allergies first (grave), then special needs, diaper, food and photos. */
export function alertasDeLista(f: FilaLista): AlertaLista[] {
  const a: AlertaLista[] = []
  if (f.alergias) a.push({ texto: `Alergias: ${f.alergias}`, grave: true })
  if (f.necesidades_especiales) a.push({ texto: `Necesidades especiales: ${f.necesidades_especiales}`, grave: false })
  if (f.cambio_panal) a.push({ texto: 'Cambio de pañal', grave: false })
  if (f.puede_comer === false) a.push({ texto: 'No puede comer merienda', grave: false })
  if (f.autoriza_imagen === false) a.push({ texto: 'Sin fotos', grave: false })
  return a
}
