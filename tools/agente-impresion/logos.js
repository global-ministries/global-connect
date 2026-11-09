'use strict'
/**
 * Area mascots. A logo is a 1-bit uncompressed BMP in `logos/<area>.bmp`
 * (`waumba.bmp`, `upstreet.bmp`). It is read once into rows of black dots and
 * scaled to the header height of each label size, then sent as a TSPL
 * BITMAP. With no file, the label shows only the area name.
 */
const fs = require('node:fs')
const path = require('node:path')

/**
 * @param {Buffer} buf
 * @returns {boolean[][] | null} rows top first, true = black dot
 */
function bmpAMatriz(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 62 || buf.toString('latin1', 0, 2) !== 'BM') return null
  const inicio = buf.readUInt32LE(10)
  const dib = buf.readUInt32LE(14)
  const ancho = buf.readInt32LE(18)
  const altoBruto = buf.readInt32LE(22)
  const bpp = buf.readUInt16LE(28)
  const compresion = buf.readUInt32LE(30)
  if (bpp !== 1 || compresion !== 0 || ancho <= 0 || altoBruto === 0) return null
  const alto = Math.abs(altoBruto)
  const paleta = 14 + dib
  const luz = (i) => {
    const o = paleta + i * 4
    return buf[o] + buf[o + 1] + buf[o + 2] // B + G + R
  }
  const negro = luz(0) <= luz(1) ? 0 : 1
  const bytesFila = Math.ceil(ancho / 32) * 4
  if (buf.length < inicio + bytesFila * alto) return null

  const filas = []
  for (let f = 0; f < alto; f++) {
    const origen = altoBruto > 0 ? alto - 1 - f : f // positive height = bottom-up
    const o = inicio + origen * bytesFila
    const fila = []
    for (let x = 0; x < ancho; x++) fila.push(((buf[o + (x >> 3)] >> (7 - (x & 7))) & 1) === negro)
    filas.push(fila)
  }
  return filas
}

/**
 * Scales a matrix (nearest neighbour) to `alto` dots and packs it for TSPL
 * BITMAP: 8 dots per byte, most significant bit first, 0 = black.
 * @param {boolean[][]} matriz
 * @param {number} alto
 */
function matrizAMapa(matriz, alto) {
  const altoOrigen = matriz.length
  const anchoOrigen = matriz[0]?.length ?? 0
  const ancho = Math.max(1, Math.round((anchoOrigen * alto) / altoOrigen))
  const anchoBytes = Math.ceil(ancho / 8)
  const datos = Buffer.alloc(anchoBytes * alto, 0xff)
  for (let y = 0; y < alto; y++) {
    const fila = matriz[Math.min(altoOrigen - 1, Math.floor((y * altoOrigen) / alto))]
    for (let x = 0; x < ancho; x++) {
      if (fila[Math.min(anchoOrigen - 1, Math.floor((x * anchoOrigen) / ancho))]) {
        datos[y * anchoBytes + (x >> 3)] &= ~(0x80 >> (x & 7))
      }
    }
  }
  return { anchoBytes, ancho, alto, datos }
}

/** Reads every `<area>.bmp` in `dir`; a missing or invalid file is skipped. */
function cargarLogos(dir, log = () => {}) {
  const logos = {}
  let archivos = []
  try { archivos = fs.readdirSync(dir) } catch { return logos }
  for (const archivo of archivos) {
    if (!archivo.toLowerCase().endsWith('.bmp')) continue
    const area = archivo.slice(0, -4).toLowerCase()
    const matriz = bmpAMatriz(fs.readFileSync(path.join(dir, archivo)))
    if (matriz) logos[area] = matriz
    else log(`[agente] logo ignorado (no es un BMP de 1 bit sin compresión): ${archivo}`)
  }
  return logos
}

module.exports = { bmpAMatriz, matrizAMapa, cargarLogos }
