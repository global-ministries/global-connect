'use client'

/**
 * What the desk panel shows after registering (prototype 04, state D): the
 * pickup code with the children and their salón (the check-in code view),
 * or the check-in error with the family already registered, or — for "Solo
 * registrar" with a new parent — "Familia registrada". The account
 * invitation is an optional button next to the code, never a blocking step.
 */
import { useState } from 'react'
import { CheckCircle2, Mail, Send } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { BotonSistema, InputSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { parseInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'
import { alertasDeHijo, avisosDeCapacidad } from '@/lib/platform/ninos/checkin'
import type { PersonaRetiro } from '@/lib/platform/ninos/checkin-vista'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'

import { CodigoRetiro, type ResultadoIngreso } from '../checkin/codigo-retiro'
import type { ResultadoMesa } from './use-registro-mesa'

/** Optional email invitation for the new parent (G5; the server accepts it from the registering operator only). */
export function InvitarCuenta({ padreId }: { padreId: string }) {
  const [abierta, setAbierta] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviada, setEnviada] = useState<string | null>(null)

  async function invitar() {
    const entrada = parseInvitacion({ email })
    if ('error' in entrada) return setError('Escribe un correo válido.')
    setError(null)
    setEnviando(true)
    try {
      const res = await fetch(`/api/ninos/familia/${encodeURIComponent(padreId)}/invitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: entrada.email }),
      })
      const datos = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>
      if (res.ok) setEnviada(typeof datos.email === 'string' ? datos.email : entrada.email)
      else setError(typeof datos.error === 'string' ? datos.error : 'No se pudo enviar la invitación. Intenta de nuevo.')
    } catch {
      setError('No se pudo enviar la invitación. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  if (enviada) {
    return (
      <p role="status" className="text-sm text-success-text">
        Le enviamos la invitación a {enviada}.
      </p>
    )
  }
  if (!abierta) {
    return (
      <BotonSistema type="button" variante="outline" icono={Mail} className="justify-self-start" onClick={() => setAbierta(true)}>
        Invitar a crear su cuenta
      </BotonSistema>
    )
  }
  return (
    <div className="grid gap-3 text-left">
      <InputSistema
        id="familia-invitar-email"
        label="Correo del representante (opcional)"
        aria-label="Correo del representante"
        icono={Mail}
        type="email"
        inputMode="email"
        autoComplete="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <BotonSistema type="button" variante="outline" icono={Send} className="justify-self-start" cargando={enviando} onClick={() => void invitar()}>
        Invitar por correo
      </BotonSistema>
    </div>
  )
}

/** The code view of the check-in, built from the registration and the check-in rows. */
function aResultadoIngreso(r: NonNullable<ResultadoMesa['ingreso']>, salones: readonly SalonNivel[], retiran: PersonaRetiro[]): ResultadoIngreso {
  const nombres = Object.fromEntries(salones.map((s) => [s.id, s.nombre]))
  return {
    codigo: r.filas[0].codigo,
    lineas: r.filas.map((fila) => {
      const h = r.payload.hijos[r.ids.indexOf(fila.nino_id)]
      return { ninoId: fila.nino_id, nombre: h ? `${h.nombre} ${h.apellido}` : 'Niño', detalle: [nombres[fila.salon_id] ?? 'salón', ...(h ? alertasDeHijo(h) : [])].join(' · ') }
    }),
    avisos: avisosDeCapacidad(r.filas, nombres),
    retiran,
  }
}

type Props = {
  resultado: ResultadoMesa
  salones: readonly SalonNivel[]
  /** "Nombre Apellido" of the representative, first in "Pueden retirar". */
  representante: string
  /** After the code: "Siguiente familia". */
  onSiguiente: () => void
  /** Opens the registered family (check-in error, or "Continuar"). */
  onContinuar: () => void
}

export function ResultadoMesaVista({ resultado, salones, representante, onSiguiente, onContinuar }: Props) {
  const invitar = resultado.padreNuevo && <InvitarCuenta padreId={resultado.padreId} />
  if (resultado.ingreso) {
    const retiran = [{ nombre: representante, relacion: 'representante' }, ...resultado.ingreso.payload.autorizados.map((a) => ({ nombre: a.nombre, relacion: a.relacion }))]
    return (
      <div className="grid min-w-0 gap-4">
        <CodigoRetiro resultado={aResultadoIngreso(resultado.ingreso, salones, retiran)} onSiguiente={onSiguiente} />
        {invitar}
      </div>
    )
  }
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-5 text-success-text" aria-hidden />
        <TituloSistema nivel={3}>Familia registrada</TituloSistema>
      </div>
      {resultado.errorIngreso && <AvisoFormulario tono="error">{resultado.errorIngreso}</AvisoFormulario>}
      {invitar}
      <BotonSistema type="button" className="w-full sm:w-auto sm:justify-self-end" onClick={onContinuar}>
        {resultado.errorIngreso ? 'Abrir en la mesa' : 'Continuar'}
      </BotonSistema>
    </div>
  )
}
