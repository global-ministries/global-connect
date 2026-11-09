#!/usr/bin/env node
'use strict'
/**
 * Niños print agent (odd/tasks/ninos-checkin-pco.md S10, T3a; API contract
 * in docs/ninos/impresion.md). Runs on the desk computer that has the label
 * printer: claims the station's pending labels, renders them to TSPL with the
 * station's label size (102 × 51 mm while it has none) and sends them raw to
 * the printer, then reports each one as `impresa` or `error`. No
 * dependencies: Node 18+ (built-in fetch).
 *
 *   node tools/agente-impresion/agente.js                 run the loop
 *   node tools/agente-impresion/agente.js --prueba        print sample labels, no server
 *   node tools/agente-impresion/agente.js --impresoras    list the CUPS queues
 * See README.md. Logs carry job ids and counts only: never the token nor label data.
 */
const fs = require('node:fs')
const path = require('node:path')

const { cargarLogos } = require('./logos')
const { crearEnvio, listarImpresoras } = require('./impresora')
const { medidasDe, renderizarEtiqueta } = require('./tspl')

const RUTA = '/api/ninos/impresion/agente'
const MAX_TRABAJOS = 10
const ESPERA_MAX_MS = 30000
const ESPERA_MIN_MS = 2000
const MAX_ERROR = 300
const RECUERDA_IMPRESAS = 1000
const ARCHIVO_CONFIG = path.join(__dirname, 'agente.config.json')

/** Next wait after a network error: 2 s, doubled each time, at most 30 s. */
function esperaTrasError(anterior) {
  return anterior > 0 ? Math.min(anterior * 2, ESPERA_MAX_MS) : ESPERA_MIN_MS
}

/**
 * The agent config: `agente.config.json` text (or null) with the
 * `GC_AGENTE_*` env vars on top. Errors name the field, never its value.
 */
function leerConfig({ texto, env = {}, sinImpresora = false }) {
  let archivo = {}
  if (texto != null) {
    try { archivo = JSON.parse(texto) } catch { throw new Error('Config: agente.config.json no es JSON válido.') }
    if (typeof archivo !== 'object' || archivo === null || Array.isArray(archivo)) throw new Error('Config: agente.config.json debe ser un objeto JSON.')
  }
  const valor = (clave, variable) => (env[variable] !== undefined && env[variable] !== '' ? env[variable] : archivo[clave])

  const servidor = String(valor('servidor', 'GC_AGENTE_SERVIDOR') ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/]+/i.test(servidor)) throw new Error('Config: "servidor" debe ser la URL de la app (https://…).')
  const token = String(valor('token', 'GC_AGENTE_TOKEN') ?? '').trim()
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Config: "token" falta o no es un token de estación (64 caracteres hexadecimales).')
  const impresora = String(valor('impresora', 'GC_AGENTE_IMPRESORA') ?? '').trim()
  if (!impresora && !sinImpresora) throw new Error('Config: "impresora" falta (nombre de la cola de impresión; míralo con --impresoras).')
  const intervaloMs = Number(valor('intervaloMs', 'GC_AGENTE_INTERVALO_MS') ?? 2000)
  if (!Number.isInteger(intervaloMs) || intervaloMs < 500) throw new Error('Config: "intervaloMs" debe ser un entero de 500 o más.')
  const modo = String(valor('modo', 'GC_AGENTE_MODO') ?? 'tspl')
  if (modo !== 'tspl') throw new Error('Config: "modo" solo admite "tspl" por ahora.')
  const gapMm = Number(valor('gapMm', 'GC_AGENTE_GAP_MM') ?? 2)
  if (!(gapMm >= 0 && gapMm <= 10)) throw new Error('Config: "gapMm" debe estar entre 0 y 10.')
  return { servidor, token, impresora, intervaloMs, modo, gapMm }
}

/** A printer error for the server: short and with no label data. */
const mensajeError = (err) => (err instanceof Error && err.message ? err.message : 'error_impresora').slice(0, MAX_ERROR)

/** A sleep that `despertar()` ends early (Ctrl-C). */
function crearDormir() {
  let despertar = () => {}
  const dormir = (ms) => new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    despertar = () => { clearTimeout(t); resolve() }
  })
  return { dormir, despertar: () => despertar() }
}

/**
 * @param {{
 *   config: ReturnType<typeof leerConfig>,
 *   fetch?: typeof fetch,
 *   imprimir?: (bytes: Buffer, impresora: string) => Promise<void>,
 *   log?: (...args: unknown[]) => void,
 *   dormir?: (ms: number) => Promise<void>,
 *   logos?: Record<string, boolean[][]>,
 * }} deps
 */
function crearAgente({ config, fetch: pedir = globalThis.fetch, imprimir = crearEnvio(), log = console.log, dormir, logos = {} }) {
  const sueno = dormir ? { dormir, despertar: () => {} } : crearDormir()
  const cabeceras = { Authorization: `Bearer ${config.token}`, Accept: 'application/json' }
  const impresas = new Set()
  let pendientes = []
  let activo = false
  let estacionAnunciada = false

  const recordar = (id) => {
    impresas.add(id)
    if (impresas.size > RECUERDA_IMPRESAS) impresas.delete(impresas.values().next().value)
  }

  /** POSTs a report; a network failure keeps it for the next cycle. */
  async function reportar(reporte) {
    try {
      const r = await pedir(`${config.servidor}${RUTA}`, {
        method: 'POST',
        headers: { ...cabeceras, 'Content-Type': 'application/json' },
        body: JSON.stringify(reporte),
      })
      if (r.status >= 500 || r.status === 401) pendientes.push(reporte)
      else if (!r.ok) log(`[agente] el servidor rechazó el reporte del trabajo ${reporte.id} (${r.status})`)
    } catch {
      pendientes.push(reporte)
    }
  }

  async function ciclo() {
    const resultado = { estado: 'ok', reclamados: 0, impresas: 0, errores: 0 }
    const anteriores = pendientes
    pendientes = []
    for (const r of anteriores) await reportar(r)

    let respuesta
    try {
      const r = await pedir(`${config.servidor}${RUTA}?max=${MAX_TRABAJOS}`, { method: 'GET', headers: cabeceras })
      if (r.status === 401) return { ...resultado, estado: 'no_autorizado' }
      if (!r.ok) return { ...resultado, estado: 'error_red' }
      respuesta = await r.json()
    } catch {
      return { ...resultado, estado: 'error_red' }
    }
    const estacion = respuesta?.estacion ?? {}
    const trabajos = Array.isArray(respuesta?.trabajos) ? respuesta.trabajos : []
    const medidas = medidasDe(estacion)
    if (!estacionAnunciada) {
      estacionAnunciada = true
      log(`[agente] conectado a la estación «${estacion.nombre ?? '?'}»: ${medidas.porDefecto
        ? `sin medidas de etiqueta: imprimo a ${medidas.anchoMm} × ${medidas.altoMm} mm (configúralas en la estación)`
        : `etiqueta de ${medidas.anchoMm} × ${medidas.altoMm} mm`}`)
    }
    resultado.reclamados = trabajos.length

    for (const t of trabajos) {
      let reporte
      if (impresas.has(t.id)) {
        reporte = { id: t.id, estado: 'impresa' } // already printed; its report was lost
      } else {
        let bytes = null
        try { bytes = renderizarEtiqueta(t, estacion, { logos, gapMm: config.gapMm }) } catch { bytes = null }
        if (!bytes) {
          reporte = { id: t.id, estado: 'error', error: 'etiqueta_invalida' }
        } else {
          try {
            await imprimir(bytes, config.impresora)
            recordar(t.id)
            reporte = { id: t.id, estado: 'impresa' }
          } catch (err) {
            reporte = { id: t.id, estado: 'error', error: mensajeError(err) }
          }
        }
      }
      if (reporte.estado === 'impresa') resultado.impresas++
      else {
        resultado.errores++
        log(`[agente] trabajo ${t.id}: error ${reporte.error}`)
      }
      await reportar(reporte)
    }
    if (trabajos.length) log(`[agente] ${trabajos.length} trabajo(s): ${resultado.impresas} impresa(s), ${resultado.errores} con error`)
    return resultado
  }

  async function ejecutar() {
    activo = true
    let espera = 0
    let sinConexion = false
    log(`[agente] imprimiendo en «${config.impresora}»; revisa la cola cada ${config.intervaloMs / 1000} s. Ctrl-C para salir.`)
    while (activo) {
      const r = await agente.ciclo()
      if (r.estado === 'no_autorizado') {
        log('[agente] El servidor rechazó el token (401). Revisa el token de la estación en agente.config.json o si la estación está activa.')
        return 1
      }
      if (r.estado === 'error_red') {
        espera = esperaTrasError(espera)
        if (!sinConexion || espera === ESPERA_MAX_MS) log(`[agente] sin conexión con el servidor; reintento en ${espera / 1000} s`)
        sinConexion = true
        if (activo) await sueno.dormir(espera)
        continue
      }
      if (sinConexion) log('[agente] conexión recuperada')
      sinConexion = false
      espera = 0
      if (r.reclamados >= MAX_TRABAJOS) continue
      if (activo) await sueno.dormir(config.intervaloMs)
    }
    log('[agente] detenido')
    return 0
  }

  function detener() {
    activo = false
    sueno.despertar()
  }

  const agente = { ciclo, ejecutar, detener }
  return agente
}

/** Sample labels for `--prueba`: fake names, an allergy, both visit marks, ñ and accents, two areas. */
function etiquetasDePrueba(fecha = fechaLocal()) {
  const comun = { codigo: '4827', fecha, servicio: 'Segundo servicio', hora: '11:00' }
  return [
    { id: 'prueba-1', tipo: 'nino', intentos: 1, created_at: '', payload: { ...comun, nombre: 'Valentina', apellido: 'Rodríguez Peña', salon: 'Salón 3 años', area: 'waumba', alergias: true, visita: 'primera' } },
    { id: 'prueba-2', tipo: 'nino', intentos: 1, created_at: '', payload: { ...comun, nombre: 'José Ángel', apellido: 'Muñoz Briceño', salon: '4.º grado', area: 'upstreet', alergias: false, visita: 'visitante' } },
    { id: 'prueba-3', tipo: 'representante', intentos: 1, created_at: '', payload: { ...comun, ninos: ['Valentina', 'José Ángel'], areas: ['upstreet', 'waumba'] } },
  ]
}

function fechaLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function leerArgs(argv) {
  const a = { prueba: false, impresoras: false, ayuda: false, ancho: 102, alto: 51, guardar: null, impresora: null, config: ARCHIVO_CONFIG }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--prueba') a.prueba = true
    else if (v === '--impresoras') a.impresoras = true
    else if (v === '--ayuda' || v === '--help' || v === '-h') a.ayuda = true
    else if (v === '--ancho') a.ancho = Number(argv[++i])
    else if (v === '--alto') a.alto = Number(argv[++i])
    else if (v === '--guardar') a.guardar = argv[++i] ?? null
    else if (v === '--impresora') a.impresora = argv[++i] ?? null
    else if (v === '--config') a.config = argv[++i] ?? ARCHIVO_CONFIG
    else throw new Error(`Opción desconocida: ${v} (usa --ayuda)`)
  }
  if (a.guardar === '') a.guardar = null
  return a
}

const AYUDA = `Agente de impresión de etiquetas de Niños

  node tools/agente-impresion/agente.js                  revisa la cola e imprime
  node tools/agente-impresion/agente.js --prueba         imprime etiquetas de muestra (sin servidor)
      [--ancho 102 --alto 51]                            medidas de la etiqueta en mm
      [--impresora <cola>]                               cola de impresión (si no está en la config)
  node tools/agente-impresion/agente.js --impresoras     lista las colas de impresión (lpstat -p)

  --guardar <archivo>   escribe los bytes TSPL en el archivo en vez de imprimir
  --config <archivo>    otra config (por defecto tools/agente-impresion/agente.config.json)
`

function leerTexto(archivo) {
  try { return fs.readFileSync(archivo, 'utf8') } catch { return null }
}

/** Printer of the CLI: the CUPS queue, or a file with --guardar (appends). */
function destino(guardar) {
  if (!guardar) return crearEnvio()
  fs.writeFileSync(guardar, Buffer.alloc(0))
  return async (bytes) => { fs.appendFileSync(guardar, bytes) }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = leerArgs(argv)
  if (args.ayuda) { console.log(AYUDA); return 0 }
  if (args.impresoras) { console.log((await listarImpresoras()) || 'No hay colas de impresión instaladas.'); return 0 }

  const logos = cargarLogos(path.join(__dirname, 'logos'), console.log)

  if (args.prueba) {
    let archivo = {}
    try { archivo = JSON.parse(leerTexto(args.config) ?? '{}') } catch { archivo = {} }
    const impresora = args.impresora || env.GC_AGENTE_IMPRESORA || archivo.impresora || ''
    if (!args.guardar && !impresora) throw new Error('Falta la impresora: usa --impresora <cola> (míralas con --impresoras) o --guardar <archivo>.')
    const medidas = { ancho_mm: args.ancho, alto_mm: args.alto, dpi: 203 }
    if (medidasDe(medidas).porDefecto) throw new Error('--ancho y --alto deben ser números en mm.')
    const gapMm = Number(env.GC_AGENTE_GAP_MM ?? archivo.gapMm ?? 2)
    const imprimir = destino(args.guardar)
    for (const t of etiquetasDePrueba()) await imprimir(renderizarEtiqueta(t, medidas, { logos, gapMm }), impresora)
    console.log(`[agente] prueba: 3 etiquetas de ${args.ancho} × ${args.alto} mm ${args.guardar ? `guardadas en ${args.guardar}` : `enviadas a «${impresora}»`}`)
    return 0
  }

  const texto = leerTexto(args.config)
  if (texto == null && !env.GC_AGENTE_SERVIDOR) {
    throw new Error(`No encontré ${args.config}. Cópialo de agente.config.example.json y complétalo (ver README.md).`)
  }
  const config = leerConfig({ texto, env, sinImpresora: Boolean(args.guardar) })
  if (args.impresora) config.impresora = args.impresora
  const agente = crearAgente({ config, imprimir: destino(args.guardar), logos })
  let interrupciones = 0
  process.on('SIGINT', () => {
    if (++interrupciones > 1) process.exit(130)
    console.log('\n[agente] deteniendo… (Ctrl-C otra vez para forzar)')
    agente.detener()
  })
  process.on('SIGTERM', () => agente.detener())
  return agente.ejecutar()
}

if (require.main === module) {
  main().then(
    (codigo) => { process.exitCode = codigo },
    (err) => {
      console.error(`[agente] ${err instanceof Error ? err.message : 'error inesperado'}`)
      process.exitCode = 1
    },
  )
}

module.exports = { crearAgente, esperaTrasError, etiquetasDePrueba, leerConfig, leerArgs, main }
