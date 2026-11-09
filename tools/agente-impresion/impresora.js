'use strict'
/**
 * Sends TSPL bytes to the OS printer. macOS and Linux: CUPS `lp -o raw`
 * (stdin, no print dialog, no filter). Windows will get its own sender here;
 * the agent only calls `crearEnvio()`.
 */
const { spawn: spawnNode } = require('node:child_process')

/** First stderr line, short: the CUPS message, never label data. */
const primeraLinea = (t) => String(t).split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 200) ?? ''

/**
 * @param {Buffer} bytes
 * @param {string} impresora CUPS queue name
 */
function enviarConLp(bytes, impresora, { spawn = spawnNode } = {}) {
  return new Promise((resolve, reject) => {
    let stderr = ''
    let hijo
    try {
      hijo = spawn('lp', ['-d', impresora, '-o', 'raw'], { stdio: ['pipe', 'ignore', 'pipe'] })
    } catch {
      reject(new Error('lp_no_disponible'))
      return
    }
    hijo.stderr?.on('data', (c) => { stderr += c })
    hijo.on('error', () => reject(new Error('lp_no_disponible')))
    hijo.on('close', (codigo) => {
      if (codigo === 0) resolve()
      else reject(new Error(`lp_salida_${codigo}${primeraLinea(stderr) ? `: ${primeraLinea(stderr)}` : ''}`))
    })
    hijo.stdin.on('error', () => {}) // a failed lp also closes stdin; 'close' reports it
    hijo.stdin.end(bytes)
  })
}

/** The printer sender of this OS. */
function crearEnvio(plataforma = process.platform) {
  if (plataforma === 'win32') {
    return async () => { throw new Error('windows_no_soportado') }
  }
  return enviarConLp
}

/** `lpstat -p` output: the CUPS queues and their state. */
function listarImpresoras({ spawn = spawnNode } = {}) {
  return new Promise((resolve, reject) => {
    let salida = ''
    const hijo = spawn('lpstat', ['-p'], { stdio: ['ignore', 'pipe', 'pipe'] })
    hijo.stdout.on('data', (c) => { salida += c })
    hijo.stderr.on('data', (c) => { salida += c })
    hijo.on('error', () => reject(new Error('lpstat_no_disponible')))
    hijo.on('close', () => resolve(salida))
  })
}

module.exports = { crearEnvio, enviarConLp, listarImpresoras }
