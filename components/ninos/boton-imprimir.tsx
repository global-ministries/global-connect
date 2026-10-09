'use client'

import { Printer } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'

export function BotonImprimir() {
  return (
    <BotonSistema type="button" icono={Printer} className="print:hidden" onClick={() => window.print()}>
      Imprimir cartel
    </BotonSistema>
  )
}
