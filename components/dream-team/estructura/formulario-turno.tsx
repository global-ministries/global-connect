'use client'

/**
 * Estructura — "Agregar turno" (S12; prototype `openTurnoNuevo`): a
 * `DetalleResponsivo` with the campus (only when there are several), the
 * name, the tipo (Semanal or Por fechas), the weekday for a weekly shift and
 * the hour. A dated shift has no weekday: its dates are planned in Mi equipo,
 * and only the teams that choose it serve it. New shifts go last in their
 * campus.
 */
import { useId, useState, useTransition, type FormEvent, type ReactElement } from 'react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { crearTurno } from '@/app/(auth)/admin/dream-team/estructura/turnos-actions'
import { DIAS_SEMANA, type Turno } from '@/lib/platform/dream-team/turnos'
import type { TipoTurno } from '@/lib/platform/dream-team/turno-fechas'

import { reportarResultado, type Toast } from './mensajes'

export interface FormularioTurnoProps {
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly campus: readonly { readonly id: string; readonly nombre: string }[]
  readonly turnos: readonly Turno[]
  readonly onActualizado: () => void
  readonly toast: Toast
}

export function FormularioTurno({ abierto, onCambioAbierto, campus, turnos, onActualizado, toast }: FormularioTurnoProps): ReactElement {
  const idFormulario = useId()
  const [isPending, startTransition] = useTransition()
  const [campusId, setCampusId] = useState(campus[0]?.id ?? '')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoTurno>('semanal')
  const [dia, setDia] = useState('0')
  const [hora, setHora] = useState('09:00')
  const label = nombre.trim()
  const elegido = campus.some((opcion) => opcion.id === campusId) ? campusId : (campus[0]?.id ?? '')

  function agregar(evento: FormEvent): void {
    evento.preventDefault()
    if (!label || !elegido || !hora) return
    const orden = Math.max(0, ...turnos.filter((turno) => turno.campusId === elegido).map((turno) => turno.orden)) + 1
    startTransition(async () => {
      const resultado = await crearTurno(
        tipo === 'fechas'
          ? { campusId: elegido, nombre: label, diaSemana: 0, hora, orden, tipo }
          : { campusId: elegido, nombre: label, diaSemana: Number(dia), hora, orden },
      )
      if (reportarResultado(toast, resultado, 'Turno agregado correctamente.')) {
        setNombre('')
        onCambioAbierto(false)
        onActualizado()
      }
    })
  }

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={(abre) => !isPending && onCambioAbierto(abre)}
      titulo="Agregar turno"
      descripcion="Turnos del campus"
      pie={
        <>
          <BotonSistema type="button" variante="outline" disabled={isPending} onClick={() => onCambioAbierto(false)}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={idFormulario} cargando={isPending} disabled={isPending || !label || !elegido || !hora}>
            Agregar turno
          </BotonSistema>
        </>
      }
    >
      <form id={idFormulario} onSubmit={agregar} className="grid gap-4">
        {campus.length > 1 && (
          <SelectSistema
            label="Campus"
            opciones={campus.map((opcion) => ({ valor: opcion.id, etiqueta: opcion.nombre }))}
            value={elegido}
            onValueChange={setCampusId}
            disabled={isPending}
          />
        )}
        <InputSistema
          label="Nombre del turno"
          placeholder="Domingo 9:00"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          disabled={isPending}
        />
        <SelectSistema
          label="Tipo"
          opciones={[
            { valor: 'semanal', etiqueta: 'Semanal' },
            { valor: 'fechas', etiqueta: 'Por fechas' },
          ]}
          value={tipo}
          onValueChange={(valor) => setTipo(valor === 'fechas' ? 'fechas' : 'semanal')}
          disabled={isPending}
        />
        {tipo === 'semanal' && (
          <SelectSistema
            label="Día"
            opciones={DIAS_SEMANA.map((nombreDia, indice) => ({ valor: String(indice), etiqueta: nombreDia }))}
            value={dia}
            onValueChange={setDia}
            disabled={isPending}
          />
        )}
        <InputSistema label="Hora" type="time" value={hora} onChange={(evento) => setHora(evento.target.value)} disabled={isPending} />
        {tipo === 'fechas' && (
          <p className="text-sm text-muted-foreground">
            Sin día fijo: sus fechas se planifican en Mi equipo, en el Calendario del equipo. Sólo lo sirven los equipos que lo eligen
            en los Turnos de cada equipo.
          </p>
        )}
      </form>
    </DetalleResponsivo>
  )
}
