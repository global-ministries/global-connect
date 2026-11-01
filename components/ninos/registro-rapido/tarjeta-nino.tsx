'use client'

/**
 * One child of the one-screen registration (prototype 01 `.nino`, 04
 * `.fila-nino`): name, surname, birth date, Niño / Niña, the salón shown live
 * from the age, the under-13 rule (S6) and allergies / medical condition
 * inline. Health answers are explicit on the public page; at the desk they may
 * stay unanswered (as the former desk form).
 */
import { AlertTriangle, X } from 'lucide-react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { estadoCupo, type OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import { enRangoNinos, fechaPasadaValida, type Genero } from '@/lib/platform/ninos/familia'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import { avisoFueraDeRango, idRapido, salonVivo, type HijoRapido, type ModoRegistro } from '@/lib/platform/ninos/registro-rapido'

import { Eleccion, SI_NO, siNoValor } from './piezas'

const GENEROS_HIJO: readonly { valor: Genero; etiqueta: string }[] = [
  { valor: 'Masculino', etiqueta: 'Niño' },
  { valor: 'Femenino', etiqueta: 'Niña' },
]

const TONO_CUPO = { libre: 'success', casi: 'warning', lleno: 'danger' } as const

type Props = {
  indice: number
  hijo: HijoRapido
  modo: ModoRegistro
  hoy: string
  errores: Record<string, string>
  salones: readonly SalonNivel[]
  /** Desk: today's occupancy by salón id. */
  ocupacion?: ReadonlyMap<string, OcupacionSalon>
  puedeQuitar: boolean
  onCambiar: (cambios: Partial<HijoRapido>) => void
  onFecha: (fecha: string) => void
  onQuitar: () => void
}

function SalonEnVivo({ hijo, modo, hoy, salones, ocupacion }: Pick<Props, 'hijo' | 'modo' | 'hoy' | 'salones' | 'ocupacion'>) {
  if (!fechaPasadaValida(hijo.fechaNacimiento, hoy) || !enRangoNinos(hijo.fechaNacimiento, hoy)) return null
  const salon = salonVivo(hijo, salones, hoy)
  if (!salon) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <PuntoEstado tono={modo === 'publico' ? 'info' : 'warning'} />
        {modo === 'publico' ? 'El salón lo asignamos en la mesa.' : 'Sin salón sugerido: elige el nivel en «Para después».'}
      </p>
    )
  }
  const o = ocupacion?.get(salon.id)
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <PuntoEstado tono={o ? TONO_CUPO[estadoCupo(o.presentes, o.capacidad)] : 'info'} />
      <span>
        Va a <b className="font-semibold text-foreground">{salon.nombre}</b>
      </span>
      {o && (
        <span className="font-mono tabular-nums">
          {o.presentes}/{o.capacidad}
        </span>
      )}
    </p>
  )
}

export function TarjetaNino({ indice, hijo, modo, hoy, errores, salones, ocupacion, puedeQuitar, onCambiar, onFecha, onQuitar }: Props) {
  const n = indice + 1
  const id = (c: Parameters<typeof idRapido.hijo>[1]) => idRapido.hijo(indice, c)
  const nombre = hijo.nombre.trim()
  const quien = nombre || `Niño ${n}`
  const completo = `${hijo.nombre} ${hijo.apellido}`.trim()
  const fueraDeRango = fechaPasadaValida(hijo.fechaNacimiento, hoy) && !enRangoNinos(hijo.fechaNacimiento, hoy)
  const idAviso = `${id('nacimiento')}-rango`

  return (
    <div data-testid={`nino-${n}`} className="grid min-w-0 gap-4 rounded-xl border border-border p-3 sm:p-4">
      <div className="flex min-h-11 min-w-0 items-center gap-3">
        <span className="min-w-0 flex-1">
          <b className="block truncate font-semibold text-foreground">{completo || `Niño ${n}`}</b>
        </span>
        {puedeQuitar && (
          <BotonSistema type="button" variante="ghost" icono={X} aria-label={nombre ? `Quitar a ${completo}` : `Quitar niño ${n}`} onClick={onQuitar}>
            Quitar
          </BotonSistema>
        )}
      </div>
      <div className="grid min-w-0 gap-4 @container">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <InputSistema
            id={id('nombre')}
            label="Nombre"
            aria-label={`Nombre del niño ${n}`}
            autoComplete="off"
            enterKeyHint="next"
            value={hijo.nombre}
            onChange={(e) => onCambiar({ nombre: e.target.value })}
            error={errores[id('nombre')]}
          />
          <InputSistema
            id={id('apellido')}
            label="Apellido"
            aria-label={`Apellido del niño ${n}`}
            autoComplete="off"
            enterKeyHint="next"
            value={hijo.apellido}
            onChange={(e) => onCambiar({ apellido: e.target.value })}
            error={errores[id('apellido')]}
          />
          <div className="grid min-w-0 gap-2">
            <InputSistema
              id={id('nacimiento')}
              label="Fecha de nacimiento"
              aria-label={`Fecha de nacimiento del niño ${n}`}
              type="date"
              max={hoy}
              // iOS Safari gives native date inputs an intrinsic width that ignores w-full.
              className="min-w-0 appearance-none font-mono tabular-nums [&::-webkit-date-and-time-value]:text-left"
              aria-describedby={fueraDeRango ? idAviso : undefined}
              value={hijo.fechaNacimiento}
              onChange={(e) => onFecha(e.target.value)}
              error={fueraDeRango ? undefined : errores[id('nacimiento')]}
            />
            {fueraDeRango && (
              <p id={idAviso} role="alert" className="flex items-start gap-2 text-sm text-warning-text">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {avisoFueraDeRango(nombre, hijo.fechaNacimiento, hoy)}
              </p>
            )}
          </div>
          <Eleccion
            id={id('genero')}
            pregunta="Es"
            nombre={`Género del niño ${n}`}
            opciones={GENEROS_HIJO}
            valor={(hijo.genero as Genero) || ''}
            onCambio={(genero) => onCambiar({ genero })}
            error={errores[id('genero')]}
          />
        </div>
        <SalonEnVivo hijo={hijo} modo={modo} hoy={hoy} salones={salones} ocupacion={ocupacion} />
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Eleccion
            id={id('tiene-alergias')}
            pregunta={modo === 'publico' ? `¿${quien} tiene alergias?` : 'Alergias'}
            nombre={`¿${quien} tiene alergias?`}
            opciones={SI_NO}
            valor={siNoValor(hijo.tieneAlergias)}
            onCambio={(v) => onCambiar({ tieneAlergias: v === 'si' })}
            error={errores[id('tiene-alergias')]}
          />
          {hijo.tieneAlergias && (
            <InputSistema
              id={id('alergias')}
              label="¿A qué?"
              aria-label={`Alergias de ${quien}`}
              placeholder="Ej.: maní, leche"
              value={hijo.alergias}
              onChange={(e) => onCambiar({ alergias: e.target.value })}
              error={errores[id('alergias')]}
            />
          )}
          <Eleccion
            id={id('tiene-nee')}
            pregunta={modo === 'publico' ? '¿Alguna condición médica o necesidad especial?' : 'Condición médica'}
            nombre={`¿${quien} tiene alguna condición médica o necesidad especial?`}
            opciones={SI_NO}
            valor={siNoValor(hijo.tieneNecesidades)}
            onCambio={(v) => onCambiar({ tieneNecesidades: v === 'si' })}
            error={errores[id('tiene-nee')]}
          />
          {hijo.tieneNecesidades && (
            <InputSistema
              id={id('nee')}
              label="¿Cuál?"
              aria-label={`Necesidades especiales de ${quien}`}
              placeholder="Lo que debemos saber para cuidarlo bien"
              value={hijo.necesidadesEspeciales}
              onChange={(e) => onCambiar({ necesidadesEspeciales: e.target.value })}
              error={errores[id('nee')]}
            />
          )}
        </div>
      </div>
    </div>
  )
}
