/**
 * @jest-environment node
 *
 * N6c (odd/tasks/ninos-v2.md, S10): the print agent's TSPL renderer. Labels
 * follow design/ninos-etiquetas (01–03) proportionally between 50×30 and
 * 102×51 mm, and the text goes to the printer as windows-1252 bytes.
 */
import { aWindows1252 } from '@/tools/agente-impresion/cp1252'
import { bmpAMatriz, matrizAMapa } from '@/tools/agente-impresion/logos'
import { componerEtiqueta as componerJs, renderizarEtiqueta } from '@/tools/agente-impresion/tspl'

type Elemento = { tipo: string; x: number; y: number; ancho: number; alto: number; texto?: string; contenido?: string; fuente?: string }
type Etiqueta = { ancho: number; alto: number; elementos: Elemento[] }
const componerEtiqueta = (...args: Parameters<typeof componerJs>) => componerJs(...args) as unknown as Etiqueta | null

const M102 = { ancho_mm: 102, alto_mm: 51, dpi: 203 }
const M50 = { ancho_mm: 50, alto_mm: 30, dpi: 203 }

const nino = (p: Record<string, unknown> = {}) => ({
  id: 'n1',
  tipo: 'nino' as const,
  intentos: 1,
  created_at: '2026-11-08T13:05:00Z',
  payload: {
    nombre: 'Valentina', apellido: 'Rodríguez Peña', codigo: '4827', salon: 'Salón 3 años',
    area: 'waumba', alergias: true, fecha: '2026-11-08', servicio: 'Segundo servicio', hora: '11:00',
    ...p,
  },
})

const representante = (p: Record<string, unknown> = {}) => ({
  id: 'r1',
  tipo: 'representante' as const,
  intentos: 1,
  created_at: '2026-11-08T13:05:00Z',
  payload: {
    codigo: '4827', ninos: ['Valentina', 'Santiago'], areas: ['waumba'],
    fecha: '2026-11-08', servicio: 'Segundo servicio', hora: '11:00',
    ...p,
  },
})

const texto = (b: Buffer) => b.toString('latin1')
const textos = (els: Elemento[]) => els.filter((e) => e.tipo === 'texto').map((e) => e.texto)

function dentro(et: { ancho: number; alto: number; elementos: Elemento[] }) {
  for (const e of et.elementos) {
    expect(e.x).toBeGreaterThanOrEqual(0)
    expect(e.y).toBeGreaterThanOrEqual(0)
    expect(e.x + e.ancho).toBeLessThanOrEqual(et.ancho)
    expect(e.y + e.alto).toBeLessThanOrEqual(et.alto)
  }
}

describe('aWindows1252', () => {
  it('encodes Spanish accents, ñ and ü as single windows-1252 bytes', () => {
    expect([...aWindows1252('á é í ó ú ñ Ñ ü')]).toEqual([
      0xe1, 0x20, 0xe9, 0x20, 0xed, 0x20, 0xf3, 0x20, 0xfa, 0x20, 0xf1, 0x20, 0xd1, 0x20, 0xfc,
    ])
    expect([...aWindows1252('ÁÉÍÓÚÜ')]).toEqual([0xc1, 0xc9, 0xcd, 0xd3, 0xda, 0xdc])
  })

  it('composes decomposed accents (macOS input) before encoding', () => {
    expect([...aWindows1252('n\u0303a\u0301')]).toEqual([0xf1, 0xe1])
  })

  it('maps the 0x80–0x9F block and replaces what windows-1252 cannot hold', () => {
    expect([...aWindows1252('€…·º')]).toEqual([0x80, 0x85, 0xb7, 0xba])
    expect([...aWindows1252('a😀b')]).toEqual([0x61, 0x3f, 0x62])
    expect([...aWindows1252('a\u0007b')]).toEqual([0x61, 0x3f, 0x62])
  })
})

describe('renderizarEtiqueta', () => {
  it('returns null and prints nothing while the label size is not configured', () => {
    expect(renderizarEtiqueta(nino(), { ancho_mm: null, alto_mm: 51, dpi: 203 })).toBeNull()
    expect(renderizarEtiqueta(nino(), { ancho_mm: 102, alto_mm: null, dpi: 203 })).toBeNull()
    expect(componerEtiqueta(representante(), { ancho_mm: null, alto_mm: null, dpi: 203 })).toBeNull()
  })

  it.each([
    [M102, 'SIZE 102 mm,51 mm'],
    [M50, 'SIZE 50 mm,30 mm'],
  ])('builds a TSPL job for %o', (medidas, size) => {
    const t = texto(renderizarEtiqueta(nino(), medidas) as Buffer)
    const lineas = t.split('\r\n')
    expect(lineas[0]).toBe(size)
    expect(lineas).toEqual(expect.arrayContaining(['CODEPAGE 1252', 'CLS', 'DIRECTION 1,0']))
    expect(lineas.some((l) => l.startsWith('GAP '))).toBe(true)
    expect(t.endsWith('PRINT 1,1\r\n')).toBe(true)
    expect(lineas.filter((l) => l.startsWith('TEXT ')).length).toBeGreaterThan(3)
  })

  it.each([M102, M50])('draws the black ALERGIA block only when alergias is true (%o)', (medidas) => {
    const con = componerEtiqueta(nino({ alergias: true }), medidas)!
    const sin = componerEtiqueta(nino({ alergias: false }), medidas)!
    expect(textos(con.elementos)).toContain('ALERGIA')
    expect(con.elementos.filter((e: Elemento) => e.tipo === 'invertir')).toHaveLength(1)
    expect(textos(sin.elementos)).not.toContain('ALERGIA')
    expect(sin.elementos.some((e: Elemento) => e.tipo === 'invertir')).toBe(false)
    expect(texto(renderizarEtiqueta(nino({ alergias: true }), medidas)!)).toMatch(/\r\nREVERSE \d+,\d+,\d+,\d+\r\n/)
    expect(texto(renderizarEtiqueta(nino({ alergias: false }), medidas)!)).not.toMatch(/ALERGIA|REVERSE/)
  })

  it.each([M102, M50, { ancho_mm: 76, alto_mm: 40, dpi: 203 }, { ancho_mm: 102, alto_mm: 51, dpi: 300 }])(
    'keeps every element inside the label (%o)',
    (medidas) => {
      for (const t of [nino(), nino({ alergias: false }), representante(), representante({ ninos: ['A', 'B', 'C', 'D'] })]) {
        dentro(componerEtiqueta(t, medidas)!)
      }
      dentro(componerEtiqueta(nino({ nombre: 'María Fernanda de los Ángeles', apellido: 'Hernández Villalobos de la Santísima Trinidad' }), medidas)!)
    },
  )

  it.each([M102, M50, { ancho_mm: 76, alto_mm: 40, dpi: 203 }])('never overlaps two texts, nor a text with a rule (%o)', (medidas) => {
    const choca = (a: Elemento, b: Elemento) =>
      a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto
    const largo = { nombre: 'María Fernanda de los Ángeles', apellido: 'Hernández Villalobos de la Santísima Trinidad', salon: '6.º grado sección B turno mañana' }
    for (const t of [nino(largo), representante({ ninos: ['Matías', 'Daniela', 'Andrés', 'Luis'], areas: ['upstreet', 'waumba'] })]) {
      const els = componerEtiqueta(t, medidas)!.elementos
      const planos = els.filter((e) => e.tipo === 'texto' || e.tipo === 'barra' || e.tipo === 'qr')
      planos.forEach((a, i) => planos.slice(i + 1).forEach((b) => expect([a, b, choca(a, b)]).toEqual([a, b, false])))
    }
  })

  it('uses the larger built-in fonts rather than blowing up font 1', () => {
    const et = componerEtiqueta(nino(), M102)!
    const area = et.elementos.find((e: Elemento) => e.texto === 'WAUMBA LAND')
    expect(area?.fuente).not.toBe('1')
  })

  it('prints the full name, the área, the code and the salón in upper/lower case as designed', () => {
    const et = componerEtiqueta(nino(), M102)!
    const ts = textos(et.elementos)
    expect(ts).toEqual(expect.arrayContaining(['VALENTINA', 'Rodríguez Peña', '4827', 'Salón 3 años', 'WAUMBA LAND', 'Dom 8 nov · 11:00']))
    expect(textos(componerEtiqueta(nino({ area: 'upstreet' }), M50)!.elementos)).toEqual(
      expect.arrayContaining(['UPSTREET', '8/11 · 11:00']),
    )
  })

  it('shrinks a long name, then prints only the first name; the last name is cut with «…»', () => {
    const largo = { nombre: 'María Fernanda de los Ángeles', apellido: 'Hernández Villalobos de la Santísima Trinidad' }
    expect(textos(componerEtiqueta(nino({ nombre: 'María Fernanda' }), M102)!.elementos)).toContain('MARÍA FERNANDA')
    for (const m of [M102, M50]) {
      const ts = textos(componerEtiqueta(nino(largo), m)!.elementos)
      expect(ts).toContain('MARÍA')
      const ape = ts.find((t) => t?.startsWith('Hernández'))
      expect(ape).toMatch(/…$/)
    }
  })

  it('sends accents and ñ as windows-1252 bytes, never UTF-8', () => {
    const b = renderizarEtiqueta(nino({ nombre: 'Ñañez', apellido: 'Muñoz Briceño' }), M102)!
    expect(b.includes(Buffer.from([0xd1, 0x41, 0xd1, 0x45, 0x5a]))).toBe(true) // ÑAÑEZ
    expect(b.includes(Buffer.from('Muñoz Briceño', 'latin1'))).toBe(true)
    expect(b.includes(Buffer.from([0xc3]))).toBe(false)
  })

  it('escapes double quotes inside TEXT', () => {
    const t = texto(renderizarEtiqueta(nino({ apellido: 'O"Neil' }), M102)!)
    expect(t).toContain('O\\["]Neil')
  })

  it('parent label: QR with the qr field or the código, up to 3 first names + «y N más»', () => {
    const et = componerEtiqueta(representante({ ninos: ['María Fernanda', 'Jesús Alejandro'] }), M102)!
    const qr = et.elementos.find((e: Elemento) => e.tipo === 'qr')!
    expect(qr.contenido).toBe('4827')
    expect(textos(et.elementos)).toEqual(expect.arrayContaining(['4827', 'María · Jesús', 'Presenta esta etiqueta para retirar']))
    expect(texto(renderizarEtiqueta(representante({ qr: 'tok-abc' }), M102)!)).toMatch(/QRCODE \d+,\d+,M,\d+,A,0,"tok-abc"/)
    const cuatro = textos(componerEtiqueta(representante({ ninos: ['Matías', 'Daniela', 'Andrés', 'Luis'] }), M102)!.elementos)
    expect(cuatro.join(' ')).toContain('Matías, Daniela, Andrés y 1 más')
  })

  it('parent label with children in two areas uses the neutral header', () => {
    const ts = textos(componerEtiqueta(representante({ areas: ['upstreet', 'waumba'] }), M102)!.elementos)
    expect(ts).toContain('NIÑOS · GLOBAL')
    expect(ts).not.toContain('WAUMBA LAND')
  })

  it('draws the area mascot as a BITMAP when a logo exists, and only the name otherwise', () => {
    const logo = [[true, false], [false, true]]
    const con = componerEtiqueta(nino(), M102, { logos: { waumba: logo } })!
    expect(con.elementos.filter((e: Elemento) => e.tipo === 'mapa')).toHaveLength(1)
    expect(texto(renderizarEtiqueta(nino(), M102, { logos: { waumba: logo } })!)).toMatch(/\r\nBITMAP \d+,\d+,\d+,\d+,0,/)
    expect(componerEtiqueta(nino(), M102)!.elementos.some((e: Elemento) => e.tipo === 'mapa')).toBe(false)
    const dos = componerEtiqueta(representante({ areas: ['upstreet', 'waumba'] }), M102, { logos: { waumba: logo, upstreet: logo } })!
    expect(dos.elementos.filter((e: Elemento) => e.tipo === 'mapa')).toHaveLength(2)
  })
})

describe('logos', () => {
  // 1-bit BMP, 3×2 px, bottom-up; palette 0 = black, 1 = white.
  function bmp(): Buffer {
    const filas = [
      [1, 0, 1], // bottom row: white black white
      [0, 1, 1], // top row:    black white white
    ]
    const datos = Buffer.alloc(8)
    filas.forEach((f, i) => {
      datos[i * 4] = f.reduce((b, bit, x) => b | (bit << (7 - x)), 0)
    })
    const cab = Buffer.alloc(62)
    cab.write('BM', 0, 'latin1')
    cab.writeUInt32LE(62 + 8, 2)
    cab.writeUInt32LE(62, 10)
    cab.writeUInt32LE(40, 14)
    cab.writeInt32LE(3, 18)
    cab.writeInt32LE(2, 22)
    cab.writeUInt16LE(1, 26)
    cab.writeUInt16LE(1, 28)
    cab.writeUInt32LE(0, 30)
    cab.writeUInt32LE(0x00000000, 54) // palette 0: black
    cab.writeUInt32LE(0x00ffffff, 58) // palette 1: white
    return Buffer.concat([cab, datos])
  }

  it('reads a 1-bit BMP into rows of black dots (top row first)', () => {
    expect(bmpAMatriz(bmp())).toEqual([
      [true, false, false],
      [false, true, false],
    ])
  })

  it('refuses anything that is not an uncompressed 1-bit BMP', () => {
    expect(bmpAMatriz(Buffer.from('nope'))).toBeNull()
  })

  it('packs a matrix to TSPL BITMAP bytes (0 = black), scaled to the height', () => {
    const m = matrizAMapa([[true, false], [false, true]], 2)
    expect(m).toEqual({ anchoBytes: 1, ancho: 2, alto: 2, datos: Buffer.from([0x7f, 0xbf]) })
    expect(matrizAMapa([[true]], 4)).toMatchObject({ ancho: 4, alto: 4, datos: Buffer.from([0x0f, 0x0f, 0x0f, 0x0f]) })
  })
})
