'use client'

/**
 * T2c (odd/tasks/proximo-paso.md, S3 / L8) — the code step of /proximo-paso.
 * After «Crear cuenta e inscribirme», when the account must confirm its
 * email, the form gives way to this card on the same page: «Te enviamos un
 * código de 6 dígitos a …», the code, «Confirmar», «Reenviar código» after a
 * 60 s cooldown, and «Cambiar correo» back to the form. It reads the same for
 * every address; whoever already had an account signs in from here. The
 * server action verifies the code and enrolls.
 *
 * T2d (L11): the code waits in six digit boxes (one group «Código de 6
 * dígitos», numeric keyboard, one-time-code autofill on the first box). A
 * paste or an autofill anywhere fills them all, typing moves to the next box,
 * Backspace on an empty box goes back, the arrows move. Once the six digits
 * are there the code goes on its own, once; «Confirmar» stays as the
 * fallback. A wrong code clears the boxes and points to the newest email.
 */

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { Mail } from 'lucide-react'

import {
  confirmarCodigoProximoPaso,
  reenviarCodigoProximoPaso,
  type FalloProximoPaso,
  type ResultadoInscripcion,
} from '@/app/proximo-paso/actions'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { BotonSistema, InputSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { loginProximoPaso, type EdicionResumen } from '@/lib/platform/talleres/proximo-paso-registro'

/** Seconds before «Reenviar código» can be used again; Supabase keeps its own limit. */
export const ESPERA_REENVIO_S = 60

const LARGO_CODIGO = 6
const VACIO: readonly string[] = Array.from({ length: LARGO_CODIGO }, () => '')

const enlace = 'inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-brand-text underline-offset-4 hover:underline focus-ring'

/** The boxes after writing `texto` from box `desde`: a whole code always starts at the first one. */
function rellenar(actuales: readonly string[], desde: number, texto: string): string[] {
  const cifras = texto.replace(/\D/g, '')
  const inicio = cifras.length >= LARGO_CODIGO ? 0 : desde
  const siguientes = [...actuales]
  cifras
    .slice(0, LARGO_CODIGO - inicio)
    .split('')
    .forEach((c, i) => (siguientes[inicio + i] = c))
  return siguientes
}

export interface PasoCodigoProps {
  readonly email: string
  readonly edicion: EdicionResumen
  /** The code was right: the inscripción went through (inscrito or pendiente). */
  readonly onInscrito: (resultado: Extract<ResultadoInscripcion, { ok: true }>) => void
  /** The code was right but the enrollment did not go through: the person is signed in. */
  readonly onSesionAbierta: (fallo: FalloProximoPaso) => void
  readonly onCambiarCorreo: () => void
}

export function PasoCodigo({ email, edicion, onInscrito, onSesionAbierta, onCambiarCorreo }: PasoCodigoProps): ReactElement {
  const [digitos, setDigitos] = useState<readonly string[]>(VACIO)
  const [fallo, setFallo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  // A deadline, not a countdown: a tab left in the background still counts right.
  const [reenvioDesde, setReenvioDesde] = useState(() => Date.now() + ESPERA_REENVIO_S * 1000)
  const [ahora, setAhora] = useState(() => Date.now())
  const cajas = useRef<(HTMLInputElement | null)[]>([])
  // Synchronous guards: a paste and a tap on «Confirmar» in the same tick send once.
  const enCurso = useRef(false)
  const autoEnviado = useRef<string | null>(null)
  const [enfocar, setEnfocar] = useState<number | null>(null)
  const restante = Math.max(0, Math.ceil((reenvioDesde - ahora) / 1000))
  const enEspera = restante > 0

  useEffect(() => {
    if (!enEspera) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [enEspera])

  // Focus after the render, once the boxes are enabled again.
  useEffect(() => {
    if (enfocar === null || enviando) return
    cajas.current[enfocar]?.focus()
    setEnfocar(null)
  }, [enfocar, enviando])

  async function enviar(codigo: string) {
    if (enCurso.current) return
    setFallo(null)
    setAviso(null)
    if (codigo.length !== LARGO_CODIGO) {
      setFallo('Escribe los 6 dígitos del código.')
      return
    }
    enCurso.current = true
    setEnviando(true)
    try {
      const r = await confirmarCodigoProximoPaso({ email, token: codigo, edicionId: edicion.id })
      if (r.ok) onInscrito(r)
      else if (r.sesionAbierta) onSesionAbierta(r)
      else {
        setFallo(r.message)
        if (r.error === 'CODIGO_INVALIDO') {
          setDigitos(VACIO)
          setEnfocar(0)
        }
      }
    } catch {
      setFallo('No se pudo confirmar el código. Inténtalo de nuevo.')
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  /** New boxes from typing, a paste or an autofill; a complete new code goes on its own. */
  function escribir(siguientes: string[], foco: number) {
    setDigitos(siguientes)
    const codigo = siguientes.join('')
    if (codigo.length === LARGO_CODIGO && !siguientes.includes('')) {
      if (enCurso.current || autoEnviado.current === codigo) return
      autoEnviado.current = codigo
      cajas.current[LARGO_CODIGO - 1]?.blur()
      void enviar(codigo)
      return
    }
    cajas.current[foco]?.focus()
  }

  function cambiar(i: number, valor: string) {
    const cifras = valor.replace(/\D/g, '')
    if (cifras === '') {
      if (valor === '') escribir(Object.assign([...digitos], { [i]: '' }), i)
      return
    }
    const siguientes = rellenar(digitos, i, cifras)
    const ultimo = cifras.length >= LARGO_CODIGO ? LARGO_CODIGO - 1 : Math.min(i + cifras.length, LARGO_CODIGO - 1)
    escribir(siguientes, ultimo)
  }

  function pegar(i: number, evento: ClipboardEvent<HTMLInputElement>) {
    evento.preventDefault()
    const cifras = evento.clipboardData.getData('text').replace(/\D/g, '')
    if (cifras === '') return
    const ultimo = cifras.length >= LARGO_CODIGO ? LARGO_CODIGO - 1 : Math.min(i + cifras.length, LARGO_CODIGO - 1)
    escribir(rellenar(digitos, i, cifras), ultimo)
  }

  function tecla(i: number, evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Backspace' && digitos[i] === '' && i > 0) {
      evento.preventDefault()
      setDigitos(Object.assign([...digitos], { [i - 1]: '' }))
      cajas.current[i - 1]?.focus()
    } else if (evento.key === 'ArrowLeft' && i > 0) {
      evento.preventDefault()
      cajas.current[i - 1]?.focus()
    } else if (evento.key === 'ArrowRight' && i < LARGO_CODIGO - 1) {
      evento.preventDefault()
      cajas.current[i + 1]?.focus()
    }
  }

  function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    void enviar(digitos.join(''))
  }

  async function reenviar() {
    if (reenviando || enEspera) return
    setFallo(null)
    setAviso(null)
    setReenviando(true)
    try {
      const r = await reenviarCodigoProximoPaso({ email, edicionId: edicion.id })
      if (r.ok) {
        setAviso(r.message)
        const desde = Date.now()
        setAhora(desde)
        setReenvioDesde(desde + ESPERA_REENVIO_S * 1000)
      } else setFallo(r.message)
    } catch {
      setFallo('No se pudo reenviar el código. Inténtalo de nuevo.')
    } finally {
      setReenviando(false)
    }
  }

  return (
    <TarjetaSistema className="grid gap-5 p-5">
      <form onSubmit={confirmar} noValidate aria-labelledby="proximo-paso-codigo" className="grid gap-5">
        <div className="grid gap-2 text-center">
          <Mail className="mx-auto size-10 text-brand" aria-hidden />
          <h2 id="proximo-paso-codigo" className="text-xl font-bold tracking-tight text-foreground">
            Revisa tu correo
          </h2>
          <TextoSistema variante="sutil">
            {`Te enviamos un código de 6 dígitos a ${email}. Escríbelo aquí para terminar tu inscripción en ${edicion.nombre}.`}
          </TextoSistema>
        </div>

        <div className="grid gap-2">
          <p id="proximo-paso-codigo-campo" className="text-center text-sm font-medium text-foreground">
            Código de 6 dígitos
          </p>
          <div role="group" aria-labelledby="proximo-paso-codigo-campo" className="mx-auto grid w-full max-w-[22rem] grid-cols-6 gap-2">
            {digitos.map((d, i) => (
              <InputSistema
                key={i}
                ref={(el) => {
                  cajas.current[i] = el
                }}
                aria-label={`Dígito ${i + 1} de 6`}
                name={i === 0 ? 'codigo' : undefined}
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                pattern="[0-9]*"
                className="h-14 px-0 text-center font-mono text-2xl font-semibold tabular-nums"
                value={d}
                onChange={(e) => cambiar(i, e.target.value)}
                onPaste={(e) => pegar(i, e)}
                onKeyDown={(e) => tecla(i, e)}
                onFocus={(e) => e.target.select()}
                disabled={enviando}
              />
            ))}
          </div>
          <p aria-live="polite" className="min-h-5 text-center text-sm text-muted-foreground">
            {enviando ? 'Revisando tu código…' : ''}
          </p>
        </div>

        {fallo && <AvisoFormulario tono="error">{fallo}</AvisoFormulario>}
        {aviso && <AvisoFormulario tono="marca">{aviso}</AvisoFormulario>}

        <BotonSistema type="submit" tamaño="lg" className="w-full" cargando={enviando}>
          Confirmar
        </BotonSistema>

        <div className="flex flex-wrap justify-center gap-2">
          <BotonSistema type="button" variante="ghost" cargando={reenviando} disabled={enEspera || enviando} onClick={reenviar}>
            {enEspera ? (
              <>
                Reenviar código en <span className="font-mono tabular-nums">{restante}</span> s
              </>
            ) : (
              'Reenviar código'
            )}
          </BotonSistema>
          <BotonSistema type="button" variante="ghost" disabled={enviando} onClick={onCambiarCorreo}>
            Cambiar correo
          </BotonSistema>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          También puedes abrir el enlace que viene en el correo. ¿Ya tenías cuenta con ese correo?{' '}
          <Link href={loginProximoPaso(edicion.id)} className={enlace}>
            Inicia sesión
          </Link>
        </p>
      </form>
    </TarjetaSistema>
  )
}
