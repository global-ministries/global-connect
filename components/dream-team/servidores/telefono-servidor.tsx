'use client'

/**
 * Servidores — the phone of a row (the one on the person's profile).
 *
 *  - recognized mobile: `0412 545 7346` as a link to WhatsApp, in a new tab;
 *  - recognized landline: the formatted number, no link;
 *  - anything else (foreign, incomplete, zero filler): the value as it is
 *    stored, no link, with a small "Revisar teléfono" warning;
 *  - empty: nothing.
 *
 * The rule is lib/utils/telefono.ts, the TypeScript mirror of the SQL function
 * that normalizes phones when they are saved.
 */
import type { ReactElement } from 'react'

import { BadgeSistema, EnlaceSistema } from '@/components/ui/sistema-diseno'
import { enlaceWhatsapp, esTelefonoReconocible, formatearTelefono } from '@/lib/utils/telefono'

export interface TelefonoServidorProps {
  readonly telefono: string | null
}

export function TelefonoServidor({ telefono }: TelefonoServidorProps): ReactElement | null {
  if (telefono === null || telefono.trim() === '') return null

  if (!esTelefonoReconocible(telefono)) {
    return (
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{telefono}</span>
        <BadgeSistema variante="warning" tamaño="sm">
          Revisar teléfono
        </BadgeSistema>
      </div>
    )
  }

  const formateado = formatearTelefono(telefono)
  const whatsapp = enlaceWhatsapp(telefono)
  if (whatsapp === null) {
    return <div className="mt-0.5 text-sm text-muted-foreground">{formateado}</div>
  }
  return (
    <div className="mt-0.5 text-sm">
      <EnlaceSistema
        variante="marca"
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[24px] items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        {formateado} · WhatsApp
      </EnlaceSistema>
    </div>
  )
}
