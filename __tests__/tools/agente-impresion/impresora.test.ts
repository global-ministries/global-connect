/**
 * @jest-environment node
 *
 * N6c (odd/tasks/ninos-v2.md, S10): raw send to the CUPS queue with `lp`.
 */
import { EventEmitter } from 'node:events'

import { crearEnvio, enviarConLp } from '@/tools/agente-impresion/impresora'

function fakeSpawn(codigo: number, stderr = '') {
  const llamadas: { cmd: string; args: string[]; stdin: Buffer[] }[] = []
  const spawn = (cmd: string, args: string[]) => {
    const hijo = new EventEmitter() as EventEmitter & { stdin: EventEmitter & { end: (b: Buffer) => void }; stderr: EventEmitter }
    const llamada = { cmd, args, stdin: [] as Buffer[] }
    llamadas.push(llamada)
    hijo.stderr = new EventEmitter()
    hijo.stdin = Object.assign(new EventEmitter(), {
      end: (b: Buffer) => {
        llamada.stdin.push(b)
        setImmediate(() => {
          if (stderr) hijo.stderr.emit('data', stderr)
          hijo.emit('close', codigo)
        })
      },
    })
    return hijo
  }
  return { spawn, llamadas }
}

describe('enviarConLp', () => {
  it('pipes the bytes to lp -d <queue> -o raw', async () => {
    const { spawn, llamadas } = fakeSpawn(0)
    await enviarConLp(Buffer.from('SIZE 50 mm,30 mm\r\n'), 'Xprinter_4B_2054N', { spawn: spawn as never })
    expect(llamadas).toEqual([{ cmd: 'lp', args: ['-d', 'Xprinter_4B_2054N', '-o', 'raw'], stdin: [Buffer.from('SIZE 50 mm,30 mm\r\n')] }])
  })

  it('rejects with the exit code and the first CUPS message line', async () => {
    const { spawn } = fakeSpawn(1, 'lp: The printer or class does not exist.\nmore\n')
    await expect(enviarConLp(Buffer.from('x'), 'nope', { spawn: spawn as never })).rejects.toThrow('lp_salida_1: lp: The printer or class does not exist.')
  })
})

describe('crearEnvio', () => {
  it('uses lp on macOS and Linux and refuses Windows for now', async () => {
    expect(crearEnvio('darwin')).toBe(enviarConLp)
    expect(crearEnvio('linux')).toBe(enviarConLp)
    await expect(crearEnvio('win32')(Buffer.from('x'), 'q')).rejects.toThrow('windows_no_soportado')
  })
})
