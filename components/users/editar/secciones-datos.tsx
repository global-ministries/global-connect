'use client'

/**
 * "Información personal" and "Contacto" of Editar persona (prototype
 * `montar`): the ficha's section cards with two field columns from md.
 * Cédula is normalized on blur and gets a notice when it is not recognized
 * (decision 4); the phone is one tel field, formatted on blur, with the
 * "Revisar teléfono" notice (decision 3); the birth date cannot pass today
 * and shows the age (decision 6); género starts empty for "Otro" (decision
 * 12); estado civil reads "Casada" for a woman (decision 7).
 */
import type { ReactElement } from 'react'

import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import type { CampoEdicion, ValoresEdicion } from '@/lib/platform/usuarios/editar-validacion'
import { opcionesEstadoCivil } from '@/lib/platform/usuarios/editar-vista'
import { normalizarCedula } from '@/lib/utils/cedula'
import { esTelefonoReconocible, formatearTelefono } from '@/lib/utils/telefono'

import { edadDesde, TarjetaFicha } from '../ficha/partes-ficha'

import { CampoSelect, CampoTexto, type EstadoCampo } from './campos-editar'

interface SeccionProps {
  readonly valores: ValoresEdicion
  readonly estado: (campo: CampoEdicion) => EstadoCampo
  readonly onCambiar: (parcial: Partial<ValoresEdicion>) => void
  readonly onTocar: (campo: CampoEdicion) => void
}

const GRILLA = 'grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2'

export function SeccionPersonal({ valores: v, estado, onCambiar, onTocar, ocupaciones, profesiones }: SeccionProps & {
  readonly ocupaciones: readonly { id: string; nombre: string }[]
  readonly profesiones: readonly { id: string; nombre: string }[]
}): ReactElement {
  const hoy = hoyEnCaracas()
  const edad = v.fecha_nacimiento && v.fecha_nacimiento <= hoy ? edadDesde(v.fecha_nacimiento, new Date(`${hoy}T12:00:00`)) : null
  const texto = (campo: 'nombre' | 'apellido' | 'cedula' | 'fecha_nacimiento') => ({
    campo,
    value: v[campo],
    onCambio: (valor: string) => onCambiar({ [campo]: valor }),
    ...estado(campo),
  })
  const elegir = (campo: CampoEdicion) => (valor: string) => {
    onTocar(campo)
    onCambiar({ [campo]: valor })
  }

  return (
    <TarjetaFicha titulo="Información personal">
      <div className={GRILLA}>
        <CampoTexto etiqueta="Nombre" requerido autoComplete="given-name" onBlur={() => onTocar('nombre')} {...texto('nombre')} />
        <CampoTexto etiqueta="Apellido" requerido autoComplete="family-name" onBlur={() => onTocar('apellido')} {...texto('apellido')} />
        <CampoTexto
          etiqueta="Cédula"
          autoComplete="off"
          placeholder="18456789 o E81110494"
          autoCapitalize="characters"
          spellCheck={false}
          onBlur={(e) => {
            onTocar('cedula')
            const limpia = e.target.value.trim()
            if (limpia) onCambiar({ cedula: normalizarCedula(limpia) ?? limpia })
          }}
          {...texto('cedula')}
        />
        <CampoTexto
          etiqueta="Fecha de nacimiento"
          type="date"
          autoComplete="bday"
          max={hoy}
          onBlur={() => onTocar('fecha_nacimiento')}
          sufijo={edad !== null ? <span aria-hidden="true" className="pointer-events-none text-[13px] text-muted-foreground">{edad} años</span> : undefined}
          {...texto('fecha_nacimiento')}
        />
        <CampoSelect
          campo="genero"
          etiqueta="Género"
          requerido
          placeholder="Elige el género"
          opciones={[{ valor: 'Femenino', etiqueta: 'Femenino' }, { valor: 'Masculino', etiqueta: 'Masculino' }]}
          value={v.genero}
          onCambio={elegir('genero')}
          {...estado('genero')}
        />
        <CampoSelect campo="estado_civil" etiqueta="Estado civil" opciones={opcionesEstadoCivil(v.genero)} value={v.estado_civil} onCambio={elegir('estado_civil')} {...estado('estado_civil')} />
        <CampoSelect
          campo="ocupacion_id"
          etiqueta="Ocupación"
          opciones={[{ valor: '', etiqueta: 'Sin ocupación' }, ...ocupaciones.map((o) => ({ valor: o.id, etiqueta: o.nombre }))]}
          value={v.ocupacion_id}
          onCambio={elegir('ocupacion_id')}
          {...estado('ocupacion_id')}
        />
        <CampoSelect
          campo="profesion_id"
          etiqueta="Profesión"
          opciones={[{ valor: '', etiqueta: 'Sin profesión' }, ...profesiones.map((p) => ({ valor: p.id, etiqueta: p.nombre }))]}
          value={v.profesion_id}
          onCambio={elegir('profesion_id')}
          {...estado('profesion_id')}
        />
      </div>
    </TarjetaFicha>
  )
}

export function SeccionContacto({ valores: v, estado, onCambiar, onTocar }: SeccionProps): ReactElement {
  return (
    <TarjetaFicha titulo="Contacto" className="self-start">
      <div className={GRILLA}>
        <CampoTexto
          campo="telefono"
          etiqueta="Teléfono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0414 552 3108"
          ancho
          value={v.telefono}
          onCambio={(valor) => onCambiar({ telefono: valor })}
          onBlur={(e) => {
            onTocar('telefono')
            if (esTelefonoReconocible(e.target.value)) onCambiar({ telefono: formatearTelefono(e.target.value) })
          }}
          {...estado('telefono')}
        />
        <CampoTexto
          campo="email"
          etiqueta="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="nombre@gmail.com"
          ancho
          value={v.email}
          onCambio={(valor) => onCambiar({ email: valor })}
          onBlur={() => onTocar('email')}
          {...estado('email')}
        />
      </div>
    </TarjetaFicha>
  )
}
