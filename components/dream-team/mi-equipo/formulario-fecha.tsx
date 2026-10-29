'use client'

/**
 * Mi equipo · Calendario — "+ Fecha" and "Editar fecha": fecha, hora
 * (optional, overrides the shift's) and nota (optional), in a
 * `DetalleResponsivo`. POST /api/dream-team/turnos/[id]/fechas for a new date,
 * PATCH …/fechas/[fechaId] for an edit; the refusal of the database shows in
 * an alert.
 */
import { useId, useState, type FormEvent, type ReactElement } from 'react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { NOTA_MAX, TEXTO_POR_FECHAS, validarFechaTurno, type FechaTurno } from '@/lib/platform/dream-team/turno-fechas'

import { leerError, urlFecha, urlFechas, type Toast, type TurnoCalendario } from './calendario-datos'

export interface FormularioFechaProps {
  readonly turno: TurnoCalendario
  /** null = a new date. */
  readonly fecha: FechaTurno | null
  readonly toast: Toast
  readonly onCerrar: () => void
  readonly onGuardado: () => void
}

export function FormularioFecha({ turno, fecha, toast, onCerrar, onGuardado }: FormularioFechaProps): ReactElement {
  const formId = useId()
  const [dia, setDia] = useState(fecha?.fecha ?? '')
  const [hora, setHora] = useState(fecha?.hora ?? '')
  const [nota, setNota] = useState(fecha?.nota ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(evento: FormEvent): Promise<void> {
    evento.preventDefault()
    if (enviando) return
    const validacion = validarFechaTurno({ fecha: dia, hora, nota })
    if (!validacion.ok) {
      setError(validacion.message)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetch(fecha ? urlFecha(turno.id, fecha.id) : urlFechas(turno.id), {
        method: fecha ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validacion.datos),
      })
      if (!respuesta.ok) {
        setError(await leerError(respuesta, 'No se pudo guardar la fecha.'))
        return
      }
      toast.success(fecha ? 'Fecha actualizada.' : 'Fecha agregada.')
      onGuardado()
      onCerrar()
    } catch {
      setError('No se pudo guardar la fecha.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <DetalleResponsivo
      abierto
      onCambioAbierto={(abierto) => !abierto && !enviando && onCerrar()}
      titulo={fecha ? 'Editar fecha' : 'Nueva fecha'}
      descripcion={`${turno.nombre} · ${TEXTO_POR_FECHAS}`}
      pie={
        <>
          <BotonSistema type="button" variante="outline" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={formId} disabled={enviando || dia === ''} cargando={enviando}>
            Guardar
          </BotonSistema>
        </>
      }
    >
      <form id={formId} onSubmit={guardar} noValidate className="grid content-start gap-4">
        <InputSistema label="Fecha" type="date" value={dia} onChange={(evento) => setDia(evento.target.value)} />
        <div className="grid gap-1">
          <InputSistema label="Hora (opcional)" type="time" value={hora} onChange={(evento) => setHora(evento.target.value)} />
          <p className="text-[13px] text-muted-foreground">{`Si la dejas vacía, se usa la hora del turno (${turno.hora}).`}</p>
        </div>
        <InputSistema label="Nota (opcional)" maxLength={NOTA_MAX} value={nota} onChange={(evento) => setNota(evento.target.value)} />
        {error !== null && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </form>
    </DetalleResponsivo>
  )
}
