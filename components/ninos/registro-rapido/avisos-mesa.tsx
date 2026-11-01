'use client'

/**
 * Desk notices of the one-screen registration, unchanged in behavior from the
 * former desk form (prototype 04, state B): the phone / cédula match to
 * confirm, the confirmed or known representative, the spouse checkbox and the
 * child already registered in another family.
 */
import { AlertTriangle } from 'lucide-react'

import { BotonSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { avisoHijoCoincidencia, rolDeConyuge, type Conyuge, type HijoCoincidencia, type PadreCoincidencia } from '@/lib/platform/ninos/familia'

const CAJA_AVISO = 'grid min-w-0 gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4'
const FILA = 'grid min-w-0 gap-3 rounded-xl border border-border bg-card p-3 text-foreground'

type CoincidenciasProps = {
  coincidencias: readonly PadreCoincidencia[]
  guardando: boolean
  onConfirmar: (p: PadreCoincidencia) => void
  onDescartar: () => void
}

export function CoincidenciasPadre({ coincidencias, guardando, onConfirmar, onDescartar }: CoincidenciasProps) {
  if (coincidencias.length === 0) return null
  return (
    <div role="alert" className={CAJA_AVISO}>
      <p className="flex items-start gap-2 text-sm font-medium text-warning-text">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        Ya existe una persona con estos datos. ¿Es el representante?
      </p>
      <ul className="grid gap-2">
        {coincidencias.map((c) => (
          <li key={c.id} className={FILA}>
            <p className="text-sm">
              <span className="font-medium">
                {c.nombre} {c.apellido}
              </span>
              {c.telefono && (
                <>
                  {' '}
                  · Tel. <span className="font-mono tabular-nums">{c.telefono}</span>
                </>
              )}
              {c.cedula && (
                <>
                  {' '}
                  · Cédula <span className="font-mono tabular-nums">{c.cedula}</span>
                </>
              )}
            </p>
            <BotonSistema type="button" className="w-full" disabled={guardando} onClick={() => onConfirmar(c)}>
              Sí, es esta persona
            </BotonSistema>
          </li>
        ))}
      </ul>
      <BotonSistema type="button" variante="outline" className="w-full" onClick={onDescartar}>
        No, corregir datos
      </BotonSistema>
    </div>
  )
}

type ConocidoProps = {
  /** Adding children to a parent already open (no change possible). */
  existente?: { nombre: string }
  confirmado?: PadreCoincidencia | null
  onCambiar: () => void
}

/** Replaces the parent fields when the parent is a known person. */
export function RepresentanteConocido({ existente, confirmado, onCambiar }: ConocidoProps) {
  if (existente) {
    return (
      <TextoSistema variante="sutil" tamaño="sm">
        Representante: <span className="font-medium text-foreground">{existente.nombre}</span>
      </TextoSistema>
    )
  }
  if (!confirmado) return null
  return (
    <div className="grid gap-3">
      <TextoSistema variante="sutil" tamaño="sm">
        Persona existente: <span className="font-medium text-foreground">{`${confirmado.nombre} ${confirmado.apellido}`.trim()}</span>
      </TextoSistema>
      <BotonSistema type="button" variante="outline" className="justify-self-start" onClick={onCambiar}>
        Cambiar representante
      </BotonSistema>
    </div>
  )
}

type ConyugeProps = { conyuge: Conyuge; marcado: boolean; onMarcar: (v: boolean) => void }

/** The recorded spouse, offered unchecked: linked only when the anfitrión checks it. */
export function CasillaConyuge({ conyuge, marcado, onMarcar }: ConyugeProps) {
  return (
    <TarjetaSistema className="grid gap-2 p-4 sm:p-5">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium text-foreground">
        <input
          type="checkbox"
          className="size-5 shrink-0 rounded accent-[var(--brand-strong)]"
          checked={marcado}
          onChange={(e) => onMarcar(e.target.checked)}
        />
        ¿Vincular también a {`${conyuge.nombre} ${conyuge.apellido}`.trim()} como {rolDeConyuge(conyuge.genero)}?
      </label>
      <TextoSistema variante="sutil" tamaño="sm">
        Figura como cónyuge del representante. Márcalo solo si también es padre o madre de estos niños.
      </TextoSistema>
    </TarjetaSistema>
  )
}

type RepetidosProps = {
  lista: readonly HijoCoincidencia[]
  guardando: boolean
  onAbrirFamilia?: (padreId: string, consulta: string) => void
  onRegistrarIgual: () => void
  onCorregir: () => void
}

export function HijosRepetidos({ lista, guardando, onAbrirFamilia, onRegistrarIgual, onCorregir }: RepetidosProps) {
  return (
    <div role="alert" className={CAJA_AVISO}>
      <p className="text-sm font-medium text-warning-text">Posible niño duplicado</p>
      <ul className="grid gap-2">
        {lista.map((c) => (
          <li key={`${c.indice}-${c.ninoId}`} className={FILA}>
            <p className="text-sm">{avisoHijoCoincidencia(c)}</p>
            {onAbrirFamilia && (
              <BotonSistema type="button" variante="outline" className="justify-self-start" onClick={() => onAbrirFamilia(c.padreId, `${c.nombre} ${c.apellido}`.trim())}>
                Abrir esa familia
              </BotonSistema>
            )}
          </li>
        ))}
      </ul>
      <TextoSistema variante="sutil" tamaño="sm">
        Si es otro niño con el mismo nombre y fecha, puedes registrarlo igual.
      </TextoSistema>
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotonSistema type="button" className="flex-1" disabled={guardando} onClick={onRegistrarIgual}>
          Registrar de todos modos
        </BotonSistema>
        <BotonSistema type="button" variante="outline" className="flex-1" onClick={onCorregir}>
          Corregir datos
        </BotonSistema>
      </div>
    </div>
  )
}
