/**
 * The optimistic marks of the leader list (A4: save on tap; G1: a second tap
 * on the same state clears it). The screen shows the pending value at once,
 * keeps it when the server agrees and rolls it back when it fails, without
 * undoing a newer tap.
 */
import {
  MARCAS_VACIAS,
  confirmarMarca,
  marcaVisible,
  revertirMarca,
  siguienteEstado,
  tocarMarca,
  type MarcaLocal,
} from '@/lib/platform/estudiantes/marcas'

const SIN: MarcaLocal = { estado: null, marcadoAt: null }
const PRESENTE: MarcaLocal = { estado: 'presente', marcadoAt: '2026-10-25T13:12:00.000Z' }
const AHORA = '2026-10-25T13:40:00.000Z'
const DESPUES = '2026-10-25T13:41:00.000Z'

describe('siguienteEstado', () => {
  it('a tap sets the state; the same tap again clears it', () => {
    expect(siguienteEstado(null, 'presente')).toBe('presente')
    expect(siguienteEstado('ausente', 'presente')).toBe('presente')
    expect(siguienteEstado('presente', 'presente')).toBeNull()
    expect(siguienteEstado('ausente', 'ausente')).toBeNull()
  })
})

describe('tocarMarca', () => {
  it('shows the new state at once and asks the server for it', () => {
    const { marcas, peticion } = tocarMarca(MARCAS_VACIAS, 'p1', SIN, 'presente', AHORA)
    expect(peticion).toEqual({ personaId: 'p1', estado: 'presente', version: 1 })
    expect(marcaVisible(marcas, 'p1', SIN)).toEqual({ estado: 'presente', marcadoAt: AHORA })
    expect(marcas.pendientes.p1).toBeDefined()
  })

  it('a second tap on the same state asks to clear it', () => {
    const { peticion, marcas } = tocarMarca(MARCAS_VACIAS, 'p1', PRESENTE, 'presente', AHORA)
    expect(peticion.estado).toBeNull()
    expect(marcaVisible(marcas, 'p1', PRESENTE)).toEqual(SIN)
  })

  it('reads the base mark of the server when nothing is local', () => {
    expect(marcaVisible(MARCAS_VACIAS, 'p1', PRESENTE)).toBe(PRESENTE)
  })
})

describe('confirmarMarca', () => {
  it('keeps the value once the server saved it and leaves nothing pending', () => {
    const { marcas, peticion } = tocarMarca(MARCAS_VACIAS, 'p1', SIN, 'ausente', AHORA)
    const despues = confirmarMarca(marcas, peticion)
    expect(despues.pendientes.p1).toBeUndefined()
    expect(marcaVisible(despues, 'p1', SIN)).toEqual({ estado: 'ausente', marcadoAt: AHORA })
  })

  it('an older answer does not hide a newer pending tap', () => {
    const uno = tocarMarca(MARCAS_VACIAS, 'p1', SIN, 'presente', AHORA)
    const dos = tocarMarca(uno.marcas, 'p1', SIN, 'ausente', DESPUES)
    const despues = confirmarMarca(dos.marcas, uno.peticion)
    expect(marcaVisible(despues, 'p1', SIN)).toEqual({ estado: 'ausente', marcadoAt: DESPUES })
    expect(despues.pendientes.p1?.version).toBe(dos.peticion.version)
  })
})

describe('revertirMarca', () => {
  it('rolls back to the last saved value when the server fails', () => {
    const { marcas, peticion } = tocarMarca(MARCAS_VACIAS, 'p1', PRESENTE, 'ausente', AHORA)
    const despues = revertirMarca(marcas, peticion)
    expect(marcaVisible(despues, 'p1', PRESENTE)).toBe(PRESENTE)
    expect(despues.pendientes.p1).toBeUndefined()
  })

  it('rolls back to a value confirmed earlier in the session', () => {
    const uno = tocarMarca(MARCAS_VACIAS, 'p1', SIN, 'presente', AHORA)
    const guardada = confirmarMarca(uno.marcas, uno.peticion)
    const dos = tocarMarca(guardada, 'p1', SIN, 'presente', DESPUES)
    expect(dos.peticion.estado).toBeNull()
    expect(marcaVisible(revertirMarca(dos.marcas, dos.peticion), 'p1', SIN)).toEqual({ estado: 'presente', marcadoAt: AHORA })
  })

  it('a failed older tap does not undo a newer one', () => {
    const uno = tocarMarca(MARCAS_VACIAS, 'p1', SIN, 'presente', AHORA)
    const dos = tocarMarca(uno.marcas, 'p1', SIN, 'ausente', DESPUES)
    const despues = revertirMarca(dos.marcas, uno.peticion)
    expect(marcaVisible(despues, 'p1', SIN)).toEqual({ estado: 'ausente', marcadoAt: DESPUES })
  })

  it('leaves the other people alone', () => {
    const uno = tocarMarca(MARCAS_VACIAS, 'p1', SIN, 'presente', AHORA)
    const dos = tocarMarca(uno.marcas, 'p2', SIN, 'ausente', AHORA)
    const despues = revertirMarca(dos.marcas, uno.peticion)
    expect(marcaVisible(despues, 'p1', SIN)).toEqual(SIN)
    expect(marcaVisible(despues, 'p2', SIN)).toEqual({ estado: 'ausente', marcadoAt: AHORA })
  })
})
