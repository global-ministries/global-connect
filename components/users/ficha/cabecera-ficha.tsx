/**
 * The top of the ficha (prototype `.ficha-hero`, `.quick`, `.motivo`,
 * `.avisos`): "‹ Usuarios" on phones, the avatar, the name (the page h1 from
 * md; an h2 on phones, where the shell's header holds the h1), the identity
 * line (neutral role tag, campus, cédula, account state), the contact actions
 * (outline buttons on desktop, four large quick actions on phones), why a
 * contact button is disabled, and the notices.
 */
import Link from 'next/link'
import { Info, Mail, MessageCircle, Pencil, Phone, type LucideIcon } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { BotonAtrasMovil } from '@/components/ui/barra-navegacion-movil'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import type { PersonaFicha, ResumenFicha } from '@/lib/platform/usuarios/ficha-persona'
import type { AccionesFicha, AvisoFicha } from '@/lib/platform/usuarios/ficha-vista'
import { ETIQUETA_CUENTA, type CuentaEstado } from '@/lib/platform/usuarios/lista-vista'

import { AvatarFicha, EtiquetaNeutra } from './partes-ficha'

interface Accion {
  readonly id: string
  readonly etiqueta: string
  readonly icono: LucideIcon
  readonly href: string | null
  readonly externo?: boolean
}

function accionesDeContacto(acciones: AccionesFicha): Accion[] {
  const lista: Accion[] = []
  if (acciones.contactoPermitido) {
    lista.push(
      { id: 'whatsapp', etiqueta: 'WhatsApp', icono: MessageCircle, href: acciones.whatsapp, externo: true },
      { id: 'llamar', etiqueta: 'Llamar', icono: Phone, href: acciones.llamar },
    )
  }
  lista.push({ id: 'email', etiqueta: 'Email', icono: Mail, href: acciones.email })
  return lista
}

/** A link styled as a button, or the same button disabled when there is nothing to open. */
function BotonAccion({ accion, grande = false }: { readonly accion: Accion; readonly grande?: boolean }): ReactElement {
  const clase = grande ? 'min-h-[66px] w-full flex-col gap-1.5 px-2 text-[13px]' : undefined
  if (!accion.href) {
    return (
      <BotonSistema type="button" variante="outline" tamaño={grande ? 'md' : 'sm'} icono={accion.icono} disabled className={clase}>
        {accion.etiqueta}
      </BotonSistema>
    )
  }
  return (
    <BotonSistema asChild variante="outline" tamaño={grande ? 'md' : 'sm'} icono={accion.icono} className={clase}>
      <a href={accion.href} {...(accion.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {accion.etiqueta}
      </a>
    </BotonSistema>
  )
}

export interface CabeceraFichaProps {
  readonly persona: PersonaFicha
  readonly resumen: ResumenFicha
  readonly cuenta: CuentaEstado | null
  readonly acciones: AccionesFicha
  readonly avisos: readonly AvisoFicha[]
  /** The action of each notice (Corregir, Invitar), by id. */
  readonly accionAviso: Partial<Record<AvisoFicha['id'], ReactNode>>
}

export function CabeceraFicha({ persona, resumen, cuenta, acciones, avisos, accionAviso }: CabeceraFichaProps): ReactElement {
  const nombre = `${persona.nombre} ${persona.apellido}`.trim()
  const contacto = accionesDeContacto(acciones)
  const rapidas = acciones.editar
    ? [...contacto, { id: 'editar', etiqueta: 'Editar', icono: Pencil, href: `/users/${persona.id}/edit` }]
    : contacto
  const claseNombre = 'text-2xl font-bold leading-[1.15] tracking-[-0.02em] text-foreground md:font-[650] [overflow-wrap:anywhere]'

  return (
    <div className="grid gap-4">
      <div className="-mx-2 -mt-2 md:hidden">
        <BotonAtrasMovil atras={{ etiqueta: 'Usuarios', href: '/users' }} />
      </div>
      <section aria-label="Identidad" className="flex min-w-0 items-center gap-3.5 md:gap-[18px]">
        <AvatarFicha nombre={persona.nombre} apellido={persona.apellido} fotoUrl={persona.fotoUrl} tamano="xl" />
        <div className="min-w-0 flex-1">
          <h1 className={cn(claseNombre, 'max-md:hidden')}>{nombre}</h1>
          <h2 className={cn(claseNombre, 'md:hidden')}>{nombre}</h2>
          <p data-testid="linea-identidad" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
            <EtiquetaNeutra>{persona.rol.etiqueta}</EtiquetaNeutra>
            {resumen.campus && <span>{resumen.campus}</span>}
            {persona.cedula && <span className="font-mono tabular-nums tracking-[-0.02em]">{persona.cedula}</span>}
            {cuenta && <PuntoEstado tono={ETIQUETA_CUENTA[cuenta].tono} etiqueta={ETIQUETA_CUENTA[cuenta].etiqueta} />}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 max-md:hidden">
          {contacto.map((a) => (
            <BotonAccion key={a.id} accion={a} />
          ))}
        </div>
      </section>
      <div className="grid gap-2 md:hidden" style={{ gridTemplateColumns: `repeat(${rapidas.length}, minmax(0, 1fr))` }}>
        {rapidas.map((a) => (
          <BotonAccion key={a.id} accion={a} grande />
        ))}
      </div>
      {acciones.motivo && <p className="-mt-1 text-[13px] text-muted-foreground">{acciones.motivo}</p>}
      {avisos.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))] gap-2.5">
          {avisos.map((a) => (
            <div
              key={a.id}
              role="note"
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-3.5 text-sm',
                a.tono === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-info/40 bg-info/10',
              )}
            >
              <Icono id={a.id} tono={a.tono} />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{a.titulo}</p>
                <p className="mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">{a.texto}</p>
                {accionAviso[a.id] && <div className="mt-2.5">{accionAviso[a.id]}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Icono({ id, tono }: { readonly id: AvisoFicha['id']; readonly tono: AvisoFicha['tono'] }): ReactElement {
  const Svg = id === 'telefono' ? Phone : id === 'cuenta' ? Mail : Info
  return <Svg aria-hidden="true" className={cn('mt-0.5 size-[18px] shrink-0', tono === 'warning' ? 'text-warning-text' : 'text-info-text')} />
}

/** "Corregir en la ficha" for an editor, under the phone notice. */
export function EnlaceCorregir({ personaId }: { readonly personaId: string }): ReactElement {
  return (
    <BotonSistema asChild variante="outline" tamaño="sm">
      <Link href={`/users/${personaId}/edit`}>Corregir en la ficha</Link>
    </BotonSistema>
  )
}
