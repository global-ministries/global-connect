'use client'

/**
 * Small parts of the reservation flow (design/talleres-reserva/03–06): the
 * edición context row, the six-digit code field with its resend timer, the
 * ficha fields, the honeypot and the inset step list. Tokens only.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'

import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { InputSistema } from '@/components/ui/sistema-diseno'
import {
  CAMPO_TRAMPA,
  fechaCorta,
  tituloEdicion,
  type CampoFicha,
  type EdicionPublica,
  type FichaNueva,
  type Genero,
} from '@/lib/platform/talleres/reserva-publica'
import { cn } from '@/lib/utils'

/** Taller + chosen horario, with "Cambiar" (design 03 `.ctx`). */
export function ContextoEdicion({ taller, edicion, onCambiar }: { taller: string; edicion: EdicionPublica; onCambiar?: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-muted p-3">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-text">
        <CalendarDays className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px] font-semibold text-foreground">{taller}</b>
        <span className="block truncate text-[13px] text-muted-foreground">
          {tituloEdicion(edicion)} · inicia {fechaCorta(edicion.fechaInicio)}
          {edicion.lugar ? ` · ${edicion.lugar}` : ''}
        </span>
      </span>
      {onCambiar && (
        <button type="button" onClick={onCambiar} className="focus-ring inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 text-[15px] font-medium text-brand-text">
          Cambiar
        </button>
      )}
    </div>
  )
}

/** Seconds left until `desde` (epoch ms), ticking every second. */
function useSegundosHasta(desde: number | null): number {
  const calcular = () => (desde === null ? 0 : Math.max(0, Math.ceil((desde - Date.now()) / 1000)))
  const [segundos, setSegundos] = useState(calcular)
  useEffect(() => {
    setSegundos(calcular())
    if (desde === null) return
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((desde - Date.now()) / 1000))
      setSegundos(s)
      if (s === 0) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- calcular reads only `desde`
  }, [desde])
  return segundos
}

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * One 6-digit input (autocomplete one-time-code, numeric keyboard) and the
 * resend line: "¿No llegó? Mira en spam. Reenviar en 0:45".
 */
export function CampoCodigo({
  id,
  etiqueta,
  valor,
  onCambio,
  reenviarDesde,
  onReenviar,
  onEnter,
  deshabilitado,
}: {
  id: string
  etiqueta: string
  valor: string
  onCambio: (v: string) => void
  reenviarDesde: number | null
  onReenviar: () => void
  /** Enter inside a bigger form (the partner's code) runs this instead of submitting. */
  onEnter?: () => void
  deshabilitado?: boolean
}) {
  const segundos = useSegundosHasta(reenviarDesde)
  return (
    <div className="grid gap-2">
      <InputSistema
        id={id}
        label={etiqueta}
        value={valor}
        onChange={(e) => onCambio(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => {
          if (onEnter && e.key === 'Enter') {
            e.preventDefault()
            onEnter()
          }
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        placeholder="000000"
        disabled={deshabilitado}
        className="h-14 text-center font-mono text-2xl tracking-[0.5em] tabular-nums"
      />
      <p className="flex flex-wrap items-center gap-x-1 text-[13px] text-muted-foreground">
        ¿No llegó? Mira en spam.
        {segundos > 0 ? (
          <span>
            Puedes pedir otro en <span className="font-mono tabular-nums">{reloj(segundos)}</span>.
          </span>
        ) : (
          <button type="button" onClick={onReenviar} disabled={deshabilitado} className="focus-ring inline-flex min-h-11 items-center rounded-xl px-1 font-medium text-brand-text">
            Reenviar código
          </button>
        )}
      </p>
    </div>
  )
}

/** Cédula with the V / E switch (design 03). */
export function CampoCedula({
  id,
  etiqueta,
  tipo,
  onTipo,
  valor,
  onCambio,
  error,
  onEnter,
}: {
  id: string
  etiqueta: string
  tipo: 'V' | 'E'
  onTipo: (t: 'V' | 'E') => void
  valor: string
  onCambio: (v: string) => void
  error?: string | null
  onEnter?: () => void
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {etiqueta}
      </label>
      <div className="flex min-w-0 gap-2">
        <ControlSegmentado<'V' | 'E'>
          etiqueta={`Tipo de ${etiqueta.toLowerCase()}`}
          opciones={[
            { valor: 'V', etiqueta: 'V' },
            { valor: 'E', etiqueta: 'E' },
          ]}
          valor={tipo}
          onCambio={onTipo}
          className="shrink-0 [&>button]:min-h-[2.375rem] [&>button]:w-10"
        />
        <div className="min-w-0 flex-1">
          <InputSistema
            id={id}
            value={valor}
            onChange={(e) => onCambio(e.target.value.replace(/[^\d.\s-]/g, '').slice(0, 14))}
            onKeyDown={(e) => {
              if (onEnter && e.key === 'Enter') {
                e.preventDefault()
                onEnter()
              }
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="15598745"
            error={error ?? undefined}
            className="font-mono tabular-nums"
          />
        </div>
      </div>
    </div>
  )
}

const OPCIONES_GENERO: readonly { valor: Genero; etiqueta: string }[] = [
  { valor: 'Femenino', etiqueta: 'Mujer' },
  { valor: 'Masculino', etiqueta: 'Hombre' },
]

/**
 * The fields of a new ficha (design 04). `prefijo` keeps ids unique when
 * the partner's ficha is on the same screen; `conContacto` = email and phone
 * required (the principal) or optional (a new partner).
 */
export function CamposFicha({
  prefijo,
  ficha,
  errores,
  onCambio,
  conContacto,
  notaGenero,
  cedulaFija,
  onCambiarCedula,
}: {
  prefijo: string
  ficha: FichaNueva
  errores: Partial<Record<CampoFicha, string>>
  onCambio: (campo: CampoFicha, valor: string) => void
  conContacto: boolean
  notaGenero?: string | null
  cedulaFija: string
  onCambiarCedula?: () => void
}) {
  const id = (c: string) => `${prefijo}-${c}`
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <InputSistema id={id('nombre')} label="Nombre" value={ficha.nombre} onChange={(e) => onCambio('nombre', e.target.value)} autoComplete={conContacto ? 'given-name' : 'off'} maxLength={80} error={errores.nombre} />
        <InputSistema id={id('apellido')} label="Apellido" value={ficha.apellido} onChange={(e) => onCambio('apellido', e.target.value)} autoComplete={conContacto ? 'family-name' : 'off'} maxLength={80} error={errores.apellido} />
      </div>
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-muted-foreground">Cédula</span>
          <b className="block truncate font-mono text-[15px] font-semibold tabular-nums text-foreground">{cedulaFija}</b>
        </span>
        {onCambiarCedula && (
          <button type="button" onClick={onCambiarCedula} className="focus-ring inline-flex min-h-11 items-center rounded-xl px-2 text-[15px] font-medium text-brand-text">
            Cambiar
          </button>
        )}
      </div>
      {errores.cedula && (
        <p role="alert" className="text-sm text-danger-text">
          {errores.cedula}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <InputSistema
          id={id('fecha')}
          label="Fecha de nacimiento"
          type="date"
          value={ficha.fecha_nacimiento}
          onChange={(e) => onCambio('fecha_nacimiento', e.target.value)}
          autoComplete={conContacto ? 'bday' : 'off'}
          error={errores.fecha_nacimiento}
        />
        <div className="grid content-start gap-2">
          <span id={id('genero-etiqueta')} className="text-sm font-medium text-foreground">
            Sexo
          </span>
          <ControlSegmentado<Genero | ''>
            etiqueta="Sexo"
            opciones={OPCIONES_GENERO}
            valor={ficha.genero as Genero | ''}
            onCambio={(v) => onCambio('genero', v)}
            className="flex w-full [&>button]:min-h-[2.375rem] [&>button]:flex-1"
          />
          {notaGenero && !errores.genero && <p className="text-[13px] text-muted-foreground">{notaGenero}</p>}
          {errores.genero && (
            <p role="alert" className="text-sm text-danger-text">
              {errores.genero}
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1">
          <InputSistema
            id={id('telefono')}
            label={conContacto ? 'Teléfono con WhatsApp' : 'Teléfono con WhatsApp (opcional)'}
            type="tel"
            inputMode="tel"
            value={ficha.telefono}
            onChange={(e) => onCambio('telefono', e.target.value)}
            autoComplete={conContacto ? 'tel' : 'off'}
            placeholder="0414 123 4567"
            maxLength={20}
            error={errores.telefono}
          />
          {conContacto && !errores.telefono && <p className="text-[13px] text-muted-foreground">La coordinación te escribe por aquí si necesita contactarte.</p>}
        </div>
        <div className="grid content-start gap-1">
          <InputSistema
            id={id('email')}
            label={conContacto ? 'Correo' : 'Correo (opcional)'}
            type="email"
            inputMode="email"
            value={ficha.email}
            onChange={(e) => onCambio('email', e.target.value)}
            autoComplete={conContacto ? 'email' : 'off'}
            placeholder="nombre@gmail.com"
            maxLength={254}
            error={errores.email}
          />
          {!errores.email && (
            <p className="text-[13px] text-muted-foreground">
              {conContacto ? 'Te enviamos el enlace para activar tu cuenta Global.' : 'No tiene que activar su cuenta ahora: ya tendrá su ficha y su historial.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Honeypot: invisible to people and screen readers; bots fill it. */
export function CampoTrampa({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label htmlFor="reserva-sitio-web">Deja este campo vacío</label>
      <input id="reserva-sitio-web" name={CAMPO_TRAMPA} type="text" tabIndex={-1} autoComplete="off" value={valor} onChange={(e) => onCambio(e.target.value)} />
    </div>
  )
}

/** Numbered inset list (design 01 "Cómo funciona", 03 2b). */
export function ListaPasos({ pasos, className }: { pasos: readonly { titulo: string; detalle: ReactNode }[]; className?: string }) {
  return (
    <ol className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}>
      {pasos.map((p, i) => (
        <li key={p.titulo} className="relative flex min-h-16 items-start gap-3 px-4 py-3 [&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:right-0 [&+&]:before:left-[60px] [&+&]:before:h-px [&+&]:before:bg-border/60">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-muted font-mono text-sm font-semibold tabular-nums">
            {i + 1}
          </span>
          <span className="min-w-0">
            <b className="block text-[15px] font-semibold text-foreground">{p.titulo}</b>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">{p.detalle}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Consent checkbox of a new ficha (design 04). */
export function CasillaConsentimiento({ marcada, onCambio, error }: { marcada: boolean; onCambio: (v: boolean) => void; error: string | null }) {
  return (
    <div className="grid gap-1">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl py-2 text-[14px] text-foreground">
        <input
          type="checkbox"
          checked={marcada}
          onChange={(e) => onCambio(e.target.checked)}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 size-5 shrink-0 accent-[var(--brand-strong)]"
        />
        <span>Acepto que Iglesia Global guarde estos datos para la inscripción y me contacte por WhatsApp y correo.</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}
