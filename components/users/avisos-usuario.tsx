/**
 * The person's notices ("Revisar teléfono", no account, no group), shared by
 * the ficha's header (prototype `.avisos`, 03-ficha-escritorio.html) and the
 * list's person panel, so both show the same texts, tones and look. The
 * notices come from avisosFicha (lib/platform/usuarios/ficha-vista.ts); tone
 * colors are tokens.
 */
import { Info, Mail, Phone } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { AvisoFicha } from '@/lib/platform/usuarios/ficha-vista'

export interface AvisosUsuarioProps {
  readonly avisos: readonly AvisoFicha[]
  /** The action of each notice (Corregir, Invitar), by id. */
  readonly accionAviso?: Partial<Record<AvisoFicha['id'], ReactNode>>
}

function Icono({ id, tono }: { readonly id: AvisoFicha['id']; readonly tono: AvisoFicha['tono'] }): ReactElement {
  const Svg = id === 'telefono' ? Phone : id === 'cuenta' ? Mail : Info
  return <Svg aria-hidden="true" className={cn('mt-0.5 size-[18px] shrink-0', tono === 'warning' ? 'text-warning-text' : 'text-info-text')} />
}

export function AvisosUsuario({ avisos, accionAviso = {} }: AvisosUsuarioProps): ReactElement | null {
  if (avisos.length === 0) return null
  return (
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
  )
}
