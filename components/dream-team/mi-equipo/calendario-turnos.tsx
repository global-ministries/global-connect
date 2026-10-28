'use client'

/**
 * Mi equipo — "Calendario" of the dated shifts the selected team serves (A2,
 * S1, S2, S4 of odd/tasks/tlr-calendario-servicios.md). The Living Room has no
 * fixed day: its coordinator plans the dates ahead ("+ Fecha": fecha, hora
 * optional, nota optional) and, per date, picks among the volunteers assigned
 * to the shift who serves, with "Todos" in one click.
 *
 * Loads from GET /api/dream-team/turnos/calendario?equipoId= and writes through
 * the /api/dream-team/turnos/[id]/fechas routes; the database decides who may
 * (A1) and the routes answer a refusal in Spanish. "+ Fecha" and the edit
 * actions only show when the database says the viewer may plan the shift.
 *
 * The volunteers listed per date are those of the selected card assigned to
 * the shift; whoever already serves and is not listed here (another team) is
 * kept on save (idsParaGuardar).
 */
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { Plus } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { PanelLateralSistema } from '@/components/ui/panel-lateral-sistema'
import { BotonSistema, InputSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import type { useNotificaciones } from '@/hooks/use-notificaciones'
import { isoLocal } from '@/lib/platform/dream-team/frecuencia-turno'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import {
  NOTA_MAX,
  TEXTO_POR_FECHAS,
  alternarSeleccion,
  etiquetaFecha,
  horaDeFecha,
  idsParaGuardar,
  separarFechas,
  textoSirven,
  todosSeleccionados,
  validarFechaTurno,
  type FechaTurno,
} from '@/lib/platform/dream-team/turno-fechas'

type Toast = Pick<ReturnType<typeof useNotificaciones>, 'success'>

export interface CalendarioTurnosProps {
  /** The Dream Team equipo of the selected card. */
  readonly equipoId: string
  /** The people of the selected card. */
  readonly personas: readonly PersonaVista[]
  readonly toast: Toast
  /** "YYYY-MM-DD"; defaults to today. */
  readonly hoy?: string
}

interface TurnoCalendario {
  readonly id: string
  readonly nombre: string
  readonly hora: string
  readonly puedeGestionar: boolean
  readonly fechas: readonly FechaTurno[]
}

interface Asignado {
  readonly servicioId: string
  readonly nombre: string
  readonly detalle: string
}

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]'

async function leerError(respuesta: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: unknown }
    return typeof cuerpo.error === 'string' ? cuerpo.error : porDefecto
  } catch {
    return porDefecto
  }
}

const urlFechas = (turnoId: string) => `/api/dream-team/turnos/${encodeURIComponent(turnoId)}/fechas`
const urlFecha = (turnoId: string, fechaId: string) => `${urlFechas(turnoId)}/${encodeURIComponent(fechaId)}`

/** The servicios of the card assigned to the shift, once each. */
function asignadosDe(personas: readonly PersonaVista[], turnoId: string): Asignado[] {
  const vistos = new Set<string>()
  const asignados: Asignado[] = []
  for (const persona of personas) {
    const servicioId = persona.servicioId
    if (persona.origen !== 'dream_team' || !servicioId || vistos.has(servicioId)) continue
    if (!persona.turnoIds?.includes(turnoId)) continue
    vistos.add(servicioId)
    asignados.push({ servicioId, nombre: persona.nombre, detalle: `${persona.rolLabel} · ${persona.equipoLabel}` })
  }
  return asignados
}

export function CalendarioTurnos({ equipoId, personas, toast, hoy: hoyProp }: CalendarioTurnosProps): ReactElement | null {
  const hoy = hoyProp ?? isoLocal(new Date())
  const [turnos, setTurnos] = useState<readonly TurnoCalendario[] | null>(null)
  const [version, setVersion] = useState(0)
  const [abierta, setAbierta] = useState<{ readonly turnoId: string; readonly fechaId: string } | null>(null)
  const [formulario, setFormulario] = useState<{ readonly turnoId: string; readonly fecha: FechaTurno | null } | null>(null)

  useEffect(() => {
    let vigente = true
    void (async () => {
      try {
        const respuesta = await fetch(`/api/dream-team/turnos/calendario?equipoId=${encodeURIComponent(equipoId)}`, {
          cache: 'no-store',
        })
        if (!respuesta.ok) throw new Error(await leerError(respuesta, 'No se pudo cargar el calendario.'))
        const cuerpo = (await respuesta.json()) as { turnos?: TurnoCalendario[] }
        if (vigente) setTurnos(cuerpo.turnos ?? [])
      } catch (error) {
        // A convenience on top of the list, as the contacts: the page works without it.
        console.error('[dream-team/mi-equipo] calendario', error)
        if (vigente) setTurnos([])
      }
    })()
    return () => {
      vigente = false
    }
  }, [equipoId, version])

  if (!turnos || turnos.length === 0) return null
  const recargar = () => setVersion((v) => v + 1)

  const turnoAbierto = abierta ? turnos.find((turno) => turno.id === abierta.turnoId) : undefined
  const fechaAbierta = abierta ? turnoAbierto?.fechas.find((fecha) => fecha.id === abierta.fechaId) : undefined
  const turnoFormulario = formulario ? turnos.find((turno) => turno.id === formulario.turnoId) : undefined

  return (
    <>
      {turnos.map((turno) => (
        <CalendarioDeTurno
          key={turno.id}
          turno={turno}
          asignados={asignadosDe(personas, turno.id)}
          hoy={hoy}
          onAbrirFecha={(fechaId) => setAbierta({ turnoId: turno.id, fechaId })}
          onAgregarFecha={() => setFormulario({ turnoId: turno.id, fecha: null })}
        />
      ))}

      {turnoAbierto && fechaAbierta && (
        <PanelFecha
          key={fechaAbierta.id}
          turno={turnoAbierto}
          fecha={fechaAbierta}
          asignados={asignadosDe(personas, turnoAbierto.id)}
          hoy={hoy}
          toast={toast}
          onCerrar={() => setAbierta(null)}
          onCambiado={recargar}
          onEditar={() => {
            setAbierta(null)
            setFormulario({ turnoId: turnoAbierto.id, fecha: fechaAbierta })
          }}
        />
      )}

      {formulario && turnoFormulario && (
        <PanelFormularioFecha
          key={formulario.fecha?.id ?? `nueva-${turnoFormulario.id}`}
          turno={turnoFormulario}
          fecha={formulario.fecha}
          toast={toast}
          onCerrar={() => setFormulario(null)}
          onGuardado={recargar}
        />
      )}
    </>
  )
}

// ── One shift: its dates ─────────────────────────────────────────────────

function CalendarioDeTurno({
  turno,
  asignados,
  hoy,
  onAbrirFecha,
  onAgregarFecha,
}: {
  readonly turno: TurnoCalendario
  readonly asignados: readonly Asignado[]
  readonly hoy: string
  readonly onAbrirFecha: (fechaId: string) => void
  readonly onAgregarFecha: () => void
}): ReactElement {
  const { proximas, pasadas } = separarFechas(turno.fechas, hoy)
  const visibles = new Set(asignados.map((asignado) => asignado.servicioId))

  const fila = (fecha: FechaTurno): ReactElement => {
    const sirven = fecha.servidores.filter((id) => visibles.has(id)).length
    return (
      <li key={fecha.id}>
        <button
          type="button"
          onClick={() => onAbrirFecha(fecha.id)}
          className={`flex min-h-[60px] w-full items-center gap-3 px-5 py-2 text-left hover:bg-accent sm:px-6 ${FOCO}`}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground sm:text-base">
              {`${etiquetaFecha(fecha.fecha, hoy)} · ${horaDeFecha(fecha, turno.hora)}`}
            </span>
            {fecha.nota && <span className="truncate text-sm text-muted-foreground">{fecha.nota}</span>}
          </span>
          <span className="shrink-0 text-sm text-muted-foreground">{textoSirven(sirven, asignados.length)}</span>
        </button>
      </li>
    )
  }

  return (
    <TarjetaSistema role="region" aria-label={`Calendario · ${turno.nombre}`} className="flex flex-col overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <TituloSistema nivel={3}>Calendario</TituloSistema>
          <p className="text-sm text-muted-foreground">{`${turno.nombre} · ${TEXTO_POR_FECHAS} · ${turno.hora}`}</p>
        </div>
        {turno.puedeGestionar && (
          <BotonSistema type="button" variante="outline" icono={Plus} aria-label="Agregar fecha" onClick={onAgregarFecha}>
            Fecha
          </BotonSistema>
        )}
      </div>

      {proximas.length === 0 ? (
        <p className="px-6 py-6 text-center text-sm text-muted-foreground">
          {turno.puedeGestionar ? 'No hay próximas fechas. Agrega la siguiente con «+ Fecha».' : 'No hay próximas fechas planificadas.'}
        </p>
      ) : (
        <ul aria-label="Próximas fechas" className="divide-y divide-border">
          {proximas.map(fila)}
        </ul>
      )}

      {pasadas.length > 0 && (
        <details className="border-t border-border">
          <summary className={`flex min-h-11 cursor-pointer items-center px-5 text-sm font-medium text-muted-foreground sm:px-6 ${FOCO}`}>
            {`Fechas pasadas (${pasadas.length})`}
          </summary>
          <ul aria-label="Fechas pasadas" className="divide-y divide-border">
            {pasadas.map(fila)}
          </ul>
        </details>
      )}
    </TarjetaSistema>
  )
}

// ── One date: who serves ─────────────────────────────────────────────────

function PanelFecha({
  turno,
  fecha,
  asignados,
  hoy,
  toast,
  onCerrar,
  onCambiado,
  onEditar,
}: {
  readonly turno: TurnoCalendario
  readonly fecha: FechaTurno
  readonly asignados: readonly Asignado[]
  readonly hoy: string
  readonly toast: Toast
  readonly onCerrar: () => void
  readonly onCambiado: () => void
  readonly onEditar: () => void
}): ReactElement {
  const idBase = useId()
  const visibles = useMemo(() => asignados.map((asignado) => asignado.servicioId), [asignados])
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(
    () => new Set(fecha.servidores.filter((id) => visibles.includes(id))),
  )
  const [enviando, setEnviando] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const puede = turno.puedeGestionar
  const conteo = textoSirven(visibles.filter((id) => elegidos.has(id)).length, visibles.length)

  async function enviar(url: string, init: RequestInit, porDefecto: string): Promise<boolean> {
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
      if (!respuesta.ok) {
        setError(await leerError(respuesta, porDefecto))
        return false
      }
      return true
    } catch {
      setError(porDefecto)
      return false
    } finally {
      setEnviando(false)
    }
  }

  async function guardar(): Promise<void> {
    const servicioIds = idsParaGuardar(elegidos, visibles, fecha.servidores)
    const ok = await enviar(
      `${urlFecha(turno.id, fecha.id)}/servidores`,
      { method: 'PUT', body: JSON.stringify({ servicioIds }) },
      'No se pudo guardar quién sirve.',
    )
    if (!ok) return
    toast.success(`Guardado: ${conteo}.`)
    onCambiado()
    onCerrar()
  }

  async function borrar(): Promise<void> {
    const ok = await enviar(urlFecha(turno.id, fecha.id), { method: 'DELETE' }, 'No se pudo borrar la fecha.')
    if (!ok) return
    toast.success('Fecha borrada.')
    onCambiado()
    onCerrar()
  }

  const descripcion = [turno.nombre, horaDeFecha(fecha, turno.hora), fecha.nota].filter(Boolean).join(' · ')

  return (
    <PanelLateralSistema
      abierto
      onAbiertoChange={(abierto) => !abierto && !enviando && onCerrar()}
      titulo={etiquetaFecha(fecha.fecha, hoy)}
      descripcion={descripcion}
      pie={
        puede ? (
          <>
            <BotonSistema type="button" variante="outline" disabled={enviando} onClick={onCerrar}>
              Cancelar
            </BotonSistema>
            <BotonSistema
              type="button"
              disabled={enviando || visibles.length === 0}
              cargando={enviando}
              onClick={() => {
                void guardar()
              }}
            >
              Guardar
            </BotonSistema>
          </>
        ) : undefined
      }
    >
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TextoSistema aria-live="polite" className="text-sm font-medium text-foreground">
            {conteo}
          </TextoSistema>
          {puede && visibles.length > 0 && (
            <BotonSistema
              type="button"
              variante="outline"
              disabled={enviando}
              onClick={() => setElegidos(todosSeleccionados(visibles))}
            >
              Todos
            </BotonSistema>
          )}
        </div>

        {asignados.length === 0 ? (
          <TextoSistema variante="sutil">
            Nadie de este equipo tiene asignado este turno. Asígnalo desde «Turnos» en el menú de cada persona.
          </TextoSistema>
        ) : (
          <ul className="grid gap-1">
            {asignados.map((asignado) => {
              const id = `${idBase}-${asignado.servicioId}`
              return (
                <li key={asignado.servicioId} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-accent">
                  <Checkbox
                    id={id}
                    checked={elegidos.has(asignado.servicioId)}
                    disabled={!puede || enviando}
                    onCheckedChange={() => setElegidos((previos) => alternarSeleccion(previos, asignado.servicioId))}
                  />
                  <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col py-2">
                    <span className="text-sm font-medium text-foreground">{asignado.nombre}</span>
                    <span className="text-xs text-muted-foreground">{asignado.detalle}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {puede && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <BotonSistema type="button" variante="ghost" disabled={enviando} onClick={onEditar}>
              Editar fecha
            </BotonSistema>
            {confirmarBorrar ? (
              <>
                <BotonSistema
                  type="button"
                  variante="peligro"
                  disabled={enviando}
                  onClick={() => {
                    void borrar()
                  }}
                >
                  Sí, borrar
                </BotonSistema>
                <BotonSistema type="button" variante="ghost" disabled={enviando} onClick={() => setConfirmarBorrar(false)}>
                  No
                </BotonSistema>
              </>
            ) : (
              <BotonSistema type="button" variante="ghost" disabled={enviando} onClick={() => setConfirmarBorrar(true)}>
                Borrar fecha
              </BotonSistema>
            )}
          </div>
        )}

        {error !== null && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </PanelLateralSistema>
  )
}

// ── "+ Fecha" and "Editar fecha" ─────────────────────────────────────────

function PanelFormularioFecha({
  turno,
  fecha,
  toast,
  onCerrar,
  onGuardado,
}: {
  readonly turno: TurnoCalendario
  /** null = a new date. */
  readonly fecha: FechaTurno | null
  readonly toast: Toast
  readonly onCerrar: () => void
  readonly onGuardado: () => void
}): ReactElement {
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
    <PanelLateralSistema
      abierto
      onAbiertoChange={(abierto) => !abierto && !enviando && onCerrar()}
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
          <TextoSistema variante="sutil">{`Si la dejas vacía, se usa la hora del turno (${turno.hora}).`}</TextoSistema>
        </div>
        <InputSistema
          label="Nota (opcional)"
          maxLength={NOTA_MAX}
          value={nota}
          onChange={(evento) => setNota(evento.target.value)}
        />
        {error !== null && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </form>
    </PanelLateralSistema>
  )
}
