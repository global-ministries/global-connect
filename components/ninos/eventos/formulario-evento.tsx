'use client'

/**
 * Niños › Eventos — "Nuevo evento" / "Editar evento" (`DetalleResponsivo`:
 * side panel from md, bottom sheet on phones). Name, kind (Semanal · Diario ·
 * Un solo día) and the date fields of that kind; a new event also takes its
 * options and the notice for the desk (an existing one changes them in place).
 * An event with horarios keeps its kind and weekday: the RPC refuses the
 * change (evento_con_horarios), so the panel says so instead of offering it.
 */
import { useId, useState, type FormEvent, type ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { Interruptor } from '@/components/ui/interruptor'
import { BotonSistema, InputSistema, SelectSistema, TextareaSistema } from '@/components/ui/sistema-diseno'
import {
  DIAS_SEMANA,
  MAX_ANUNCIO,
  MAX_NOMBRE,
  NOMBRE_TIPO,
  TIPOS_EVENTO,
  validarEvento,
  type EventoAdmin,
  type GuardarEventoArgs,
  type OpcionEvento,
  type Resultado,
  type TipoEvento,
} from '@/lib/platform/ninos/eventos'

import { OPCIONES } from './detalle-evento'

export type DatosFormularioEvento = Omit<GuardarEventoArgs, 'campusId' | 'eventoId'>

const OPCIONES_TIPO = TIPOS_EVENTO.map((t) => ({ valor: t, etiqueta: NOMBRE_TIPO[t] }))
const OPCIONES_DIA = DIAS_SEMANA.map((d, i) => ({ valor: String(i), etiqueta: d.charAt(0).toUpperCase() + d.slice(1) }))

const NUEVO: DatosFormularioEvento = {
  nombre: '',
  tipo: 'semanal',
  diaSemana: 0,
  fechaInicio: null,
  fechaFin: null,
  anuncioMesa: '',
  precheckApp: true,
  avisosPush: true,
  visitanteUnaVez: false,
  integracionDreamTeam: true,
}

function desdeEvento(e: EventoAdmin): DatosFormularioEvento {
  return {
    nombre: e.nombre,
    tipo: e.tipo,
    diaSemana: e.diaSemana,
    fechaInicio: e.fechaInicio,
    fechaFin: e.fechaFin,
    anuncioMesa: e.anuncioMesa ?? '',
    precheckApp: e.precheckApp,
    avisosPush: e.avisosPush,
    visitanteUnaVez: e.visitanteUnaVez,
    integracionDreamTeam: e.integracionDreamTeam,
  }
}

export function FormularioEvento({
  abierto,
  evento,
  onCerrar,
  onGuardar,
}: {
  readonly abierto: boolean
  /** null: a new event. */
  readonly evento: EventoAdmin | null
  readonly onCerrar: () => void
  readonly onGuardar: (datos: DatosFormularioEvento) => Promise<Resultado<{ id: string }>>
}): ReactElement {
  const idForm = useId()
  const [datos, setDatos] = useState<DatosFormularioEvento>(NUEVO)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Each opening starts from the event (or a blank one).
  const [abiertoAntes, setAbiertoAntes] = useState(false)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) {
      setDatos(evento ? desdeEvento(evento) : NUEVO)
      setError(null)
    }
  }

  const cambiar = (parcial: Partial<DatosFormularioEvento>) => setDatos((d) => ({ ...d, ...parcial }))
  const tipoFijo = evento !== null && evento.horarios.length > 0

  const elegirTipo = (tipo: TipoEvento) =>
    cambiar({
      tipo,
      diaSemana: tipo === 'semanal' ? (datos.diaSemana ?? 0) : null,
      fechaFin: tipo === 'diario' ? datos.fechaFin : null,
    })

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const invalido = validarEvento(datos)
    if (invalido) {
      setError(invalido)
      return
    }
    setEnviando(true)
    const r = await onGuardar(datos)
    setEnviando(false)
    if (r.ok) onCerrar()
    else setError(r.message)
  }

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={(a) => !a && !enviando && onCerrar()}
      titulo={evento ? 'Editar evento' : 'Nuevo evento'}
      descripcion={evento ? evento.nombre : 'Elige el nombre y cuándo pasa. Los horarios se agregan después.'}
      pie={
        <>
          <BotonSistema type="button" variante="outline" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={idForm} cargando={enviando} disabled={enviando}>
            {evento ? 'Guardar cambios' : 'Crear evento'}
          </BotonSistema>
        </>
      }
    >
      <form id={idForm} onSubmit={enviar} noValidate className="grid gap-5">
        <InputSistema
          label="Nombre del evento"
          value={datos.nombre}
          maxLength={MAX_NOMBRE}
          placeholder="Ejemplo: Campamento de vacaciones"
          onChange={(e) => cambiar({ nombre: e.target.value })}
          required
        />

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Frecuencia</legend>
          {tipoFijo ? (
            <p className="text-sm text-foreground">
              {NOMBRE_TIPO[datos.tipo]}
              {datos.tipo === 'semanal' && datos.diaSemana !== null ? `, los ${DIAS_SEMANA[datos.diaSemana]}` : ''}
              <span className="mt-1 block text-[13px] text-muted-foreground">Para cambiar la frecuencia o el día, primero quita sus horarios.</span>
            </p>
          ) : (
            <ControlSegmentado etiqueta="Frecuencia" opciones={OPCIONES_TIPO} valor={datos.tipo} onCambio={elegirTipo} className="flex [&>button]:flex-1" />
          )}
        </fieldset>

        {datos.tipo === 'semanal' && !tipoFijo && (
          <SelectSistema
            label="Día de la semana"
            opciones={OPCIONES_DIA}
            value={datos.diaSemana === null ? '' : String(datos.diaSemana)}
            onValueChange={(v) => cambiar({ diaSemana: Number(v) })}
          />
        )}
        {datos.tipo === 'diario' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <InputSistema label="Desde" type="date" value={datos.fechaInicio ?? ''} onChange={(e) => cambiar({ fechaInicio: e.target.value || null })} />
            <InputSistema label="Hasta" type="date" value={datos.fechaFin ?? ''} onChange={(e) => cambiar({ fechaFin: e.target.value || null })} />
          </div>
        )}
        {datos.tipo === 'unico' && (
          <InputSistema label="Fecha" type="date" value={datos.fechaInicio ?? ''} onChange={(e) => cambiar({ fechaInicio: e.target.value || null })} />
        )}
        {datos.tipo !== 'semanal' && (
          <p className="-mt-2 text-[13px] text-muted-foreground">
            Cada horario crea un turno «por fechas» de Dream Team con un día por cada fecha del evento; ahí se convocan los voluntarios.
          </p>
        )}

        {!evento && (
          <>
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-sm font-medium text-foreground">Opciones</legend>
              {OPCIONES.map(({ clave, titulo, descripcion }) => (
                <div key={clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 py-1.5 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{titulo}</span>
                    <span className="block text-[13px] text-muted-foreground">{descripcion}</span>
                  </span>
                  <Interruptor
                    activo={datos[clave as OpcionEvento]}
                    onCambio={(v) => cambiar({ [clave]: v } as Partial<DatosFormularioEvento>)}
                    aria-label={titulo}
                  />
                </div>
              ))}
            </fieldset>
            <TextareaSistema
              label="Anuncio para la mesa (opcional)"
              filas={2}
              maxLength={MAX_ANUNCIO}
              value={datos.anuncioMesa ?? ''}
              onChange={(e) => cambiar({ anuncioMesa: e.target.value })}
            />
          </>
        )}

        {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
      </form>
    </DetalleResponsivo>
  )
}
