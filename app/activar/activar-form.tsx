'use client'

/**
 * Talleres — ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md
 * C2). Two steps: the invited person confirms their cédula, then sets a
 * password. A matrimonio invitation also asks them to confirm the member
 * who enrolled them is their spouse.
 */

import { useState, useTransition, type FormEvent, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

import { BotonSistema, InputSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'

import { activarCuentaAction, verificarCedulaActivacion } from './actions'

export interface ActivarCuentaFormProps {
  readonly tallerNombre: string
  readonly nombreInvitado: string
  readonly nombreInvitante: string | null
  readonly vinculo: 'matrimonio' | 'novios' | null
}

const LARGO_MINIMO = 8
const ERROR_TRANSPORTE = 'No se pudo completar la operación. Inténtalo de nuevo.'

export function ActivarCuentaForm({
  tallerNombre,
  nombreInvitado,
  nombreInvitante,
  vinculo,
}: ActivarCuentaFormProps): ReactElement {
  const router = useRouter()
  const [paso, setPaso] = useState<'cedula' | 'password'>('cedula')
  const [cedula, setCedula] = useState('')
  const [password, setPassword] = useState('')
  const [confirmaConyuge, setConfirmaConyuge] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const pideConyuge = vinculo === 'matrimonio' && nombreInvitante !== null

  function verificar(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (pending || cedula.trim() === '') return
    setAviso(null)
    startTransition(async () => {
      try {
        const r = await verificarCedulaActivacion(cedula.trim())
        if (r.ok) setPaso('password')
        else setAviso(r.mensaje)
      } catch {
        setAviso(ERROR_TRANSPORTE)
      }
    })
  }

  function activar(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (pending || password.length < LARGO_MINIMO) return
    setAviso(null)
    startTransition(async () => {
      try {
        const r = await activarCuentaAction({ cedula: cedula.trim(), password, confirmaConyuge: pideConyuge && confirmaConyuge })
        if (r.ok) router.replace(r.destino)
        else setAviso(r.mensaje)
      } catch {
        setAviso(ERROR_TRANSPORTE)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="flex flex-col gap-1">
        <TituloSistema nivel={1}>{nombreInvitado ? `Hola, ${nombreInvitado}` : 'Activa tu cuenta'}</TituloSistema>
        <TextoSistema variante="sutil">{`Te inscribieron en el taller ${tallerNombre}. Activa tu cuenta para seguirlo.`}</TextoSistema>
      </div>

      {paso === 'cedula' && (
        <form className="flex flex-col gap-3" onSubmit={verificar}>
          <InputSistema
            label="Tu cédula"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            placeholder="Ej.: 12345678"
            autoComplete="off"
            maxLength={20}
          />
          <BotonSistema type="submit" disabled={pending || cedula.trim() === ''}>
            {pending ? 'Verificando…' : 'Continuar'}
          </BotonSistema>
        </form>
      )}

      {paso === 'password' && (
        <form className="flex flex-col gap-3" onSubmit={activar}>
          <InputSistema
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
          />
          <TextoSistema variante="sutil" tamaño="sm">
            Usa al menos 8 caracteres.
          </TextoSistema>
          {pideConyuge && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmaConyuge}
                onChange={(e) => setConfirmaConyuge(e.target.checked)}
                aria-label={`Confirmo que ${nombreInvitante} es mi cónyuge`}
              />
              <span>{`Confirmo que ${nombreInvitante} es mi cónyuge`}</span>
            </label>
          )}
          <BotonSistema type="submit" disabled={pending || password.length < LARGO_MINIMO}>
            {pending ? 'Activando…' : 'Activar mi cuenta'}
          </BotonSistema>
        </form>
      )}

      {aviso && (
        <TextoSistema role="alert" className="text-destructive">
          {aviso}
        </TextoSistema>
      )}
    </div>
  )
}
