'use client'

/**
 * Estudiantes — the typed fields of a representante («No está, registrarlo»:
 * nombre, apellido, teléfono, cédula, sexo), the Sexo control and the
 * Parentesco select, shared by "Agregar visitante" and «Agregar
 * representante» of the member view (S1, S2 of
 * odd/tasks/representante-buscador.md). `InputSistema`, `SelectSistema` and
 * `ControlSegmentado` only.
 */
import type { ReactElement } from 'react'

import { InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import {
  OPCIONES_PARENTESCO,
  type ErroresRepresentante,
  type Genero,
  type RepresentanteFormulario,
  type TipoRepresentante,
} from '@/lib/platform/estudiantes/visitante'

const SEXOS: readonly { readonly valor: Genero; readonly etiqueta: string }[] = [
  { valor: 'Femenino', etiqueta: 'Femenino' },
  { valor: 'Masculino', etiqueta: 'Masculino' },
]

function ErrorCampo({ id, mensaje }: { readonly id: string; readonly mensaje: string | undefined }): ReactElement | null {
  if (!mensaje) return null
  return (
    <p id={id} role="alert" className="text-sm font-medium text-danger-text">
      {mensaje}
    </p>
  )
}

export function CampoSexo({
  id,
  valor,
  onCambio,
  error,
}: {
  readonly id: string
  readonly valor: Genero | ''
  readonly onCambio: (genero: Genero) => void
  readonly error: string | undefined
}): ReactElement {
  return (
    <div className="space-y-2">
      <span id={id} className="block text-sm font-medium text-foreground">
        Sexo
      </span>
      <ControlSegmentado<Genero | ''>
        etiqueta="Sexo"
        opciones={SEXOS}
        valor={valor}
        onCambio={(v) => v && onCambio(v)}
        className="grid w-full grid-cols-2"
      />
      <ErrorCampo id={`${id}-error`} mensaje={error} />
    </div>
  )
}

export interface CamposRepresentanteProps {
  /** Base of the element ids (the Sexo label is `<id>-sexo`). */
  readonly id: string
  readonly valor: RepresentanteFormulario
  readonly errores: ErroresRepresentante
  readonly onCambio: (parche: Partial<RepresentanteFormulario>) => void
}

/** The typed fields of «No está, registrarlo». */
export function CamposRepresentante({ id, valor, errores, onCambio }: CamposRepresentanteProps): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <InputSistema label="Nombre" autoComplete="off" value={valor.nombre} error={errores.repNombre} onChange={(e) => onCambio({ nombre: e.target.value })} />
      <InputSistema label="Apellido (opcional)" autoComplete="off" value={valor.apellido} onChange={(e) => onCambio({ apellido: e.target.value })} />
      <InputSistema
        label="Teléfono"
        type="tel"
        inputMode="tel"
        placeholder="0414 555 0000"
        className="font-mono tabular-nums"
        value={valor.telefono}
        error={errores.repTelefono}
        onChange={(e) => onCambio({ telefono: e.target.value })}
      />
      <InputSistema
        label="Cédula (opcional)"
        inputMode="numeric"
        autoComplete="off"
        placeholder="V-12345678"
        className="font-mono tabular-nums"
        value={valor.cedula}
        onChange={(e) => onCambio({ cedula: e.target.value })}
      />
      <CampoSexo id={`${id}-sexo`} valor={valor.genero} onCambio={(genero) => onCambio({ genero })} error={errores.repGenero} />
    </div>
  )
}

/** The parentesco, shown once someone is picked or typed. */
export function CampoParentesco({ valor, onCambio }: { readonly valor: TipoRepresentante; readonly onCambio: (tipo: TipoRepresentante) => void }): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectSistema label="Parentesco" opciones={[...OPCIONES_PARENTESCO]} value={valor} onValueChange={(tipo) => onCambio(tipo as TipoRepresentante)} />
    </div>
  )
}
