'use client'

/**
 * Usuarios — the person panel (docs/design-system/patterns.md#detail-drawer;
 * prototype 01-lista-escritorio.html, `openPerson`): one `DetalleResponsivo`
 * (side panel from md, bottom sheet below) per person, opened from the row.
 *
 * Order: identity (avatar, "rol · campus", phone in mono); quick actions
 * (WhatsApp, Llamar, Email, Editar), with one line on what is missing;
 * callouts ("Revisar teléfono", no account, no group); Datos and Grupo de
 * Vida; footer "Asistencia" and "Ver ficha completa".
 *
 * WhatsApp and Llamar show when the role allows contact
 * (lib/platform/usuarios/contacto.ts: decision 6, a leader only for their own
 * group) and are disabled without a usable number. Editar asks
 * puede_editar_usuario, the same check as the ficha and /users/[id]/edit.
 * "Invitar a la plataforma" reuses the canonical InvitarCuentaPanel; its
 * server action checks the permission again.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { Mail, MessageCircle, Phone, UserPen } from 'lucide-react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { InvitarCuentaPanel } from '@/components/cuentas/invitar-cuenta-panel'
import { telefonoARevisar, telefonoVisible } from '@/components/dream-team/servidores/lista-servidores'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { ETIQUETA_ROL, type FilaVistaUsuario } from '@/lib/platform/usuarios/lista-vista'
import { cn } from '@/lib/utils'

import { AvatarUsuario, cedulaVisible, fechaCorta } from './lista-usuarios'

/** The quick actions are 66px stacked buttons, icon over label (as in the Dream Team panel). */
const ACCION_RAPIDA = 'h-[66px] min-w-0 flex-col gap-1 px-2 text-[13px]'

/** What the quick actions cannot do, in one line (prototype `motivoContacto`). */
export function motivoContacto(fila: FilaVistaUsuario): string | null {
  if (fila.contactoPermitido && !fila.telefono) return 'Sin teléfono registrado: WhatsApp y Llamar no están disponibles.'
  if (fila.contactoPermitido && !fila.contacto.whatsapp) return 'El teléfono necesita revisión, así que WhatsApp no está disponible.'
  if (!fila.email) return 'Sin email registrado.'
  return null
}

/** puede_editar_usuario for the open person; `false` until the server answers. */
function usePuedeEditar(personaId: string | null): boolean {
  const { authUserId } = useCurrentUser()
  const supabase = useMemo(() => createClient(), [])
  const [permiso, setPermiso] = useState<{ readonly id: string; readonly valor: boolean } | null>(null)

  useEffect(() => {
    if (!personaId || !authUserId) return
    let vigente = true
    supabase.rpc('puede_editar_usuario', { p_auth_id: authUserId, p_target_user_id: personaId }).then(({ data, error }) => {
      if (vigente) setPermiso({ id: personaId, valor: !error && data === true })
    })
    return () => {
      vigente = false
    }
  }, [personaId, authUserId, supabase])

  return permiso !== null && permiso.id === personaId && permiso.valor
}

function AccionEnlace({ href, icono, etiqueta, externo = false }: { readonly href: string | null; readonly icono: typeof Phone; readonly etiqueta: string; readonly externo?: boolean }): ReactElement {
  if (!href) {
    return (
      <BotonSistema type="button" variante="outline" icono={icono} className={ACCION_RAPIDA} disabled>
        {etiqueta}
      </BotonSistema>
    )
  }
  return (
    <BotonSistema asChild variante="outline" icono={icono} className={ACCION_RAPIDA}>
      <a href={href} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {etiqueta}
      </a>
    </BotonSistema>
  )
}

function Dato({ etiqueta, children, className }: { readonly etiqueta: string; readonly children: React.ReactNode; readonly className?: string }): ReactElement {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** One column per quick action (prototype `--n`), so none wraps alone. */
const COLUMNAS_ACCIONES: Readonly<Record<number, string>> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }

const TITULO_SECCION = 'text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground'

export interface DetalleUsuarioProps {
  readonly fila: FilaVistaUsuario | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  /** "Invitar a la plataforma" (the roles that add people). */
  readonly puedeInvitar: boolean
  /** After an invitation: reload the list (the account state changes). */
  readonly onInvitada?: () => void
}

export function DetalleUsuario({ fila, abierto, onCambioAbierto, puedeInvitar, onInvitada }: DetalleUsuarioProps): ReactElement | null {
  const puedeEditar = usePuedeEditar(abierto && fila ? fila.id : null)
  const [invitando, setInvitando] = useState(false)
  if (!fila) return null

  const telefono = telefonoVisible(fila.telefono)
  const motivo = motivoContacto(fila)
  const roles = fila.roles.length > 0 ? fila.roles.map((rol) => ETIQUETA_ROL[rol] ?? rol).join(', ') : 'Sin rol'
  const linea = [fila.roles[0] ? (ETIQUETA_ROL[fila.roles[0]] ?? fila.roles[0]) : 'Sin rol', fila.campusNombre].filter(Boolean).join(' · ')
  const acciones = (fila.contactoPermitido ? 3 : 1) + (puedeEditar ? 1 : 0)

  return (
    <>
      <DetalleResponsivo
        abierto={abierto}
        onCambioAbierto={onCambioAbierto}
        titulo={fila.nombreCompleto}
        pie={
          <>
            <BotonSistema asChild variante="outline" className="flex-1">
              <Link href={`/users/${fila.id}/asistencia`}>Asistencia</Link>
            </BotonSistema>
            <BotonSistema asChild className="flex-1">
              <Link href={`/users/${fila.id}`}>Ver ficha completa</Link>
            </BotonSistema>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex min-w-0 items-center gap-4">
            <AvatarUsuario fila={fila} grande />
            <div className="min-w-0 text-sm text-muted-foreground">
              <p className="truncate">{linea}</p>
              {telefono && <p className="font-mono tabular-nums">{telefono}</p>}
            </div>
          </div>

          <div className={cn('grid gap-2', COLUMNAS_ACCIONES[acciones])}>
            {fila.contactoPermitido && (
              <>
                <AccionEnlace href={fila.contacto.whatsapp} icono={MessageCircle} etiqueta="WhatsApp" externo />
                <AccionEnlace href={fila.contacto.llamar} icono={Phone} etiqueta="Llamar" />
              </>
            )}
            <AccionEnlace href={fila.email ? `mailto:${fila.email}` : null} icono={Mail} etiqueta="Email" />
            {puedeEditar && (
              <BotonSistema asChild variante="outline" icono={UserPen} className={ACCION_RAPIDA}>
                <Link href={`/users/${fila.id}/edit`}>Editar</Link>
              </BotonSistema>
            )}
          </div>
          {motivo && <p className="-mt-2 text-[13px] text-muted-foreground">{motivo}</p>}

          {telefonoARevisar(fila.telefono) && (
            <AvisoFormulario tono="info" className="space-y-2">
              <p className="font-semibold text-foreground">Revisar teléfono</p>
              <p>{`«${fila.telefono}» no parece un número válido, así que WhatsApp no funciona.`}</p>
              {puedeEditar && (
                <BotonSistema asChild variante="outline" tamaño="sm">
                  <Link href={`/users/${fila.id}/edit`}>Corregir en la ficha</Link>
                </BotonSistema>
              )}
            </AvisoFormulario>
          )}

          {fila.cuenta !== 'si' && (
            <AvisoFormulario tono="marca" className="space-y-2">
              <p className="font-semibold text-foreground">
                {fila.cuenta === 'invitada' ? 'Invitación enviada, todavía sin cuenta' : 'No tiene cuenta en la plataforma'}
              </p>
              <p>No ve sus grupos ni recibe recordatorios.</p>
              {puedeInvitar && (
                // The panel closes first, so two modals never fight for focus.
                <BotonSistema
                  type="button"
                  tamaño="sm"
                  onClick={() => {
                    onCambioAbierto(false)
                    setInvitando(true)
                  }}
                >
                  {fila.cuenta === 'invitada' ? 'Reenviar invitación' : 'Invitar a la plataforma'}
                </BotonSistema>
              )}
            </AvisoFormulario>
          )}

          {!fila.grupoNombre && (
            <AvisoFormulario tono="info" className="space-y-1">
              <p className="font-semibold text-foreground">No está en un Grupo de Vida</p>
              <p>Conéctalo con un grupo cerca de su casa desde Grupos de Vida.</p>
            </AvisoFormulario>
          )}

          <section aria-labelledby="usuario-datos" className="space-y-3">
            <h2 id="usuario-datos" className={TITULO_SECCION}>
              Datos
            </h2>
            <TarjetaSistema className="p-4">
              <dl className="grid grid-cols-2 gap-3">
                <Dato etiqueta="Cédula">
                  <span className="font-mono tabular-nums">{cedulaVisible(fila.cedula) ?? 'No especificada'}</span>
                </Dato>
                <Dato etiqueta="Registro">{fechaCorta(fila.fechaRegistro) ?? 'No especificado'}</Dato>
                <Dato etiqueta="Email" className="col-span-2">{fila.email ?? 'No especificado'}</Dato>
                <Dato etiqueta="Cuenta">
                  <PuntoEstado tono={fila.cuentaTono} etiqueta={fila.cuentaEtiqueta} />
                </Dato>
                <Dato etiqueta="Rol">{roles}</Dato>
              </dl>
            </TarjetaSistema>
          </section>

          {fila.grupoNombre && (
            <section aria-labelledby="usuario-grupo" className="space-y-3">
              <h2 id="usuario-grupo" className={TITULO_SECCION}>
                Grupo de Vida
              </h2>
              <TarjetaSistema className="p-4">
                <p className="truncate font-semibold text-foreground">{fila.grupoNombre}</p>
              </TarjetaSistema>
            </section>
          )}
        </div>
      </DetalleResponsivo>

      {puedeInvitar && (
        <InvitarCuentaPanel
          personaId={fila.id}
          nombre={fila.nombreCompleto}
          abierto={invitando}
          onAbiertoChange={setInvitando}
          onInvitada={onInvitada}
        />
      )}
    </>
  )
}
