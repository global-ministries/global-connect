"use client"

/**
 * T10 (odd/tasks/talleres-reserva-publica.md, S6; L30) — the two fields
 * «Lugar» (≤ 200) and «Indicaciones para los participantes» (≤ 500) of an
 * edición, controlled by the parent. Used by «Crear edición»
 * (open-edicion-form.tsx) and «Lugar e indicaciones»
 * (datos-practicos-edicion.tsx). No server action here, so the create form
 * does not pull the edición actions in.
 */

import { useId, type ReactElement } from 'react'

import { InputSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { INDICACIONES_MAX, LUGAR_MAX } from '@/lib/platform/talleres/datos-practicos'

export const PISTA_INDICACIONES = 'Qué traer, por dónde entrar, estacionamiento…'

interface CamposInput {
  readonly lugar: string
  readonly indicaciones: string
  readonly onLugarChange: (valor: string) => void
  readonly onIndicacionesChange: (valor: string) => void
  readonly disabled?: boolean
}

export function CamposDatosPracticos({
  lugar,
  indicaciones,
  onLugarChange,
  onIndicacionesChange,
  disabled = false,
}: CamposInput): ReactElement {
  const pistaId = useId()
  return (
    <div className="grid gap-4">
      <InputSistema
        label="Lugar"
        value={lugar}
        maxLength={LUGAR_MAX}
        placeholder="Ej.: Salón 2, edificio principal"
        onChange={(e) => onLugarChange(e.target.value)}
        disabled={disabled}
      />
      <div>
        <TextareaSistema
          label="Indicaciones para los participantes"
          value={indicaciones}
          maxLength={INDICACIONES_MAX}
          filas={3}
          aria-describedby={pistaId}
          onChange={(e) => onIndicacionesChange(e.target.value)}
          disabled={disabled}
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <TextoSistema id={pistaId} variante="sutil" tamaño="sm" className="block">
            {PISTA_INDICACIONES} Llegan en los avisos por correo y en la app.
          </TextoSistema>
          <TextoSistema variante="sutil" tamaño="sm" className="block shrink-0 font-mono tabular-nums">
            {indicaciones.length}/{INDICACIONES_MAX}
          </TextoSistema>
        </div>
      </div>
    </div>
  )
}
