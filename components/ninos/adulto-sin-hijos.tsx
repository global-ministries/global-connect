'use client'

import { Link2, Plus } from 'lucide-react'

import { BotonSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { FamiliaEncontrada } from '@/lib/platform/ninos/familias-vista'

type Props = {
  adulto: FamiliaEncontrada
  onAgregarNino: () => void
  onVincularHijo: () => void
}

/**
 * An existing adult with no Niños children, found by exact cédula or phone
 * (odd/tasks/ninos-checkin.md, N11). Contact data arrives masked.
 */
export function AdultoSinHijos({ adulto, onAgregarNino, onVincularHijo }: Props) {
  const contacto = [adulto.telefono && `Tel. ${adulto.telefono}`, adulto.cedula && `Cédula ${adulto.cedula}`]
    .filter(Boolean)
    .join(' · ')
  return (
    <TarjetaSistema data-testid="adulto-sin-hijos" className="space-y-4 p-4 md:p-5">
      <div className="min-w-0 space-y-1">
        <p className="break-words text-[15px] font-semibold text-foreground">
          {adulto.nombre} {adulto.apellido}
        </p>
        {contacto && (
          <TextoSistema variante="sutil" tamaño="sm">
            {contacto}
          </TextoSistema>
        )}
        <TextoSistema variante="sutil" tamaño="sm">
          Aún no tiene niños registrados
        </TextoSistema>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotonSistema type="button" icono={Plus} className="w-full sm:w-auto" onClick={onAgregarNino}>
          Agregar niño
        </BotonSistema>
        <BotonSistema type="button" variante="outline" icono={Link2} className="w-full sm:w-auto" onClick={onVincularHijo}>
          Vincular hijo existente
        </BotonSistema>
      </div>
    </TarjetaSistema>
  )
}
