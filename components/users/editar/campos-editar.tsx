'use client'

/**
 * Labelled fields of Editar persona (prototype 05-editar-escritorio.html
 * `input`, `select`, `.msg`): the label with the required mark and the brand
 * "changed" dot (decision 8), the system control, and one message line under
 * it: error › notice (warning, never blocks) › hint. The control gets
 * `aria-invalid` and `aria-describedby`; ids are `f-<campo>` so the error
 * summary links and focus reach them.
 */
import { AlertCircle } from 'lucide-react'
import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react'

import { InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import type { AvisoCampo, CampoEdicion } from '@/lib/platform/usuarios/editar-validacion'
import { cn } from '@/lib/utils'

/** Invalid and "revisar" borders, from the control's own ARIA/data state. */
export const CLASE_ESTADO_CONTROL =
  'aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/20 data-revisar:border-warning'

export interface EstadoCampo {
  readonly modificado?: boolean
  readonly error?: string
  readonly aviso?: AvisoCampo
  readonly ayuda?: ReactNode
}

export function idCampo(campo: CampoEdicion): string {
  return `f-${campo}`
}

function Etiqueta({ campo, texto, requerido, modificado }: { readonly campo: CampoEdicion; readonly texto: string; readonly requerido?: boolean; readonly modificado?: boolean }): ReactElement {
  return (
    <label htmlFor={idCampo(campo)} className="block text-sm font-medium text-foreground">
      {texto}
      {requerido && (
        <>
          <span aria-hidden="true" className="ml-0.5 text-danger-text">*</span>
          <span className="sr-only"> (obligatorio)</span>
        </>
      )}
      {modificado && (
        <>
          <span data-testid={`modificado-${campo}`} aria-hidden="true" className="mb-0.5 ml-1.5 inline-block size-1.5 rounded-full bg-brand align-middle" />
          <span className="sr-only"> (modificado)</span>
        </>
      )}
    </label>
  )
}

function Mensaje({ campo, error, aviso, ayuda }: { readonly campo: CampoEdicion } & EstadoCampo): ReactElement | null {
  const clase = 'flex items-start gap-1.5 text-[13px] leading-[1.35]'
  if (error) {
    return (
      <p id={`m-${campo}`} className={cn(clase, 'text-danger-text')}>
        <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
        <span>{error}</span>
      </p>
    )
  }
  if (aviso) {
    return (
      <p id={`m-${campo}`} className={cn(clase, 'text-warning-text')}>
        <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
        <span>
          {aviso.destacado && <b className="font-semibold">{aviso.destacado}: </b>}
          {aviso.texto}
        </span>
      </p>
    )
  }
  if (ayuda) {
    return (
      <p id={`m-${campo}`} className={cn(clase, 'text-muted-foreground')}>
        {ayuda}
      </p>
    )
  }
  return null
}

function describedBy(estado: EstadoCampo): string | undefined {
  return estado.error || estado.aviso || estado.ayuda ? 'mensaje' : undefined
}

export interface CampoTextoProps extends EstadoCampo, Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange' | 'value'> {
  readonly campo: CampoEdicion
  readonly etiqueta: string
  readonly requerido?: boolean
  readonly ancho?: boolean
  readonly value: string
  readonly onCambio: (valor: string) => void
  /** Right slot inside the input (the age next to the birth date). */
  readonly sufijo?: ReactNode
}

export function CampoTexto({ campo, etiqueta, requerido, modificado, error, aviso, ayuda, ancho, value, onCambio, sufijo, className, ...resto }: CampoTextoProps): ReactElement {
  return (
    <div data-campo={campo} className={cn('grid min-w-0 content-start gap-2', ancho && 'col-span-full')}>
      <Etiqueta campo={campo} texto={etiqueta} requerido={requerido} modificado={modificado} />
      <InputSistema
        id={idCampo(campo)}
        name={campo}
        value={value}
        onChange={(e) => onCambio(e.target.value)}
        aria-required={requerido || undefined}
        aria-invalid={error ? true : false}
        aria-describedby={describedBy({ error, aviso, ayuda }) && `m-${campo}`}
        data-revisar={!error && aviso ? true : undefined}
        accesorio={sufijo}
        className={cn(CLASE_ESTADO_CONTROL, sufijo && 'pr-20', className)}
        {...resto}
      />
      <Mensaje campo={campo} error={error} aviso={aviso} ayuda={ayuda} />
    </div>
  )
}

export interface CampoSelectProps extends EstadoCampo {
  readonly campo: CampoEdicion
  readonly etiqueta: string
  readonly requerido?: boolean
  readonly opciones: { valor: string; etiqueta: string }[]
  readonly placeholder?: string
  readonly value: string
  readonly onCambio: (valor: string) => void
  readonly disabled?: boolean
}

export function CampoSelect({ campo, etiqueta, requerido, modificado, error, aviso, ayuda, opciones, placeholder, value, onCambio, disabled }: CampoSelectProps): ReactElement {
  return (
    <div data-campo={campo} className="grid min-w-0 content-start gap-2">
      <Etiqueta campo={campo} texto={etiqueta} requerido={requerido} modificado={modificado} />
      <SelectSistema
        id={idCampo(campo)}
        name={campo}
        opciones={opciones}
        placeholder={placeholder}
        value={value}
        onValueChange={onCambio}
        disabled={disabled}
        aria-required={requerido || undefined}
        aria-invalid={error ? true : false}
        aria-describedby={describedBy({ error, aviso, ayuda }) && `m-${campo}`}
        className={CLASE_ESTADO_CONTROL}
      />
      <Mensaje campo={campo} error={error} aviso={aviso} ayuda={ayuda} />
    </div>
  )
}
