'use client'

/**
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — «Recuperar clases
 * aparte» inside the taller's Configuración (artboard 14). Since T9 it is a
 * controlled switch of ConfiguracionTaller: the value comes from the taller
 * page's loader and saves with «Guardar configuración».
 */

import type { ReactElement } from 'react'

import { TextoSistema } from '@/components/ui/sistema-diseno'
import { Interruptor } from '@/components/ui/interruptor'

export interface RecuperarClasesCampoProps {
  readonly permite: boolean
  readonly onCambio: (permite: boolean) => void
  readonly puedeEditar: boolean
}

const ETIQUETA = 'Recuperar clases aparte'

export const NOTA_RECUPERAR =
  'Quien falte puede recuperar la clase en otro grupo o en una cita. La facilitadora o la coordinación la registra con fecha y quién la dio, y cuenta como asistida para el certificado.'

export function RecuperarClasesCampo({ permite, onCambio, puedeEditar }: RecuperarClasesCampoProps): ReactElement {
  if (!puedeEditar) {
    return (
      <div>
        <TextoSistema variante="sutil" tamaño="sm" className="block uppercase tracking-wide">
          {ETIQUETA}
        </TextoSistema>
        <TextoSistema className="mt-1 block">{permite ? 'Sí' : 'No'}</TextoSistema>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <TextoSistema className="block font-medium">{ETIQUETA}</TextoSistema>
        <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
          {NOTA_RECUPERAR}
        </TextoSistema>
      </div>
      <Interruptor aria-label={ETIQUETA} activo={permite} onCambio={onCambio} />
    </div>
  )
}
