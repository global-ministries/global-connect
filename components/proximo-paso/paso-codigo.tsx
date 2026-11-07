'use client'

/**
 * T2c (odd/tasks/proximo-paso.md, S3 / L8) — the code step of /proximo-paso.
 * After «Crear cuenta e inscribirme», when the account must confirm its
 * email, the form gives way to this card on the same page: «Te enviamos un
 * código de 6 dígitos a …», the code field (numeric keyboard, one-time-code
 * autofill, a pasted "123 456" is kept as digits), «Confirmar», «Reenviar
 * código» after a 60 s cooldown, and «Cambiar correo» back to the form. It
 * reads the same for every address; whoever already had an account signs in
 * from here. The server action verifies the code and enrolls.
 */

import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
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

const enlace = 'inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-brand-text underline-offset-4 hover:underline focus-ring'

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
  const [codigo, setCodigo] = useState('')
  const [errorCodigo, setErrorCodigo] = useState<string | undefined>()
  const [fallo, setFallo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  // A deadline, not a countdown: a tab left in the background still counts right.
  const [reenvioDesde, setReenvioDesde] = useState(() => Date.now() + ESPERA_REENVIO_S * 1000)
  const [ahora, setAhora] = useState(() => Date.now())
  const restante = Math.max(0, Math.ceil((reenvioDesde - ahora) / 1000))
  const enEspera = restante > 0

  useEffect(() => {
    if (!enEspera) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [enEspera])

  async function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    setFallo(null)
    setAviso(null)
    if (codigo.length !== 6) {
      setErrorCodigo('Escribe los 6 dígitos del código.')
      return
    }
    setEnviando(true)
    try {
      const r = await confirmarCodigoProximoPaso({ email, token: codigo, edicionId: edicion.id })
      if (r.ok) onInscrito(r)
      else if (r.sesionAbierta) onSesionAbierta(r)
      else setFallo(r.message)
    } catch {
      setFallo('No se pudo confirmar el código. Inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
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

        <InputSistema
          label="Código de 6 dígitos"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          className="font-mono tabular-nums"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))
            setErrorCodigo(undefined)
          }}
          error={errorCodigo}
          disabled={enviando}
        />

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
