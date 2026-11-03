'use strict'
/**
 * windows-1252 encoder for the printer's built-in fonts (TSPL `CODEPAGE 1252`).
 * 0x00–0x7F and 0xA0–0xFF match Unicode; 0x80–0x9F hold the typographic
 * characters below. Control characters and anything windows-1252 cannot hold
 * become «?». The text is composed first (NFC), because macOS may hand over
 * decomposed accents.
 */

const BLOQUE_80 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}

const DESCONOCIDO = 0x3f // ?

/** @param {string} texto @returns {Buffer} */
function aWindows1252(texto) {
  const bytes = []
  for (const c of String(texto).normalize('NFC')) {
    const cp = c.codePointAt(0)
    if (cp === 0x0d || cp === 0x0a) bytes.push(cp)
    else if (cp < 0x20 || cp === 0x7f) bytes.push(DESCONOCIDO)
    else if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) bytes.push(cp)
    else bytes.push(BLOQUE_80[c] ?? DESCONOCIDO)
  }
  return Buffer.from(bytes)
}

module.exports = { aWindows1252 }
