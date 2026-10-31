/**
 * Estudiantes — the optimistic marks of the leader list (artboards 01 / 05;
 * A4: every tap saves at once; G1: a second tap on the same state clears it).
 *
 * The screen keeps, per person, the value it shows while the server call is
 * running (`pendientes`, with a version per tap) and the last value the
 * server accepted in this session (`confirmadas`). Without either, the mark
 * of the page data (`base`) shows. A failure rolls back only the tap that
 * failed: a newer pending tap stays.
 */
import type { Marca } from './lista-datos'

export interface MarcaLocal {
  readonly estado: Marca | null
  readonly marcadoAt: string | null
}

export interface PeticionMarca {
  readonly personaId: string
  /** `null` clears the mark. */
  readonly estado: Marca | null
  readonly version: number
}

interface Pendiente {
  readonly valor: MarcaLocal
  readonly version: number
}

export interface EstadoMarcas {
  readonly confirmadas: Readonly<Record<string, MarcaLocal>>
  readonly pendientes: Readonly<Record<string, Pendiente>>
  /** Last version handed out. */
  readonly version: number
}

export const MARCAS_VACIAS: EstadoMarcas = { confirmadas: {}, pendientes: {}, version: 0 }

/** A tap sets the state; tapping the state it already has clears it. */
export function siguienteEstado(actual: Marca | null, toque: Marca): Marca | null {
  return actual === toque ? null : toque
}

/** What the row shows: the pending tap, else the value saved in this session, else the page data. */
export function marcaVisible(marcas: EstadoMarcas, personaId: string, base: MarcaLocal): MarcaLocal {
  return marcas.pendientes[personaId]?.valor ?? marcas.confirmadas[personaId] ?? base
}

const sin = <T>(registro: Readonly<Record<string, T>>, clave: string): Record<string, T> => {
  const copia = { ...registro }
  delete copia[clave]
  return copia
}

export function tocarMarca(
  marcas: EstadoMarcas,
  personaId: string,
  base: MarcaLocal,
  toque: Marca,
  ahora: string,
): { readonly marcas: EstadoMarcas; readonly peticion: PeticionMarca } {
  const estado = siguienteEstado(marcaVisible(marcas, personaId, base).estado, toque)
  const version = marcas.version + 1
  const valor: MarcaLocal = { estado, marcadoAt: estado ? ahora : null }
  return {
    marcas: { ...marcas, version, pendientes: { ...marcas.pendientes, [personaId]: { valor, version } } },
    peticion: { personaId, estado, version },
  }
}

/** The server saved `peticion`: it becomes the confirmed value; it stops pending unless a newer tap is running. */
export function confirmarMarca(marcas: EstadoMarcas, peticion: PeticionMarca): EstadoMarcas {
  const pendiente = marcas.pendientes[peticion.personaId]
  const esUltima = pendiente?.version === peticion.version
  // An older answer has no time of its own to show; the newer tap still pending covers it.
  const confirmada: MarcaLocal = esUltima ? pendiente.valor : { estado: peticion.estado, marcadoAt: null }
  return {
    ...marcas,
    confirmadas: { ...marcas.confirmadas, [peticion.personaId]: confirmada },
    pendientes: esUltima ? sin(marcas.pendientes, peticion.personaId) : marcas.pendientes,
  }
}

/** The server refused `peticion`: drop it when it is still the latest tap, so the saved value shows again. */
export function revertirMarca(marcas: EstadoMarcas, peticion: PeticionMarca): EstadoMarcas {
  if (marcas.pendientes[peticion.personaId]?.version !== peticion.version) return marcas
  return { ...marcas, pendientes: sin(marcas.pendientes, peticion.personaId) }
}
