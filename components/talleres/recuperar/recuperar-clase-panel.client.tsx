'use client'

/**
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — «Recuperar clase»
 * (artboards 16 and 17): side panel on desktop, bottom sheet on phones
 * (DetalleResponsivo). The clase is fixed (the row it was opened from);
 * the form asks the fecha (between the clase and today), who gave it
 * (default: the grupo's líder) and an optional nota. The RPC re-checks
 * everything; its refusal stays in the panel.
 */

import { useId, useState, type FormEvent, type ReactElement } from 'react'

import { BotonSistema, InputSistema, SelectSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { NOTA_RECUPERACION_MAX } from '@/lib/platform/talleres/recuperar-clase'

export interface FacilitadorOpcion {
  readonly personaId: string
  readonly nombre: string
}

export interface DatosRecuperacion {
  readonly fecha: string
  readonly dadaPor: string | null
  readonly nota: string | null
}

export interface RecuperarClasePanelProps {
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly personaNombre: string
  /** «Clase 2 · Mis emociones · jue 15 oct» */
  readonly claseTexto: string
  /** YYYY-MM-DD: the earliest fecha (the clase itself). */
  readonly fechaMinima: string
  /** YYYY-MM-DD: today in the church's time zone. */
  readonly hoy: string
  readonly facilitadores: readonly FacilitadorOpcion[]
  readonly dadaPorDefecto: string | null
  readonly enviando: boolean
  readonly error: string | null
  readonly onRegistrar: (datos: DatosRecuperacion) => void
}

export function RecuperarClasePanel({
  abierto,
  onCambioAbierto,
  personaNombre,
  claseTexto,
  fechaMinima,
  hoy,
  facilitadores,
  dadaPorDefecto,
  enviando,
  error,
  onRegistrar,
}: RecuperarClasePanelProps): ReactElement {
  const formId = useId()
  const [fecha, setFecha] = useState(hoy)
  const [dadaPor, setDadaPor] = useState(dadaPorDefecto ?? facilitadores[0]?.personaId ?? '')
  const [nota, setNota] = useState('')

  function enviar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault()
    onRegistrar({ fecha, dadaPor: dadaPor === '' ? null : dadaPor, nota: nota.trim() === '' ? null : nota.trim() })
  }

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onCambioAbierto}
      titulo={`Recuperar clase · ${personaNombre}`}
      descripcion="Cuenta como asistida para el certificado."
      pie={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <BotonSistema type="button" variante="outline" onClick={() => onCambioAbierto(false)}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={formId} cargando={enviando} disabled={enviando}>
            Registrar recuperación
          </BotonSistema>
        </div>
      }
    >
      <form id={formId} onSubmit={enviar} className="space-y-4">
        <div>
          <TextoSistema variante="sutil" tamaño="sm" className="block uppercase tracking-wide">
            Clase que recupera
          </TextoSistema>
          <TextoSistema className="mt-1 block">{claseTexto}</TextoSistema>
        </div>
        <InputSistema
          label="Fecha de la recuperación"
          type="date"
          min={fechaMinima}
          max={hoy}
          required
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="font-mono tabular-nums"
        />
        {facilitadores.length > 0 && (
          <SelectSistema
            label="Quién la dio"
            value={dadaPor}
            onValueChange={setDadaPor}
            opciones={facilitadores.map((f) => ({ valor: f.personaId, etiqueta: f.nombre }))}
          />
        )}
        <TextareaSistema
          label="Nota (opcional)"
          maxLength={NOTA_RECUPERACION_MAX}
          placeholder="Por ejemplo: con el grupo 3, el jueves"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        {error && (
          <TextoSistema role="alert" tamaño="sm" className="block text-danger-text">
            {error}
          </TextoSistema>
        )}
      </form>
    </DetalleResponsivo>
  )
}
