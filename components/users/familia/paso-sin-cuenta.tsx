'use client'

/**
 * "No tiene cuenta" (S15 decisions 7 and 8; prototype `cuerpoSinCuenta`):
 * nombre, apellido and fecha de nacimiento required; cédula, teléfono and
 * género optional. Under 13 points to Mis hijos. The callout says how the
 * campus checks it before the ficha exists.
 */
import { AlertCircle, ShieldCheck } from 'lucide-react'
import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import type { CampoSinCuenta } from '@/lib/platform/usuarios/familia-vista'
import { cn } from '@/lib/utils'

import { CLASE_ESTADO_CONTROL } from '../editar/campos-editar'

import type { HojaFamiliar } from './use-hoja-familiar'

const id = (campo: CampoSinCuenta) => `mf-${campo}`

function Campo({
  campo, etiqueta, requerido, error, ayuda, ancho, value, onCambio, ...resto
}: {
  readonly campo: CampoSinCuenta
  readonly etiqueta: string
  readonly requerido?: boolean
  readonly error?: ReactNode
  readonly ayuda?: string
  readonly ancho?: boolean
  readonly value: string
  readonly onCambio: (v: string) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange'>): ReactElement {
  const mensaje = error || ayuda
  return (
    <div className={cn('grid min-w-0 content-start gap-2', ancho && 'col-span-full')}>
      <label htmlFor={id(campo)} className="block text-sm font-medium text-foreground">
        {etiqueta}
        {requerido ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger-text">*</span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        ) : (
          <span className="font-normal text-muted-foreground"> (opcional)</span>
        )}
      </label>
      <InputSistema
        id={id(campo)}
        value={value}
        onChange={(e) => onCambio(e.target.value)}
        aria-required={requerido || undefined}
        aria-invalid={error ? true : false}
        aria-describedby={mensaje ? `${id(campo)}-m` : undefined}
        className={CLASE_ESTADO_CONTROL}
        {...resto}
      />
      {mensaje && (
        <p id={`${id(campo)}-m`} className={cn('flex items-start gap-1.5 text-[13px] leading-[1.35]', error ? 'text-danger-text' : 'text-muted-foreground')}>
          {error && <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />}
          <span>{mensaje}</span>
        </p>
      )}
    </div>
  )
}

export function PasoSinCuenta({ h, hoy, onIrAMisHijos }: { readonly h: HojaFamiliar; readonly hoy: string; readonly onIrAMisHijos: () => void }): ReactElement {
  const { form, errores } = h
  const errorFecha = h.menor && h.relacion === 'hijo' ? (
    <>
      Tiene menos de 13 años: regístralo en{' '}
      <button type="button" onClick={onIrAMisHijos} className="focus-ring font-semibold underline underline-offset-2">
        Mis hijos
      </button>
      .
    </>
  ) : h.menor ? 'Tiene menos de 13 años: los niños se registran en Niños.' : errores.fechaNacimiento

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Campo campo="nombre" etiqueta="Nombre" requerido autoComplete="off" autoFocus value={form.nombre} error={errores.nombre} onCambio={(nombre) => h.cambiarForm({ nombre })} />
        <Campo campo="apellido" etiqueta="Apellido" requerido autoComplete="off" value={form.apellido} error={errores.apellido} onCambio={(apellido) => h.cambiarForm({ apellido })} />
        <Campo
          campo="fechaNacimiento"
          etiqueta="Fecha de nacimiento"
          requerido
          ancho
          type="date"
          max={hoy}
          value={form.fechaNacimiento}
          error={errorFecha}
          ayuda="Nos ayuda a no crear a la misma persona dos veces."
          onCambio={(fechaNacimiento) => h.cambiarForm({ fechaNacimiento })}
        />
        <Campo campo="cedula" etiqueta="Cédula" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={form.cedula} error={errores.cedula} onCambio={(cedula) => h.cambiarForm({ cedula })} />
        <Campo campo="telefono" etiqueta="Teléfono" type="tel" inputMode="tel" autoComplete="off" value={form.telefono} error={errores.telefono} onCambio={(telefono) => h.cambiarForm({ telefono })} />
        <div className="col-span-full sm:col-span-1">
          <SelectSistema
            label="Género (opcional)"
            placeholder="Sin indicar"
            opciones={[{ valor: 'Femenino', etiqueta: 'Femenino' }, { valor: 'Masculino', etiqueta: 'Masculino' }]}
            value={form.genero}
            onValueChange={(g) => h.cambiarForm({ genero: g === 'Femenino' || g === 'Masculino' ? g : '' })}
          />
        </div>
      </div>
      <AvisoFormulario tono="info" className="flex items-start gap-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info-text" />
        <div>
          <p className="font-semibold">Así lo cuidamos</p>
          <p className="mt-0.5 text-muted-foreground">
            Antes de crearlo revisamos que no exista ya (cédula, o nombre y fecha). Tu campus lo confirma y solo tú y tu campus pueden editar sus datos. Si un día crea su cuenta con su cédula, se une a esta ficha.
          </p>
        </div>
      </AvisoFormulario>
    </div>
  )
}
