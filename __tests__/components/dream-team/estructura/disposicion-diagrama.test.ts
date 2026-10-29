/**
 * Where each box of the desktop org chart goes (disposicion-diagrama.ts):
 * the campus box first, one column per depth, a leaf or folded box on the
 * next free row, an open box centered on its children, and one connector per
 * visible child.
 */
import { crearOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'
import { ID_RAIZ_DIAGRAMA, MEDIDAS_CAJA, disponerDiagrama } from '@/components/dream-team/estructura/disposicion-diagrama'
import { ID_CONEXION, ID_GCP, ID_PDP, entradaEstructura } from '@/tests/helpers/estructura-fixture'

const { ancho: W, alto: H, entreColumnas: GX, entreFilas: GY } = MEDIDAS_CAJA
const organigrama = crearOrganigrama(entradaEstructura())

describe('disponerDiagrama', () => {
  it('lays out only the visible boxes, a column per depth', () => {
    const cajas = organigrama.diagrama({ expandidos: new Set([ID_CONEXION]) })
    const { posiciones } = disponerDiagrama(cajas, organigrama.raices)
    expect(posiciones.get(ID_RAIZ_DIAGRAMA)?.x).toBe(0)
    expect(posiciones.get(ID_CONEXION)?.x).toBe(W + GX)
    expect(posiciones.get(ID_GCP)?.x).toBe(2 * (W + GX))
    expect(posiciones.has(ID_PDP)).toBe(false)
    expect(posiciones.size).toBe(cajas.length + 1)
  })

  it('stacks leaves and folded boxes on rows and centers an open box on its children', () => {
    const cajas = organigrama.diagrama({ expandidos: organigrama.todosExpandidos() })
    const { posiciones, alto } = disponerDiagrama(cajas, organigrama.raices)
    const hijos = organigrama.nodo(ID_GCP)?.hijos ?? []
    const tops = hijos.map((id) => posiciones.get(id)?.y ?? NaN)
    tops.slice(1).forEach((top, i) => expect(top - tops[i]).toBe(H + GY))
    expect(posiciones.get(ID_GCP)?.y).toBe((tops[0] + tops[tops.length - 1]) / 2)
    const filas = new Set([...posiciones.values()].map((p) => p.y))
    expect(alto).toBe(Math.max(...filas) + H)
  })

  it('draws one connector per visible child, from the campus box to every root', () => {
    const cajas = organigrama.diagrama({ expandidos: new Set() })
    const { lineas, ancho } = disponerDiagrama(cajas, organigrama.raices)
    expect(lineas.match(/M/g)).toHaveLength(organigrama.raices.length)
    expect(ancho).toBe(2 * W + GX)
  })
})
