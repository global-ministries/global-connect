/**
 * «Contextos visibles»: the platform contexts of the session, behind the
 * platform navigation flag (lib/dashboard/contextual-navigation). Kept from
 * the previous dashboard; the home shows it after «Visión general» or the
 * cargos.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'

import { TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import type { DashboardContextualShortcut } from '@/lib/dashboard/contextual-navigation'

export function ContextosVisibles({ items }: { readonly items: DashboardContextualShortcut[] }): ReactElement {
  return (
    <TarjetaSistema className="p-4 md:p-5">
      <section aria-labelledby="contextos-visibles-dashboard" className="space-y-3">
        <div className="space-y-1">
          <TituloSistema id="contextos-visibles-dashboard" nivel={3}>
            Contextos visibles
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">
            Accesos disponibles para tu sesión actual.
          </TextoSistema>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-label={`Abrir ${item.label}`}
              className="focus-ring min-h-11 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-accent"
            >
              <span className="block text-sm font-medium text-foreground">{item.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </TarjetaSistema>
  )
}
