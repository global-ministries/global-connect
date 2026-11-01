'use client'

/**
 * "¿Quién los retira?" — the parent always (first, not removable), then the
 * other people with name, phone and relation — and the folded "Para después"
 * (prototypes 01 / 04 `.retiran`, `details.despues`).
 */
import type { ReactNode } from 'react'
import { ChevronDown, Plus, ShieldCheck, X } from 'lucide-react'

import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import type { AutorizadoForm } from '@/lib/platform/ninos/familia'
import { idRapido, type PersonaQueRetira } from '@/lib/platform/ninos/registro-rapido'

type RetiranProps = {
  personas: readonly PersonaQueRetira[]
  autorizados: readonly AutorizadoForm[]
  errores: Record<string, string>
  /** Most people that may be added (the public limit); no limit by default. */
  maximo?: number
  /** Label of the relation field ("¿Qué es de tus niños?" / "Relación"). */
  etiquetaRelacion: string
  onCambiar: (i: number, campo: keyof AutorizadoForm, valor: string) => void
  onAgregar: () => void
  onQuitar: (i: number) => void
}

export function CamposRetiran({ personas, autorizados, errores, maximo, etiquetaRelacion, onCambiar, onAgregar, onQuitar }: RetiranProps) {
  const [padre] = personas
  return (
    <div className="grid min-w-0 gap-3">
      <p className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-border px-3 py-2">
        <ShieldCheck className="size-5 shrink-0 text-success-text" aria-hidden />
        <span className="min-w-0">
          <b className="block truncate font-semibold text-foreground">{padre.nombre}</b>
          <small className="block text-[13px] text-muted-foreground">{padre.detalle}</small>
        </span>
      </p>
      {autorizados.map((a, i) => {
        const n = i + 1
        return (
          <div key={i} className="grid min-w-0 gap-3 rounded-xl border border-border p-3">
            <div className="flex min-h-11 items-center justify-between gap-2">
              <b className="min-w-0 truncate text-sm font-semibold text-foreground">{a.nombre.trim() || `Persona ${n}`}</b>
              <BotonSistema type="button" variante="ghost" icono={X} aria-label={`Quitar persona ${n}`} onClick={() => onQuitar(i)}>
                Quitar
              </BotonSistema>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <InputSistema
                id={idRapido.autorizado(i)}
                label="Nombre"
                aria-label={`Nombre del autorizado ${n}`}
                value={a.nombre}
                onChange={(e) => onCambiar(i, 'nombre', e.target.value)}
                error={errores[idRapido.autorizado(i)]}
              />
              <InputSistema
                label="Teléfono (opcional)"
                aria-label={`Teléfono del autorizado ${n}`}
                type="tel"
                inputMode="tel"
                className="font-mono tabular-nums"
                value={a.telefono}
                onChange={(e) => onCambiar(i, 'telefono', e.target.value)}
              />
              <InputSistema
                label={etiquetaRelacion}
                aria-label={`Relación del autorizado ${n}`}
                placeholder="Ej.: abuela, tío"
                value={a.relacion}
                onChange={(e) => onCambiar(i, 'relacion', e.target.value)}
              />
            </div>
          </div>
        )
      })}
      {maximo !== undefined && autorizados.length >= maximo ? (
        <p className="text-sm text-muted-foreground">
          Máximo <span className="font-mono tabular-nums">{maximo}</span> personas.
        </p>
      ) : (
        <BotonSistema type="button" variante="outline" icono={Plus} className="w-full sm:w-auto sm:justify-self-start" onClick={onAgregar}>
          {autorizados.length === 0 ? 'Agregar a alguien más' : 'Agregar persona'}
        </BotonSistema>
      )}
    </div>
  )
}

type DespuesProps = {
  abierto: boolean
  onAbierto: (v: boolean) => void
  /** What is inside, in one line ("Correo para tu cuenta, cédula, fotos"). */
  contenido: string
  children: ReactNode
}

/** The optional fields, folded by default; it opens by itself when one of them has an error. */
export function ParaDespues({ abierto, onAbierto, contenido, children }: DespuesProps) {
  return (
    <details
      open={abierto}
      onToggle={(e) => onAbierto((e.currentTarget as HTMLDetailsElement).open)}
      className="group min-w-0 rounded-2xl border border-border bg-card"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 focus-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <b className="block font-semibold text-foreground">
            Para después <span className="font-normal text-muted-foreground">(opcional)</span>
          </b>
          <small className="block truncate text-[13px] text-muted-foreground">{contenido}</small>
        </span>
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="grid min-w-0 gap-4 px-4 pb-4">{children}</div>
    </details>
  )
}
