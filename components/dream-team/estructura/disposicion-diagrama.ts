/**
 * Estructura — where each box of the desktop org chart goes (S12; prototype
 * `VISTA.dibujo` in prototipos/estructura/07-b-escritorio.html). A tidy
 * left-to-right layout: the campus box is the root column, one column per
 * depth after it; a leaf or folded box takes the next free row, an open box
 * sits halfway between its first and last child. The connectors are one SVG
 * path: from the parent's right edge to a rail halfway across the gap, down
 * (or up) with rounded corners, then to the child's left edge.
 *
 * Pure: it reads the visible boxes (`Organigrama.diagrama`, pre-order) and
 * returns pixels at zoom 1; the canvas scales the whole layer.
 */
import type { CajaOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'

/** Box width and height, the gap between columns and between rows (prototype `CJ`). */
export const MEDIDAS_CAJA = { ancho: 256, alto: 56, entreColumnas: 56, entreFilas: 10 } as const

/** The campus box above the direcciones. */
export const ID_RAIZ_DIAGRAMA = '__campus__'

export interface PosicionCaja {
  readonly x: number
  readonly y: number
}

export interface DisposicionDiagrama {
  /** Top-left corner of each box, the campus box included. */
  readonly posiciones: ReadonlyMap<string, PosicionCaja>
  /** Every connector, as one SVG path. */
  readonly lineas: string
  readonly ancho: number
  readonly alto: number
}

const { ancho: W, alto: H, entreColumnas: GX, entreFilas: GY } = MEDIDAS_CAJA

function camino(profundidad: number, desde: number, hasta: number): string {
  const x1 = profundidad * (W + GX) + W
  const x2 = x1 + GX
  const xm = x1 + GX / 2
  const a = desde + H / 2
  const b = hasta + H / 2
  if (a === b) return `M${x1} ${a}H${x2}`
  const s = Math.sign(b - a)
  const r = Math.min(8, Math.abs(b - a) / 2)
  return `M${x1} ${a}H${xm - r}Q${xm} ${a} ${xm} ${a + r * s}V${b - r * s}Q${xm} ${b} ${xm + r} ${b}H${x2}`
}

export function disponerDiagrama(cajas: readonly CajaOrganigrama[], raices: readonly string[]): DisposicionDiagrama {
  const porId = new Map(cajas.map((caja) => [caja.id, caja]))
  const posiciones = new Map<string, PosicionCaja>()
  const tramos: string[] = []
  let siguienteFila = 0
  let ancho = 0

  /** Places the box (and its open branch) and returns its top. */
  function colocar(id: string, hijos: readonly string[], columna: number): number {
    const visibles = hijos.filter((hijo) => porId.has(hijo))
    let arriba: number
    if (visibles.length === 0) {
      arriba = siguienteFila
      siguienteFila += H + GY
    } else {
      const tops = visibles.map((hijo) => colocar(hijo, porId.get(hijo)?.abierto ? (porId.get(hijo)?.hijos ?? []) : [], columna + 1))
      arriba = (tops[0] + tops[tops.length - 1]) / 2
      for (const top of tops) tramos.push(camino(columna, arriba, top))
    }
    const x = columna * (W + GX)
    ancho = Math.max(ancho, x + W)
    posiciones.set(id, { x, y: arriba })
    return arriba
  }

  colocar(ID_RAIZ_DIAGRAMA, raices, 0)
  return { posiciones, lineas: tramos.join(''), ancho, alto: Math.max(H, siguienteFila - GY) }
}
