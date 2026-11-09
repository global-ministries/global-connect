'use client'

/**
 * «No puedo servir» (odd/tasks/dps-asistencia-pco.md, T15c, S13.2, S13.5;
 * artboards design/dps-avisos/04, 05 and 07): a bottom sheet on the phone and
 * a side panel on desktop (DetalleResponsivo) with the optional motivo (up
 * to 300, only the planners read it) and, in the detail, «Agregar a mis
 * fechas que no puedo servir». The caller sends the answer; the sheet stays
 * open with the reason when it fails.
 */
import { useId, useState, type FormEvent, type ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema, TextareaSistema } from '@/components/ui/sistema-diseno'
import { MAX_MOTIVO, validarMotivo } from '@/lib/platform/dps/avisos'

export interface HojaNoPuedoProps {
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  /** "Domingo 15 de noviembre · Comunicador · 9:00 y 11:30". */
  readonly descripcion: string
  /** Offer to block the date too (the detail, when it is not blocked yet). */
  readonly ofrecerBloqueo: boolean
  /** Sends the answer; resolves with the reason when it failed. */
  readonly onEnviar: (motivo: string | null, bloquear: boolean) => Promise<string | null>
}

export function HojaNoPuedo({ abierta, onCambioAbierta, descripcion, ofrecerBloqueo, onEnviar }: HojaNoPuedoProps): ReactElement {
  const id = useId()
  const formulario = `${id}-no-puedo`
  const [motivo, setMotivo] = useState('')
  const [bloquear, setBloquear] = useState(false)
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Closing empties it, so each opening starts clean, as the artboards.
  function cambiarAbierta(abrir: boolean) {
    if (!abrir) {
      setMotivo('')
      setBloquear(false)
      setErrorMotivo(null)
      setError(null)
    }
    onCambioAbierta(abrir)
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    const revisado = validarMotivo(motivo)
    if (!revisado.ok) {
      setErrorMotivo(revisado.mensaje)
      return
    }
    setErrorMotivo(null)
    setError(null)
    setEnviando(true)
    const fallo = await onEnviar(revisado.motivo, ofrecerBloqueo && bloquear)
    setEnviando(false)
    if (fallo) setError(fallo)
    else cambiarAbierta(false)
  }

  return (
    <DetalleResponsivo
      abierto={abierta}
      onCambioAbierto={cambiarAbierta}
      titulo="No puedo servir"
      descripcion={descripcion}
      pie={
        <>
          <BotonSistema type="button" variante="outline" onClick={() => cambiarAbierta(false)}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={formulario} cargando={enviando}>
            Enviar respuesta
          </BotonSistema>
        </>
      }
    >
      <form id={formulario} onSubmit={enviar} noValidate className="grid gap-3">
        <TextareaSistema
          label="Motivo (opcional)"
          filas={4}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value)
            if (errorMotivo) setErrorMotivo(null)
          }}
          placeholder="Ej.: estaré de viaje con mi familia"
          error={errorMotivo ?? undefined}
          // TextareaSistema points at its own error; the hint only while there is none.
          {...(errorMotivo ? {} : { 'aria-describedby': `${id}-pista` })}
        />
        <p id={`${id}-pista`} className="flex justify-between gap-3 text-[13px] text-muted-foreground">
          <span>Solo lo ve quien planifica. Buscará a otra persona para tu puesto.</span>
          <span className="shrink-0 font-mono tabular-nums" aria-hidden="true">
            {motivo.trim().length}/{MAX_MOTIVO}
          </span>
        </p>
        {ofrecerBloqueo && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl py-1.5 touch-manipulation">
            <input
              type="checkbox"
              checked={bloquear}
              onChange={(e) => setBloquear(e.target.checked)}
              className="focus-ring mt-0.5 size-5 shrink-0 accent-[var(--brand-strong)]"
            />
            <span className="min-w-0 text-[15px]">
              Agregar a mis fechas que no puedo servir
              <span className="block text-[13px] text-muted-foreground">Así quien planifica sabe que no estás disponible ese día.</span>
            </span>
          </label>
        )}
        {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
      </form>
    </DetalleResponsivo>
  )
}
