'use client'

/**
 * Niños › Eventos — "Agregar horario" (`DetalleResponsivo`). A weekly event
 * links a weekly Dream Team turno of its weekday that no other horario uses,
 * or creates a new one (name + hour); a daily or one-day event always creates
 * a turno «por fechas» (S8.1). Then the check-in window in minutes (0–240;
 * 120 / 120 is today's ±2 h).
 */
import { useId, useState, type FormEvent, type ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import {
  DIAS_SEMANA,
  horaCorta,
  validarHora,
  validarVentana,
  type EventoAdmin,
  type Resultado,
} from '@/lib/platform/ninos/eventos'

export interface DatosHorario {
  readonly turnoId: string | null
  readonly nombre: string | null
  readonly hora: string | null
  readonly abreMinAntes: number
  readonly cierraMinDespues: number
}

type Origen = 'existente' | 'nuevo'

const minutos = (texto: string): number => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : Number.NaN)

export function AgregarHorario({
  abierto,
  evento,
  disponibles,
  onCerrar,
  onGuardar,
}: {
  readonly abierto: boolean
  readonly evento: EventoAdmin
  /** Weekly turnos of the event's weekday that no horario links (turnosDisponibles). */
  readonly disponibles: readonly { id: string; nombre: string; hora: string }[]
  readonly onCerrar: () => void
  readonly onGuardar: (datos: DatosHorario) => Promise<Resultado<{ id: string }>>
}): ReactElement {
  const idForm = useId()
  const semanal = evento.tipo === 'semanal'
  const puedeVincular = semanal && disponibles.length > 0
  const [origen, setOrigen] = useState<Origen>('nuevo')
  const [turnoId, setTurnoId] = useState('')
  const [nombre, setNombre] = useState('')
  const [hora, setHora] = useState('')
  const [abre, setAbre] = useState('120')
  const [cierra, setCierra] = useState('120')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Each opening starts blank, on an existing turno when there is one.
  const [abiertoAntes, setAbiertoAntes] = useState(false)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) {
      setOrigen(puedeVincular ? 'existente' : 'nuevo')
      setTurnoId(disponibles[0]?.id ?? '')
      setNombre('')
      setHora('')
      setAbre('120')
      setCierra('120')
      setError(null)
    }
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const vincular = origen === 'existente' && puedeVincular
    const invalido =
      (vincular ? (turnoId ? null : 'Elige un turno.') : validarHora(hora)) ?? validarVentana(minutos(abre), minutos(cierra))
    if (invalido) {
      setError(invalido)
      return
    }
    setEnviando(true)
    const r = await onGuardar({
      turnoId: vincular ? turnoId : null,
      nombre: vincular ? null : nombre.trim() || null,
      hora: vincular ? null : hora.trim(),
      abreMinAntes: minutos(abre),
      cierraMinDespues: minutos(cierra),
    })
    setEnviando(false)
    if (r.ok) onCerrar()
    else setError(r.message)
  }

  const dia = semanal && evento.diaSemana !== null ? DIAS_SEMANA[evento.diaSemana] : null

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={(a) => !a && !enviando && onCerrar()}
      titulo="Agregar horario"
      descripcion={evento.nombre}
      pie={
        <>
          <BotonSistema type="button" variante="outline" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={idForm} cargando={enviando} disabled={enviando}>
            Agregar horario
          </BotonSistema>
        </>
      }
    >
      <form id={idForm} onSubmit={enviar} noValidate className="grid gap-5">
        {puedeVincular && (
          <ControlSegmentado
            etiqueta="Turno del horario"
            opciones={[
              { valor: 'existente', etiqueta: 'Turno que ya existe' },
              { valor: 'nuevo', etiqueta: 'Turno nuevo' },
            ]}
            valor={origen}
            onCambio={setOrigen}
            className="flex [&>button]:flex-1"
          />
        )}

        {origen === 'existente' && puedeVincular ? (
          <SelectSistema
            label={`Turno de Dream Team de los ${dia ?? ''}`.trim()}
            opciones={disponibles.map((t) => ({ valor: t.id, etiqueta: `${t.nombre} · ${horaCorta(t.hora)}` }))}
            value={turnoId}
            onValueChange={setTurnoId}
          />
        ) : (
          <>
            <InputSistema
              label="Nombre del horario (opcional)"
              value={nombre}
              maxLength={80}
              placeholder={`${evento.nombre} 9:00`}
              onChange={(e) => setNombre(e.target.value)}
            />
            <InputSistema
              label="Hora del servicio"
              value={hora}
              inputMode="numeric"
              placeholder="9:00"
              onChange={(e) => setHora(e.target.value)}
              required
            />
            <p className="-mt-3 text-[13px] text-muted-foreground">
              {semanal
                ? `Se crea un turno semanal de Dream Team los ${dia ?? ''}, para todo el campus.`
                : 'Se crea un turno «por fechas» de Dream Team con un día por cada fecha del evento.'}
            </p>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <InputSistema
            label="Abre el check-in (minutos antes)"
            value={abre}
            inputMode="numeric"
            onChange={(e) => setAbre(e.target.value)}
          />
          <InputSistema
            label="Cierra el retiro (minutos después)"
            value={cierra}
            inputMode="numeric"
            onChange={(e) => setCierra(e.target.value)}
          />
        </div>

        {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
      </form>
    </DetalleResponsivo>
  )
}
