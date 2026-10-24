'use client'

/** Steps 3 (health), 4 (pickup people) and 5 (account) of the public registration wizard. */
import { Mail, Plus, X } from 'lucide-react'

import { BotonSistema, InputSistema, TextareaSistema } from '@/components/ui/sistema-diseno'
import type { AutorizadoForm } from '@/lib/platform/ninos/familia'
import { LIMITES_PREREGISTRO } from '@/lib/platform/ninos/preregistro'

import { idCampo, type Errores, type HijoRegistro } from './logica'
import { Bloque, OpcionesGrandes, SI_NO } from './piezas'

type PasoSaludProps = {
  hijos: readonly HijoRegistro[]
  errores: Errores
  onHijo: (i: number, cambios: Partial<HijoRegistro>) => void
}

export function PasoSalud({ hijos, errores, onHijo }: PasoSaludProps) {
  return (
    <div className="space-y-4">
      {hijos.map((h, i) => {
        const id = (campo: Parameters<typeof idCampo.hijo>[1]) => idCampo.hijo(i, campo)
        const nombre = h.nombre.trim()
        return (
          <Bloque key={i} titulo={nombre}>
            <OpcionesGrandes
              id={id('tiene-alergias')}
              pregunta={`¿${nombre} tiene alergias?`}
              opciones={SI_NO}
              valor={h.tieneAlergias}
              onChange={(tieneAlergias) => onHijo(i, { tieneAlergias })}
              error={errores[id('tiene-alergias')]}
            />
            {h.tieneAlergias && (
              <TextareaSistema
                id={id('alergias')}
                label={`Alergias de ${nombre}`}
                placeholder="Ej.: maní, leche, picadas de abeja"
                filas={2}
                value={h.alergias}
                onChange={(e) => onHijo(i, { alergias: e.target.value })}
                error={errores[id('alergias')]}
              />
            )}
            <OpcionesGrandes
              id={id('tiene-nee')}
              pregunta={`¿${nombre} tiene alguna necesidad especial?`}
              opciones={SI_NO}
              valor={h.tieneNecesidades}
              onChange={(tieneNecesidades) => onHijo(i, { tieneNecesidades })}
              error={errores[id('tiene-nee')]}
            />
            {h.tieneNecesidades && (
              <TextareaSistema
                id={id('nee')}
                label={`Necesidades especiales de ${nombre}`}
                placeholder="Cuéntanos lo que debemos saber para cuidarlo bien"
                filas={2}
                value={h.necesidadesEspeciales}
                onChange={(e) => onHijo(i, { necesidadesEspeciales: e.target.value })}
                error={errores[id('nee')]}
              />
            )}
          </Bloque>
        )
      })}
    </div>
  )
}

type PasoAutorizadosProps = {
  autorizados: readonly AutorizadoForm[]
  errores: Errores
  onCambiar: (i: number, campo: keyof AutorizadoForm, valor: string) => void
  onAgregar: () => void
  onQuitar: (i: number) => void
}

/** Same fields and accessible names as CamposAutorizados, with visible labels and inline errors. */
export function PasoAutorizados({ autorizados, errores, onCambiar, onAgregar, onQuitar }: PasoAutorizadosProps) {
  return (
    <div className="space-y-4">
      {autorizados.map((a, i) => {
        const n = i + 1
        return (
          <Bloque
            key={i}
            titulo={`Persona ${n}`}
            accion={
              <BotonSistema type="button" variante="ghost" tamaño="sm" icono={X} aria-label={`Quitar persona ${n}`} onClick={() => onQuitar(i)}>
                Quitar
              </BotonSistema>
            }
          >
            <InputSistema
              id={idCampo.autorizado(i)}
              label="Nombre"
              aria-label={`Nombre del autorizado ${n}`}
              value={a.nombre}
              onChange={(e) => onCambiar(i, 'nombre', e.target.value)}
              error={errores[idCampo.autorizado(i)]}
            />
            <InputSistema
              id={`reg-autorizado-${n}-telefono`}
              label="Teléfono (opcional)"
              aria-label={`Teléfono del autorizado ${n}`}
              type="tel"
              inputMode="tel"
              value={a.telefono}
              onChange={(e) => onCambiar(i, 'telefono', e.target.value)}
            />
            <InputSistema
              id={`reg-autorizado-${n}-relacion`}
              label="¿Qué es de tus niños? (opcional)"
              aria-label={`Relación del autorizado ${n}`}
              placeholder="Ej.: abuela, tío"
              value={a.relacion}
              onChange={(e) => onCambiar(i, 'relacion', e.target.value)}
            />
          </Bloque>
        )
      })}
      {autorizados.length < LIMITES_PREREGISTRO.autorizados && (
        <BotonSistema type="button" variante="outline" icono={Plus} className="w-full" onClick={onAgregar}>
          Agregar persona
        </BotonSistema>
      )}
    </div>
  )
}

type PasoCuentaProps = { email: string; error?: string; onEmail: (v: string) => void }

export function PasoCuenta({ email, error, onEmail }: PasoCuentaProps) {
  return (
    <div className="space-y-5">
      <ul className="space-y-2 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 text-sm text-foreground">
        <li>Cuando confirmemos tus datos en la mesa, te enviaremos un enlace para crear tu cuenta.</li>
        <li>Con tu cuenta, el próximo domingo será más rápido.</li>
        <li>Te avisaremos cuando tus niños entren y salgan del salón.</li>
      </ul>
      <InputSistema
        id={idCampo.padre('email')}
        label="Tu correo (opcional)"
        icono={Mail}
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => onEmail(e.target.value)}
        error={error}
      />
    </div>
  )
}
