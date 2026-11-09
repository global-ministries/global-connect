'use strict'
/**
 * TSPL renderer for the Niños labels (odd/tasks/ninos-checkin-pco.md S10,
 * S9.2, S9.3; design in design/ninos-checkin-pco/03). Pure: a print job
 * (docs/ninos/impresion.md) plus the station's label size go in, the printer
 * bytes come out.
 *
 * `componerEtiqueta` lays the label out as a list of elements in printer dots
 * (each with its box, so tests can check that everything fits); `aTspl`
 * serializes them. The layout is the 102 × 51 mm prototype scaled to the
 * label, with the 50 × 30 mm prototype values as the smallest sizes; a station
 * with no size prints at 102 × 51 mm, 203 dpi. Text uses the printer's
 * built-in fixed-pitch fonts 1–5 with integer multipliers and goes out as
 * windows-1252 (`CODEPAGE 1252`). Only the fields below are read: custody,
 * phone or medical text never reach a label, whatever the payload carries.
 */
const { aWindows1252 } = require('./cp1252')
const { matrizAMapa } = require('./logos')

/** Built-in TSPL fonts: [width, height] of one character cell in dots. */
const FUENTES = { 1: [8, 12], 2: [12, 20], 3: [16, 24], 4: [24, 32], 5: [32, 48] }
const ESTILOS = Object.entries(FUENTES)
  .flatMap(([f, [w, h]]) => Array.from({ length: 10 }, (_, i) => ({ fuente: f, mul: i + 1, w: w * (i + 1), h: h * (i + 1), base: h })))
  .sort((a, b) => b.h - a.h || b.base - a.base)

/** Prototype values in mm at 102 × 51 and the floor used at 50 × 30. */
const BASE = { ancho: 102, alto: 51 }
const MEDIDAS = {
  pad: [2.5, 1.5], gap: [1, 0.6], hdr: [8, 4.8], masc: [6.6, 4], linea: [0.5, 0.375], marco: [0.75, 0.5],
  area: [4.2, 2.5], fecha: [3.4, 2.2], nom: [12, 6.2], ape: [5, 2.8], sal: [3.8, 2.4], alerta: [4, 2.4],
  cod: [16, 8.6], hijos: [3.8, 2.3], instr: [3.2, 2.2],
}

const AREAS = { waumba: 'WAUMBA LAND', upstreet: 'UPSTREET' }
const NEUTRO = 'NIÑOS · GLOBAL'
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const INSTRUCCION = 'Presenta este recibo para retirar'
/** S9.3 mark of the child label: full text, and a short one for narrow labels. */
const VISITAS = { primera: ['PRIMERA VEZ', '1.ª VEZ'], visitante: ['VISITANTE', 'VISITA'] }
/** S10: the size of a station that has none yet. */
const POR_DEFECTO = { anchoMm: 102, altoMm: 51, dpi: 203 }
/** QR byte capacity per version at ECC level M (versions 1–10). */
const CAPACIDAD_QR_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]

const largo = (t) => [...t].length
const anchoTexto = (t, e) => largo(t) * e.w

/** Label size of the station; 102 × 51 mm at 203 dpi (`porDefecto`) while it has none. */
function medidasDe(m) {
  const ancho = Number(m?.ancho_mm)
  const alto = Number(m?.alto_mm)
  if (m?.ancho_mm == null || m?.alto_mm == null || !(ancho > 0) || !(alto > 0)) return { ...POR_DEFECTO, porDefecto: true }
  const dpi = Number(m.dpi) > 0 ? Number(m.dpi) : 203
  return { anchoMm: ancho, altoMm: alto, dpi, porDefecto: false }
}

/** Among near-equal heights (sorted tallest first) the larger base font: less blocky. */
const menosTosco = (estilos) => estilos.filter((e) => e.h >= estilos[0].h * 0.85).sort((a, b) => b.base - a.base || b.h - a.h)[0]

/** The style closest to `objetivo` dots (up to 15 % over it). */
function estiloCercano(objetivo) {
  const caben = ESTILOS.filter((e) => e.h <= objetivo * 1.15)
  return caben.length ? menosTosco(caben) : ESTILOS[ESTILOS.length - 1]
}

/** The tallest style between `minimo` and `objetivo` dots in which `texto` fits `ancho`. */
function estiloQueCabe(texto, objetivo, minimo, ancho) {
  const caben = ESTILOS.filter((e) => e.h <= objetivo && e.h >= minimo && anchoTexto(texto, e) <= ancho)
  return caben.length ? menosTosco(caben) : null
}

/** Cuts `texto` to `ancho` dots, ending in «…». */
function cortar(texto, e, ancho) {
  const max = Math.floor(ancho / e.w)
  if (largo(texto) <= max) return texto
  return [...texto].slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…'
}

/** Wraps on spaces into lines of at most `ancho` dots. */
function envolver(texto, e, ancho) {
  const lineas = []
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const ultima = lineas[lineas.length - 1]
    if (ultima !== undefined && anchoTexto(`${ultima} ${palabra}`, e) <= ancho) lineas[lineas.length - 1] = `${ultima} ${palabra}`
    else lineas.push(palabra)
  }
  return lineas
}

/**
 * A text block of up to `maxLineas`: one line near the target size when it
 * fits, else the largest wrapped size that fits, else the smallest size cut.
 */
function bloque(texto, objetivo, ancho, maxLineas) {
  const candidatos = ESTILOS.filter((e) => e.h <= estiloCercano(objetivo).h)
  const unaLinea = candidatos.find((e) => e.h >= objetivo * 0.75 && anchoTexto(texto, e) <= ancho)
  if (unaLinea) return { e: unaLinea, lineas: [texto] }
  for (const e of candidatos) {
    const lineas = envolver(texto, e, ancho)
    if (lineas.length <= maxLineas && lineas.every((l) => anchoTexto(l, e) <= ancho)) return { e, lineas }
  }
  const e = ESTILOS[ESTILOS.length - 1]
  const lineas = envolver(texto, e, ancho).map((l) => cortar(l, e, ancho))
  const resto = lineas.slice(maxLineas - 1).join(' ')
  return { e, lineas: [...lineas.slice(0, maxLineas - 1), cortar(resto, e, ancho)] }
}

function formatoFecha(fecha, hora, corta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? ''))
  const h = typeof hora === 'string' && hora ? ` · ${hora}` : ''
  if (!m) return h ? hora : ''
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (corta) return `${dia}/${mes}${h}`
  const semana = DIAS[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()]
  return `${semana} ${dia} ${MESES[mes - 1]}${h}`
}

const primerNombre = (n) => String(n ?? '').trim().split(/\s+/)[0] ?? ''

/** «María · Jesús» up to three; «Matías, Daniela, Andrés y 1 más» beyond. */
function nombresHijos(ninos) {
  const nombres = (Array.isArray(ninos) ? ninos : []).map(primerNombre).filter(Boolean)
  if (nombres.length <= 3) return nombres.join(' · ')
  return `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más`
}

function versionQr(contenido) {
  const bytes = Buffer.byteLength(contenido, 'utf8')
  const i = CAPACIDAD_QR_M.findIndex((c) => bytes <= c)
  return i === -1 ? 10 : i + 1
}

/**
 * Lays out a print job at the station's size (102 × 51 mm when it has none).
 * @param {{ tipo: 'nino' | 'representante', payload: Record<string, unknown> }} trabajo
 * @param {{ ancho_mm: number | null, alto_mm: number | null, dpi?: number }} medidas
 * @param {{ logos?: Record<string, boolean[][]> }} [opciones]
 */
function componerEtiqueta(trabajo, medidas, opciones = {}) {
  const m = medidasDe(medidas)
  const k = m.dpi / 25.4
  const W = Math.round(m.anchoMm * k)
  const H = Math.round(m.altoMm * k)
  const escala = Math.min(m.anchoMm / BASE.ancho, m.altoMm / BASE.alto)
  /** Prototype size in dots: the 102 × 51 value scaled, never below the 50 × 30 one. */
  const d = (clave) => {
    const [base, minimo] = MEDIDAS[clave]
    return Math.max(1, Math.round(Math.max(minimo, base * escala) * k))
  }
  const pad = d('pad')
  const gap = d('gap')
  const linea = d('linea')
  const elementos = []
  const texto = (t, x, y, e) => {
    elementos.push({ tipo: 'texto', x, y, fuente: e.fuente, mx: e.mul, my: e.mul, texto: t, ancho: anchoTexto(t, e), alto: e.h })
  }
  const p = trabajo?.payload ?? {}
  const logos = opciones.logos ?? {}

  // Header: mascots, area name, date · time on the right, rule below.
  const areas = trabajo.tipo === 'nino' ? [p.area] : [...new Set(Array.isArray(p.areas) ? p.areas : [])]
  const nombreArea = areas.length === 1 ? AREAS[areas[0]] ?? String(areas[0] ?? 'NIÑOS').toUpperCase() : NEUTRO
  const hdr = d('hdr')
  let x = pad
  const ladoMascota = Math.min(d('masc'), hdr - gap)
  for (const area of areas) {
    if (!logos[area]) continue
    const mapa = matrizAMapa(logos[area], ladoMascota)
    if (x + mapa.ancho > W - pad) break
    elementos.push({ tipo: 'mapa', x, y: pad + Math.floor((hdr - gap - mapa.alto) / 2), ancho: mapa.ancho, alto: mapa.alto, mapa })
    x += mapa.ancho + Math.round(gap * 1.2)
  }
  const eArea = estiloCercano(Math.min(d('area'), hdr - gap))
  const area = cortar(nombreArea, eArea, W - pad - x)
  texto(area, x, pad + Math.floor((hdr - gap - eArea.h) / 2), eArea)
  x += anchoTexto(area, eArea) + 2 * gap
  const eFecha = estiloCercano(Math.min(d('fecha'), hdr - gap))
  const fecha = formatoFecha(p.fecha, p.hora, escala < 0.7)
  if (fecha && anchoTexto(fecha, eFecha) <= W - pad - x) {
    texto(fecha, W - pad - anchoTexto(fecha, eFecha), pad + Math.floor((hdr - gap - eFecha.h) / 2), eFecha)
  }
  const bajoRegla = pad + hdr + linea
  elementos.push({ tipo: 'barra', x: pad, y: pad + hdr, ancho: W - 2 * pad, alto: linea })

  const anchoUtil = W - 2 * pad
  const abajo = H - pad
  if (trabajo.tipo === 'nino') componerNino()
  else componerRepresentante()
  return { ancho: W, alto: H, anchoMm: m.anchoMm, altoMm: m.altoMm, elementos }

  function componerNino() {
    // Name: shrink down to 70 %, then the first name only, then cut.
    const objetivo = d('nom')
    const completo = String(p.nombre ?? '').trim().toLocaleUpperCase('es')
    let nombre = completo
    let eNom = estiloQueCabe(nombre, objetivo, objetivo * 0.7, anchoUtil)
    if (!eNom) {
      nombre = primerNombre(completo)
      eNom = estiloQueCabe(nombre, objetivo, objetivo * 0.7, anchoUtil)
    }
    if (!eNom) {
      eNom = ESTILOS.find((e) => e.h <= objetivo * 0.7) ?? ESTILOS[ESTILOS.length - 1]
      nombre = cortar(nombre, eNom, anchoUtil)
    }
    let y = bajoRegla + gap
    texto(nombre, pad, y, eNom)
    y += eNom.h + gap

    const eApe = estiloCercano(d('ape'))
    const apellido = String(p.apellido ?? '').trim()
    if (apellido) {
      texto(cortar(apellido, eApe, anchoUtil), pad, y, eApe)
      y += eApe.h + gap
    }

    // Footer: código in a frame bottom right; salón and ALERGIA on the left.
    const marco = d('marco')
    const padV = Math.round(gap * 0.75)
    const padH = Math.round(gap * 1.6)
    const codigo = String(p.codigo ?? '')
    const altoCodigo = Math.min(d('cod'), abajo - y - 2 * padV - 2 * marco)
    const eCod = estiloQueCabe(codigo, altoCodigo, 1, anchoUtil / 2) ?? ESTILOS[ESTILOS.length - 1]
    const caja = { ancho: anchoTexto(codigo, eCod) + 2 * (padH + marco), alto: eCod.h + 2 * (padV + marco) }
    const cx = W - pad - caja.ancho
    const cy = abajo - caja.alto
    elementos.push({ tipo: 'caja', x: cx, y: cy, ancho: caja.ancho, alto: caja.alto, grosor: marco })
    texto(codigo, cx + marco + padH, cy + marco + padV, eCod)

    const anchoDatos = cx - 2 * gap - pad
    const eSal = estiloCercano(d('sal'))
    const salon = String(p.salon ?? '').trim()
    if (salon) texto(cortar(salon, eSal, anchoDatos), pad, y, eSal)

    // Marks in a row at the bottom left: ALERGIA reversed first, at its own
    // size (only the mark, never the text), then the S9.3 visit framed in the
    // largest size that fits the rest (short text on narrow labels).
    const pv = Math.round(gap * 0.7)
    const objetivoMarca = d('alerta') * 1.15
    let mx = pad
    const marca = (t, e, tipo) => {
      const b = { ancho: anchoTexto(t, e) + 2 * padH, alto: e.h + 2 * pv }
      const by = abajo - b.alto
      texto(t, mx + padH, by + pv, e)
      if (tipo === 'invertir') elementos.push({ tipo, x: mx, y: by, ancho: b.ancho, alto: b.alto })
      else elementos.push({ tipo, x: mx, y: by, ancho: b.ancho, alto: b.alto, grosor: Math.max(1, Math.round(marco / 2)) })
      mx += b.ancho + gap
    }
    if (p.alergias === true) {
      marca('ALERGIA', estiloQueCabe('ALERGIA', objetivoMarca, 1, anchoDatos - 2 * padH) ?? ESTILOS[ESTILOS.length - 1], 'invertir')
    }
    const visita = VISITAS[p.visita]
    if (visita) {
      const resto = pad + anchoDatos - mx - 2 * padH
      const opciones = visita.map((t) => ({ t, e: estiloQueCabe(t, objetivoMarca, 1, resto) })).filter((o) => o.e)
      // The full text while it stays near the target size, else the larger one.
      const [completa, corta] = [opciones.find((o) => o.t === visita[0]), opciones.find((o) => o.t === visita[1])]
      const elegida = completa && (completa.e.h >= objetivoMarca * 0.6 || !corta || completa.e.h >= corta.e.h) ? completa : corta
      const o = elegida ?? { t: visita[visita.length - 1], e: ESTILOS[ESTILOS.length - 1] }
      marca(o.t, o.e, 'caja')
    }
  }

  function componerRepresentante() {
    const arriba = bajoRegla + gap
    const contenido = String(p.qr || p.codigo || '')
    const modulos = 17 + 4 * versionQr(contenido)
    const ladoMax = Math.min(abajo - arriba, Math.round(anchoUtil * 0.42))
    const celda = Math.max(1, Math.min(10, Math.floor(ladoMax / modulos)))
    const lado = modulos * celda
    elementos.push({ tipo: 'qr', x: pad, y: arriba, ancho: lado, alto: lado, celda, contenido })

    const lx = pad + lado + 2 * gap
    const anchoLado = W - pad - lx
    // Instruction at the bottom with a rule above it.
    const instr = bloque(INSTRUCCION, d('instr'), anchoLado, 2)
    let iy = abajo - instr.lineas.length * instr.e.h
    instr.lineas.forEach((l, i) => texto(l, lx, iy + i * instr.e.h, instr.e))
    iy -= gap + linea
    elementos.push({ tipo: 'barra', x: lx, y: iy, ancho: anchoLado, alto: linea })

    const codigo = String(p.codigo ?? '')
    const hijos = nombresHijos(p.ninos)
    const eHijosEst = estiloCercano(d('hijos'))
    const reservaHijos = hijos ? 2 * eHijosEst.h + gap : 0
    const objetivoCod = d('cod') * (escala < 0.7 ? 0.95 : 1)
    const altoCod = Math.min(objetivoCod, iy - gap - arriba - reservaHijos)
    const eCod = estiloQueCabe(codigo, altoCod, 1, anchoLado) ?? ESTILOS[ESTILOS.length - 1]
    texto(codigo, lx, arriba, eCod)
    const hy = arriba + eCod.h + gap
    if (hijos) {
      const caben = Math.max(1, Math.min(2, Math.floor((iy - gap - hy) / eHijosEst.h)))
      const h = bloque(hijos, d('hijos'), anchoLado, caben)
      h.lineas.forEach((l, i) => texto(l, lx, hy + i * h.e.h, h.e))
    }
  }
}

const escapar = (t) => String(t).replace(/[\r\n]+/g, ' ').replace(/"/g, '\\["]')

/** Serializes a layout to TSPL bytes. */
function aTspl(etiqueta, { gapMm = 2 } = {}) {
  const partes = []
  const linea = (l) => partes.push(aWindows1252(`${l}\r\n`))
  linea(`SIZE ${etiqueta.anchoMm} mm,${etiqueta.altoMm} mm`)
  linea(`GAP ${gapMm} mm,0 mm`)
  linea('DIRECTION 1,0')
  linea('REFERENCE 0,0')
  linea('CODEPAGE 1252')
  linea('CLS')
  for (const e of etiqueta.elementos) {
    if (e.tipo === 'texto') linea(`TEXT ${e.x},${e.y},"${e.fuente}",0,${e.mx},${e.my},"${escapar(e.texto)}"`)
    else if (e.tipo === 'barra') linea(`BAR ${e.x},${e.y},${e.ancho},${e.alto}`)
    else if (e.tipo === 'caja') linea(`BOX ${e.x},${e.y},${e.x + e.ancho},${e.y + e.alto},${e.grosor}`)
    else if (e.tipo === 'invertir') linea(`REVERSE ${e.x},${e.y},${e.ancho},${e.alto}`)
    else if (e.tipo === 'qr') linea(`QRCODE ${e.x},${e.y},M,${e.celda},A,0,"${escapar(e.contenido)}"`)
    else if (e.tipo === 'mapa') {
      partes.push(Buffer.from(`BITMAP ${e.x},${e.y},${e.mapa.anchoBytes},${e.mapa.alto},0,`, 'latin1'), e.mapa.datos, Buffer.from('\r\n', 'latin1'))
    }
  }
  linea('PRINT 1,1')
  return Buffer.concat(partes)
}

/** TSPL bytes of a print job at the station's size. */
function renderizarEtiqueta(trabajo, medidas, opciones = {}) {
  return aTspl(componerEtiqueta(trabajo, medidas, opciones), opciones)
}

module.exports = { componerEtiqueta, aTspl, renderizarEtiqueta, medidasDe }
