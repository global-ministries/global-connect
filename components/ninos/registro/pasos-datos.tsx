'use client'

/** Steps 1 (parent) and 2 (children) of the public registration wizard. */
import { Phone, Plus, User, X } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { LIMITES_PREREGISTRO } from '@/lib/platform/ninos/preregistro'

import { idCampo, type Errores, type HijoRegistro, type PadreRegistro } from './logica'
import { Bloque, OpcionesGrandes } from './piezas'

type Campus = { id: string; nombre: string }

type PasoPadreProps = {
  padre: PadreRegistro
  campus: readonly Campus[]
  campusId: string
  errores: Errores
  onPadre: (campo: keyof PadreRegistro, valor: string) => void
  onCampus: (id: string) => void
}

export function PasoPadre({ padre, campus, campusId, errores, onPadre, onCampus }: PasoPadreProps) {
  const id = idCampo.padre
  return (
    <div className="space-y-5">
      {campus.length > 1 && (
        <SelectSistema
          id={idCampo.campus}
          label="Campus"
          opciones={[{ valor: '', etiqueta: 'Elige…' }, ...campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
          value={campusId}
          onValueChange={onCampus}
          error={errores[idCampo.campus]}
        />
      )}
      <InputSistema
        id={id('nombre')}
        label="Tu nombre"
        icono={User}
        autoComplete="given-name"
        enterKeyHint="next"
        value={padre.nombre}
        onChange={(e) => onPadre('nombre', e.target.value)}
        error={errores[id('nombre')]}
      />
      <InputSistema
        id={id('apellido')}
        label="Tu apellido"
        icono={User}
        autoComplete="family-name"
        enterKeyHint="next"
        value={padre.apellido}
        onChange={(e) => onPadre('apellido', e.target.value)}
        error={errores[id('apellido')]}
      />
      <InputSistema
        id={id('telefono')}
        label="Teléfono"
        icono={Phone}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0414 000 0000"
        value={padre.telefono}
        onChange={(e) => onPadre('telefono', e.target.value)}
        error={errores[id('telefono')]}
      />
      <div className="rounded-xl bg-muted/40 p-3">
        <InputSistema
          id={id('cedula')}
          label="Cédula (opcional)"
          inputMode="numeric"
          className="bg-card"
          value={padre.cedula}
          onChange={(e) => onPadre('cedula', e.target.value)}
        />
        <p className="mt-2 text-xs text-muted-foreground">Nos ayuda a encontrarte más rápido la próxima vez.</p>
      </div>
    </div>
  )
}

const GENEROS_HIJO = [
  { valor: 'Masculino', etiqueta: 'Niño' },
  { valor: 'Femenino', etiqueta: 'Niña' },
] as const

type PasoHijosProps = {
  hijos: readonly HijoRegistro[]
  hoy: string
  errores: Errores
  onHijo: (i: number, cambios: Partial<HijoRegistro>) => void
  onAgregar: () => void
  onQuitar: (i: number) => void
}

export function PasoHijos({ hijos, hoy, errores, onHijo, onAgregar, onQuitar }: PasoHijosProps) {
  return (
    <div className="space-y-4">
      {hijos.map((h, i) => {
        const n = i + 1
        const id = (campo: Parameters<typeof idCampo.hijo>[1]) => idCampo.hijo(i, campo)
        return (
          <Bloque
            key={i}
            titulo={hijos.length > 1 ? `Niño ${n}` : 'Tu niño'}
            accion={
              hijos.length > 1 && (
                <BotonSistema type="button" variante="ghost" tamaño="sm" icono={X} aria-label={`Quitar niño ${n}`} onClick={() => onQuitar(i)}>
                  Quitar
                </BotonSistema>
              )
            }
          >
            <InputSistema
              id={id('nombre')}
              label="Nombre"
              aria-label={`Nombre del niño ${n}`}
              enterKeyHint="next"
              value={h.nombre}
              onChange={(e) => onHijo(i, { nombre: e.target.value })}
              error={errores[id('nombre')]}
            />
            <InputSistema
              id={id('apellido')}
              label="Apellido"
              aria-label={`Apellido del niño ${n}`}
              enterKeyHint="next"
              value={h.apellido}
              onChange={(e) => onHijo(i, { apellido: e.target.value })}
              error={errores[id('apellido')]}
            />
            <InputSistema
              id={id('nacimiento')}
              label="Fecha de nacimiento"
              aria-label={`Fecha de nacimiento del niño ${n}`}
              type="date"
              max={hoy}
              value={h.fechaNacimiento}
              onChange={(e) => onHijo(i, { fechaNacimiento: e.target.value })}
              error={errores[id('nacimiento')]}
            />
            <OpcionesGrandes
              id={id('genero')}
              pregunta="¿Es niño o niña?"
              nombreAccesible={`Género del niño ${n}`}
              opciones={GENEROS_HIJO}
              valor={h.genero === '' ? null : (h.genero as (typeof GENEROS_HIJO)[number]['valor'])}
              onChange={(genero) => onHijo(i, { genero })}
              error={errores[id('genero')]}
            />
          </Bloque>
        )
      })}
      {hijos.length < LIMITES_PREREGISTRO.hijos && (
        <BotonSistema type="button" variante="outline" icono={Plus} className="w-full" onClick={onAgregar}>
          Agregar otro niño
        </BotonSistema>
      )}
    </div>
  )
}
