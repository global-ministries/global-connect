'use client'

/**
 * Niños › Eventos — the horarios of an event (artboard `#th`). The name and
 * hour come from the Dream Team turno (S8.2) and read as text; Niños only sets
 * the check-in window: "Abre … min antes" and "Cierra el retiro … min
 * después", inline fields that save on Enter or on leaving them, restore on
 * Escape and keep the focus on an invalid value (docs/design-system/
 * patterns.md, "Inline edit and autosave"). From md the rows line up as a
 * table; on phones each horario is a block with visible labels.
 */
import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { Plus, X } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import {
  fechaCorta,
  horaCorta,
  textoVentana,
  validarVentana,
  type HorarioEvento,
} from '@/lib/platform/ninos/eventos'
import { cn } from '@/lib/utils'

const COLUMNAS = 'md:grid md:grid-cols-[minmax(0,1.3fr)_72px_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.5fr)_44px] md:items-center md:gap-2'

const CAMPO =
  'h-8 w-16 rounded-md border border-transparent bg-transparent px-2 text-right font-mono text-[13px] tabular-nums tracking-[-0.02em] text-foreground transition-colors hover:border-border focus:border-brand focus:bg-background focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20 pointer-coarse:h-11'

function CampoMinutos({
  id,
  etiqueta,
  valor,
  onGuardar,
  onInvalido,
}: {
  readonly id: string
  readonly etiqueta: string
  readonly valor: number
  readonly onGuardar: (minutos: number) => Promise<boolean>
  readonly onInvalido: (mensaje: string) => void
}): ReactElement {
  const [texto, setTexto] = useState(String(valor))
  const [invalido, setInvalido] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const confirmar = async () => {
    const limpio = texto.trim()
    if (limpio === String(valor)) {
      setInvalido(false)
      return
    }
    const minutos = /^\d+$/.test(limpio) ? Number(limpio) : Number.NaN
    const mensaje = validarVentana(minutos, 0)
    if (mensaje) {
      setInvalido(true)
      onInvalido(mensaje)
      // Keep the focus on the value to fix.
      setTimeout(() => ref.current?.focus())
      return
    }
    setInvalido(false)
    const ok = await onGuardar(minutos)
    if (!ok) setInvalido(true)
  }

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setTexto(String(valor))
      setInvalido(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        aria-label={etiqueta}
        aria-invalid={invalido || undefined}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => void confirmar()}
        onKeyDown={teclas}
        className={CAMPO}
      />
      <span className="text-xs text-muted-foreground">min</span>
    </span>
  )
}

function Fechas({ fechas }: { readonly fechas: readonly string[] }): ReactElement | null {
  if (fechas.length === 0) return null
  const texto = fechas.length <= 3 ? fechas.map((f) => fechaCorta(f)).join(', ') : `${fechas.length} fechas: ${fechaCorta(fechas[0])} a ${fechaCorta(fechas[fechas.length - 1])}`
  return <span className="block truncate text-xs text-muted-foreground">{texto}</span>
}

function FilaHorario({
  horario,
  editable,
  onVentana,
  onInvalido,
  onQuitar,
}: {
  readonly horario: HorarioEvento
  readonly editable: boolean
  readonly onVentana: (horario: HorarioEvento, abre: number, cierra: number) => Promise<boolean>
  readonly onInvalido: (mensaje: string) => void
  readonly onQuitar: (horario: HorarioEvento) => void
}): ReactElement {
  // The last saved window: the second field saves with the first one's new value
  // before the server data comes back. The row is keyed by the server's window.
  const [ventana, setVentana] = useState({ abre: horario.abreMinAntes, cierra: horario.cierraMinDespues })
  const guardar = async (abre: number, cierra: number) => {
    const ok = await onVentana(horario, abre, cierra)
    if (ok) setVentana({ abre, cierra })
    return ok
  }
  const etiquetaAbre = `Minutos antes de las ${horaCorta(horario.hora)} que abre el check-in, ${horario.nombre}`
  const etiquetaCierra = `Minutos después de las ${horaCorta(horario.hora)} que cierra el retiro, ${horario.nombre}`
  return (
    <li
      data-testid={`horario-${horario.id}`}
      className={cn('grid gap-2 border-b border-border/60 px-3 py-2.5 last:border-b-0 focus-within:bg-brand-tint md:min-h-9 md:py-1', COLUMNAS)}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-foreground">{horario.nombre}</span>
        <Fechas fechas={horario.fechas} />
        {!horario.turnoActivo && <span className="block text-xs text-warning-text">El turno está desactivado en Dream Team</span>}
      </span>
      <span className="text-[13px]">
        <span className="text-muted-foreground md:sr-only">Hora del servicio: </span>
        <span className="font-mono tabular-nums">{horaCorta(horario.hora)}</span>
      </span>
      <span className="flex items-center justify-between gap-2 md:block">
        <span className="text-[13px] text-muted-foreground md:sr-only">Abre el check-in, minutos antes</span>
        {editable ? (
          <CampoMinutos
            id={`abre-${horario.id}`}
            etiqueta={etiquetaAbre}
            valor={ventana.abre}
            onInvalido={onInvalido}
            onGuardar={(abre) => guardar(abre, ventana.cierra)}
          />
        ) : (
          <span className="font-mono text-[13px] tabular-nums">{horario.abreMinAntes} min</span>
        )}
      </span>
      <span className="flex items-center justify-between gap-2 md:block">
        <span className="text-[13px] text-muted-foreground md:sr-only">Cierra el retiro, minutos después</span>
        {editable ? (
          <CampoMinutos
            id={`cierra-${horario.id}`}
            etiqueta={etiquetaCierra}
            valor={ventana.cierra}
            onInvalido={onInvalido}
            onGuardar={(cierra) => guardar(ventana.abre, cierra)}
          />
        ) : (
          <span className="font-mono text-[13px] tabular-nums">{horario.cierraMinDespues} min</span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {textoVentana({ hora: horario.hora, abreMinAntes: ventana.abre, cierraMinDespues: ventana.cierra })}
      </span>
      <span className="flex justify-end">
        {editable && (
          <BotonSistema
            type="button"
            variante="ghost"
            tamaño="sm"
            soloIcono
            icono={X}
            aria-label={`Quitar ${horario.nombre}`}
            onClick={() => onQuitar(horario)}
          />
        )}
      </span>
    </li>
  )
}

export function TablaHorarios({
  horarios,
  editable,
  puedeAgregar,
  onVentana,
  onInvalido,
  onQuitar,
  onAgregar,
}: {
  readonly horarios: readonly HorarioEvento[]
  readonly editable: boolean
  readonly puedeAgregar: boolean
  readonly onVentana: (horario: HorarioEvento, abre: number, cierra: number) => Promise<boolean>
  readonly onInvalido: (mensaje: string) => void
  readonly onQuitar: (horario: HorarioEvento) => void
  readonly onAgregar: () => void
}): ReactElement {
  return (
    <>
      {horarios.length > 0 ? (
        <>
          <div aria-hidden="true" className={cn('hidden h-8 border-b border-border bg-muted px-3 text-xs font-medium text-muted-foreground', COLUMNAS)}>
            <span>Horario</span>
            <span>Hora</span>
            <span>Abre el check-in</span>
            <span>Cierra el retiro</span>
            <span>Resumen</span>
            <span />
          </div>
          <ul aria-label="Horarios del evento">
            {horarios.map((h) => (
              <FilaHorario key={`${h.id}-${h.abreMinAntes}-${h.cierraMinDespues}`} horario={h} editable={editable} onVentana={onVentana} onInvalido={onInvalido} onQuitar={onQuitar} />
            ))}
          </ul>
        </>
      ) : (
        <div className="px-3 py-5 text-center">
          <p className="text-sm font-semibold text-foreground">Este evento no tiene horarios</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {puedeAgregar ? 'Agrega uno para que abra el check-in.' : 'Sin horarios no abre el check-in.'}
          </p>
        </div>
      )}
      {puedeAgregar && (
        <button
          type="button"
          onClick={onAgregar}
          aria-haspopup="dialog"
          className="focus-ring flex h-9 w-full items-center gap-2 border-t border-dashed border-border px-3 text-left text-xs font-medium text-brand-text transition-colors hover:bg-brand-tint pointer-coarse:h-11"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Horario
        </button>
      )}
    </>
  )
}
