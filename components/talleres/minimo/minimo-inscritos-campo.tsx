'use client'

/**
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S16) — «Mínimo de inscritos
 * para abrir» inside the taller's Configuración (artboard 14). Since T9 it is
 * a controlled field of ConfiguracionTaller: the value comes from the taller
 * page's loader and saves with «Guardar configuración». Empty = no minimum.
 */

import type { ReactElement } from 'react'

import { InputSistema, TextoSistema } from '@/components/ui/sistema-diseno'

export interface MinimoInscritosCampoProps {
  readonly tipo: 'individual' | 'pareja'
  /** The field's text; '' = sin mínimo. */
  readonly valor: string
  readonly onCambio: (valor: string) => void
  readonly puedeEditar: boolean
}

export const NOTA_MINIMO =
  'Cuentan solo las inscripciones aprobadas. Si al cierre no llega al mínimo, decides: suspender y mover a una nueva fecha, abrir igual o cancelar. Abrir por debajo del mínimo: solo la dirección de Conexión y el coordinador del taller.'

export function MinimoInscritosCampo({ tipo, valor, onCambio, puedeEditar }: MinimoInscritosCampoProps): ReactElement {
  const unidad = tipo === 'pareja' ? 'parejas' : 'personas'

  if (!puedeEditar) {
    return (
      <div>
        <TextoSistema variante="sutil" tamaño="sm" className="block uppercase tracking-wide">
          Mínimo de inscritos para abrir
        </TextoSistema>
        <TextoSistema className="mt-1 block">{valor.trim() === '' ? 'Sin mínimo' : `${valor} ${unidad}`}</TextoSistema>
      </div>
    )
  }

  return (
    <div>
      <InputSistema
        label={`Mínimo de inscritos para abrir (${unidad})`}
        type="number"
        inputMode="numeric"
        min={1}
        max={500}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder="Sin mínimo"
        className="w-32 font-mono tabular-nums"
      />
      <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
        {NOTA_MINIMO}
      </TextoSistema>
    </div>
  )
}
