'use client'

/**
 * "Tú" (public) / "Representante" (desk): name, surname, phone and Mamá /
 * Papá. The desk keeps the accessible names of the former form
 * ("Nombre del representante", …) so its tests and habits stay.
 */
import type { ReactNode } from 'react'
import { Phone, User, Users } from 'lucide-react'

import { CamposSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import type { Genero } from '@/lib/platform/ninos/familia'
import { idRapido, type ModoRegistro, type PadreRapido } from '@/lib/platform/ninos/registro-rapido'

import { Eleccion } from './piezas'

const ROLES: readonly { valor: Genero; etiqueta: string }[] = [
  { valor: 'Femenino', etiqueta: 'Mamá' },
  { valor: 'Masculino', etiqueta: 'Papá' },
]

type Props = {
  modo: ModoRegistro
  padre: PadreRapido
  errores: Record<string, string>
  onPadre: (campo: keyof PadreRapido, valor: string) => void
  /** Public page with several campuses and none from the QR. */
  campus?: readonly { id: string; nombre: string }[]
  campusId?: string
  onCampus?: (id: string) => void
  /** Under the phone (desk: the duplicate check notice and its matches). */
  debajoTelefono?: ReactNode
}

export function CamposPadre({ modo, padre, errores, onPadre, campus = [], campusId = '', onCampus, debajoTelefono }: Props) {
  const pub = modo === 'publico'
  const id = idRapido.padre
  return (
    <div className="grid min-w-0 gap-4">
      {pub && campus.length > 1 && (
        <SelectSistema
          id={idRapido.campus}
          label="Campus"
          opciones={[{ valor: '', etiqueta: 'Elige…' }, ...campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
          value={campusId}
          onValueChange={(v) => onCampus?.(v)}
          error={errores[idRapido.campus]}
        />
      )}
      <CamposSistema className="gap-4">
        <InputSistema
          id={id('nombre')}
          label={pub ? 'Tu nombre' : 'Nombre'}
          aria-label={pub ? undefined : 'Nombre del representante'}
          icono={pub ? User : undefined}
          placeholder={pub ? 'Ej.: María' : undefined}
          autoComplete={pub ? 'given-name' : 'off'}
          enterKeyHint="next"
          value={padre.nombre}
          onChange={(e) => onPadre('nombre', e.target.value)}
          error={errores[id('nombre')]}
        />
        <InputSistema
          id={id('apellido')}
          label={pub ? 'Tu apellido' : 'Apellido'}
          aria-label={pub ? undefined : 'Apellido del representante'}
          icono={pub ? Users : undefined}
          placeholder={pub ? 'Ej.: González' : undefined}
          autoComplete={pub ? 'family-name' : 'off'}
          enterKeyHint="next"
          value={padre.apellido}
          onChange={(e) => onPadre('apellido', e.target.value)}
          error={errores[id('apellido')]}
        />
        <div className="grid min-w-0 gap-2">
          <InputSistema
            id={id('telefono')}
            label="Teléfono"
            icono={pub ? Phone : undefined}
            type="tel"
            inputMode="tel"
            autoComplete={pub ? 'tel' : 'off'}
            placeholder="0414 000 0000"
            className="font-mono tabular-nums"
            aria-describedby={errores[id('telefono')] ? undefined : `${id('telefono')}-ayuda`}
            value={padre.telefono}
            onChange={(e) => onPadre('telefono', e.target.value)}
            error={errores[id('telefono')]}
          />
          <p id={`${id('telefono')}-ayuda`} className="text-sm text-muted-foreground">
            {pub ? 'Con este número te encontramos en la mesa.' : 'Si el teléfono o la cédula ya existen, te pediremos confirmar a esa persona.'}
          </p>
        </div>
      </CamposSistema>
      {debajoTelefono}
      <div className="max-w-sm">
        <Eleccion
          id={id('genero')}
          pregunta={pub ? 'Eres' : 'Es'}
          nombre={pub ? 'Eres mamá o papá' : 'Género del representante'}
          opciones={ROLES}
          valor={(padre.genero as Genero) || ''}
          onCambio={(g) => onPadre('genero', g)}
          error={errores[id('genero')]}
        />
      </div>
    </div>
  )
}
