'use client'

/**
 * "Invitar a la plataforma" (T12 of odd/tasks/ninos-voluntarios-waumba.md):
 * a side panel to invite a person without account by email, and a button
 * for the user detail page that shows only when the viewer may invite and
 * the person has no account.
 *
 * GET/POST /api/users/[id]/invitacion-cuenta; the database decides who may
 * invite (admin, pastor, the volunteer coordinator over the person's area).
 * When the ficha holds another email, the API answers `email_distinto` and
 * the panel asks to confirm the replacement before sending again.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { MailPlus } from 'lucide-react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BotonSistema, InputSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import type { EstadoInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'

const urlInvitacion = (personaId: string) => `/api/users/${encodeURIComponent(personaId)}/invitacion-cuenta`

async function leerError(res: Response, porDefecto: string): Promise<{ error: string; codigo?: string }> {
  try {
    const cuerpo = (await res.json()) as { error?: string; codigo?: string }
    return { error: cuerpo.error ?? porDefecto, codigo: cuerpo.codigo }
  } catch {
    return { error: porDefecto }
  }
}

export function fechaInvitacion(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Loads the invitation state while `activo`; null until loaded or when the viewer may not invite. */
export function useEstadoInvitacion(personaId: string, activo: boolean) {
  const [estado, setEstado] = useState<EstadoInvitacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!activo) return
    let vigente = true
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(urlInvitacion(personaId), { cache: 'no-store' })
        if (!res.ok) {
          if (vigente) {
            setEstado(null)
            if (res.status !== 404 && res.status !== 403) setError((await leerError(res, 'No se pudo cargar la invitación.')).error)
          }
          return
        }
        const { estado: cargado } = (await res.json()) as { estado: EstadoInvitacion }
        if (vigente) setEstado(cargado)
      } catch {
        if (vigente) setError('No se pudo cargar la invitación.')
      }
    })()
    return () => {
      vigente = false
    }
  }, [personaId, activo, version])

  return { estado, error, recargar }
}

export interface InvitarCuentaPanelProps {
  readonly personaId: string
  readonly nombre: string
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  readonly onInvitada?: () => void
}

export function InvitarCuentaPanel({
  personaId,
  nombre,
  abierto,
  onAbiertoChange,
  onInvitada,
}: InvitarCuentaPanelProps): ReactElement {
  const toast = useNotificaciones()
  const { estado, error: errorCarga, recargar } = useEstadoInvitacion(personaId, abierto)
  const [email, setEmail] = useState('')
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setConfirmarReemplazo(false)
    setError(null)
  }, [abierto])

  useEffect(() => {
    if (estado) setEmail(estado.invitacion?.estado === 'enviada' ? estado.invitacion.email : (estado.emailFicha ?? ''))
  }, [estado])

  const enviada = estado?.invitacion?.estado === 'enviada' ? estado.invitacion : null

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (enviando || email.trim() === '') return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(urlInvitacion(personaId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), reemplazarEmail: confirmarReemplazo }),
      })
      if (!res.ok) {
        const f = await leerError(res, 'No se pudo enviar la invitación.')
        if (f.codigo === 'email_distinto') setConfirmarReemplazo(true)
        setError(f.error)
        return
      }
      toast.success(`Invitación enviada a ${email.trim().toLowerCase()}.`)
      recargar()
      onInvitada?.()
      onAbiertoChange(false)
    } catch {
      setError('No se pudo enviar la invitación.')
    } finally {
      setEnviando(false)
    }
  }

  const cargando = estado === null && errorCarga === null

  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent side="right" className="h-dvh w-full max-w-none gap-0 p-0 sm:w-[480px] sm:max-w-[480px]">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>Invitar a la plataforma</SheetTitle>
          <SheetDescription>
            {nombre} recibirá un correo para crear su contraseña y entrar con su ficha.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4">
            {cargando && <TextoSistema variante="sutil">Cargando…</TextoSistema>}
            {estado !== null && !estado.sinCuenta && (
              <TextoSistema variante="sutil">Esta persona ya tiene una cuenta.</TextoSistema>
            )}
            {estado !== null && estado.sinCuenta && (
              <>
                {enviada && (
                  <TextoSistema variante="sutil">
                    Invitación enviada el {fechaInvitacion(enviada.enviadaEl)} a {enviada.email}.
                  </TextoSistema>
                )}
                <InputSistema
                  label="Correo"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(ev) => {
                    setEmail(ev.target.value)
                    setError(null)
                  }}
                />
                {confirmarReemplazo && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmarReemplazo}
                      onChange={(ev) => setConfirmarReemplazo(ev.target.checked)}
                    />
                    Reemplazar el correo de la ficha
                    {estado.emailFicha ? ` (${estado.emailFicha})` : ''} por este
                  </label>
                )}
              </>
            )}
            {(error ?? errorCarga) !== null && (
              <p role="alert" className="text-sm text-destructive">
                {error ?? errorCarga}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border p-4">
            <BotonSistema type="button" variante="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </BotonSistema>
            {estado?.sinCuenta && (
              <BotonSistema type="submit" disabled={enviando || email.trim() === ''} cargando={enviando}>
                {enviada ? 'Reenviar' : 'Enviar invitación'}
              </BotonSistema>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** For the user detail page: shows only when the viewer may invite and the person has no account. */
export function InvitarCuentaBoton({ personaId, nombre }: { readonly personaId: string; readonly nombre: string }): ReactElement | null {
  const [abierto, setAbierto] = useState(false)
  const { estado, recargar } = useEstadoInvitacion(personaId, true)
  if (!estado?.sinCuenta) return null
  const enviada = estado.invitacion?.estado === 'enviada'

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full flex flex-col items-center justify-center p-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl transition-all duration-200 text-white shadow-lg hover:scale-105"
      >
        <MailPlus className="w-6 h-6 mb-2" aria-hidden="true" />
        <span className="block font-medium">{enviada ? 'Reenviar invitación' : 'Invitar a la plataforma'}</span>
      </button>
      <InvitarCuentaPanel
        personaId={personaId}
        nombre={nombre}
        abierto={abierto}
        onAbiertoChange={setAbierto}
        onInvitada={recargar}
      />
    </>
  )
}
