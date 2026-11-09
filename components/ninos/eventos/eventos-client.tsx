'use client'

/**
 * Niños › Eventos — /ninos/eventos (odd/tasks/ninos-checkin-pco.md, T1c, S5,
 * S8; artboard design/ninos-checkin-pco/01-admin-eventos.html). The events of
 * a campus on the left, the open one on the right: horarios with their
 * check-in window, recent sessions, configuration, options and the notice for
 * the desk. Writes autosave through the server actions of
 * lib/actions/ninos-eventos.actions.ts; a reader without
 * ninos_puede_configurar_campus gets the same screen without controls.
 *
 * Inside the app shell the artboard's full-height planning frame is the
 * `PaginaSistema` page of the other Niños v2 screen (check-in): breadcrumbs,
 * hero with the summary, then the list and the detail as two columns from lg.
 * URL: ?campus (router.push, new data) and ?evento (history.replaceState).
 * The Eventos · Salones tabs lead to /ninos/salones (T1d) with the campus.
 */
import { useRouter } from 'next/navigation'
import { useMemo, useState, type ReactElement } from 'react'
import { CalendarClock, CalendarX, Plus } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { PestanasAdmin } from '@/components/ninos/salones/pestanas-admin'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import {
  agregarHorario,
  archivarEvento,
  guardarEvento,
  guardarVentanaHorario,
  quitarHorario,
} from '@/lib/actions/ninos-eventos.actions'
import {
  horaCorta,
  proximaApertura,
  textoHorarioQuitado,
  textoVentana,
  turnosDisponibles,
  type EventoAdmin,
  type GuardarEventoArgs,
  type HorarioEvento,
  type OpcionEvento,
  type TurnoSemanal,
} from '@/lib/platform/ninos/eventos'

import { AgregarHorario } from './agregar-horario'
import { DetalleEvento, OPCIONES } from './detalle-evento'
import { DialogoConfirmar, type Confirmacion } from './dialogo-confirmar'
import { FormularioEvento } from './formulario-evento'
import { ListaEventos } from './lista-eventos'
import { EncabezadoEventos, MigasEventos, Num } from './partes'
import { useGuardado } from './use-guardado'

export interface EventosClientProps {
  /** Campuses where the caller reads Niños events (ninos_puede_configurar_algun_area_campus). */
  readonly campus: readonly { id: string; nombre: string }[]
  readonly campusId: string | null
  readonly eventos: readonly EventoAdmin[]
  /** The HINT of ninos_eventos_admin when the read failed. */
  readonly errorLectura: string | null
  /** ninos_puede_configurar_campus(campus): may write. */
  readonly puedeEditar: boolean
  /** Active weekly Dream Team turnos of the campus. */
  readonly turnos: readonly TurnoSemanal[]
  readonly hoy: string
  readonly eventoInicial?: string
}

type Pendiente = { tipo: 'archivar'; evento: EventoAdmin } | { tipo: 'quitar'; horario: HorarioEvento }

function argsDe(e: EventoAdmin, cambios: Partial<GuardarEventoArgs> = {}): GuardarEventoArgs {
  return {
    campusId: e.campusId,
    eventoId: e.id,
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
    ...cambios,
  }
}

function confirmacionDe(p: Pendiente): Confirmacion {
  if (p.tipo === 'archivar') {
    return {
      titulo: `¿Archivar ${p.evento.nombre}?`,
      descripcion: 'Deja de abrir el check-in y pasa a Archivados. Sus horarios, sesiones y reportes se quedan; puedes restaurarlo cuando quieras.',
      accion: 'Archivar',
    }
  }
  const h = p.horario
  return {
    titulo: `¿Quitar el horario ${h.nombre}?`,
    descripcion:
      h.turnoTipo === 'fechas' && h.turnoCreado
        ? 'Las sesiones pasadas y sus asistencias se quedan. Si su turno de Dream Team no tiene voluntarios ni asistencias, también se borra.'
        : `Las sesiones pasadas y sus asistencias se quedan. El turno sigue en Dream Team; solo deja de abrir el check-in de Niños a las ${horaCorta(h.hora)}.`,
    accion: 'Quitar horario',
  }
}

export function EventosClient({
  campus,
  campusId,
  eventos,
  errorLectura,
  puedeEditar,
  turnos,
  hoy,
  eventoInicial,
}: EventosClientProps): ReactElement {
  const router = useRouter()
  const notificaciones = useNotificaciones()
  const guardado = useGuardado()
  const [elegido, setElegido] = useState<string | null>(eventoInicial ?? null)
  const [formulario, setFormulario] = useState<'nuevo' | 'editar' | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null)

  const nombreCampus = campus.find((c) => c.id === campusId)?.nombre ?? ''
  const evento = eventos.find((e) => e.id === elegido) ?? eventos.find((e) => e.activo) ?? eventos[0] ?? null
  const disponibles = useMemo(
    () => (evento ? turnosDisponibles(turnos, eventos, evento.diaSemana) : []),
    [turnos, eventos, evento],
  )
  const activos = eventos.filter((e) => e.activo).length
  const apertura = proximaApertura(eventos, hoy)

  const elegir = (id: string) => {
    setElegido(id)
    const q = new URLSearchParams()
    if (campusId) q.set('campus', campusId)
    q.set('evento', id)
    window.history.replaceState(null, '', `/ninos/eventos?${q.toString()}`)
    if (window.innerWidth < 1024) document.getElementById('detalle-evento')?.scrollIntoView({ block: 'start' })
    const e = eventos.find((x) => x.id === id)
    if (e) guardado.anunciar(`Mostrando ${e.nombre}.`)
  }

  const nuevo = () => setFormulario('nuevo')

  const opcion = async (clave: OpcionEvento, valor: boolean) => {
    if (!evento) return false
    const titulo = OPCIONES.find((o) => o.clave === clave)?.titulo ?? ''
    const r = await guardado.guardar(
      () => guardarEvento(argsDe(evento, { [clave]: valor })),
      () => `${titulo}: ${valor ? 'activado' : 'desactivado'}.`,
    )
    return r.ok
  }

  const anuncio = async (texto: string) => {
    if (!evento) return false
    const r = await guardado.guardar(
      () => guardarEvento(argsDe(evento, { anuncioMesa: texto })),
      () => (texto.trim() ? 'Anuncio para la mesa actualizado.' : 'Quitaste el anuncio de la mesa.'),
    )
    return r.ok
  }

  const ventana = async (h: HorarioEvento, abre: number, cierra: number) => {
    const r = await guardado.guardar(
      () => guardarVentanaHorario({ horarioId: h.id, abreMinAntes: abre, cierraMinDespues: cierra }),
      () => `${h.nombre}: ${textoVentana({ hora: h.hora, abreMinAntes: abre, cierraMinDespues: cierra })}.`,
    )
    return r.ok
  }

  const restaurar = async () => {
    if (!evento) return
    const r = await guardado.guardar(() => archivarEvento({ eventoId: evento.id, activo: true }), () => `Restauraste ${evento.nombre}.`)
    if (!r.ok) notificaciones.error(r.message)
  }

  const confirmar = async () => {
    if (!pendiente) return
    setEnviando(true)
    setErrorDialogo(null)
    if (pendiente.tipo === 'archivar') {
      const e = pendiente.evento
      const r = await guardado.guardar(() => archivarEvento({ eventoId: e.id, activo: false }), () => `${e.nombre} archivado.`)
      setEnviando(false)
      if (r.ok) setPendiente(null)
      else setErrorDialogo(r.message)
      return
    }
    const h = pendiente.horario
    const r = await guardado.guardar(() => quitarHorario({ horarioId: h.id }), (d) => textoHorarioQuitado(h.nombre, d.turnoBorrado))
    setEnviando(false)
    if (r.ok) {
      setPendiente(null)
      notificaciones.success(textoHorarioQuitado(h.nombre, r.data.turnoBorrado))
    } else {
      setErrorDialogo(r.message)
    }
  }

  const resumen = (
    <>
      {nombreCampus && <>{nombreCampus} · </>}
      <Num>{activos}</Num> {activos === 1 ? 'evento activo' : 'eventos activos'}
      {apertura ? (
        <>
          {' '}
          · el próximo check-in abre <strong>{apertura.texto}</strong>
        </>
      ) : (
        ' · sin check-in programado'
      )}
    </>
  )

  const cuerpo = (): ReactElement => {
    if (campus.length === 0) {
      return (
        <EstadoVacioSistema
          icono={CalendarX}
          titulo="No hay salones de Niños"
          subtitulo="Los eventos se configuran por campus; primero hace falta un campus con salones activos."
        />
      )
    }
    if (errorLectura) {
      return <EstadoVacioSistema icono={CalendarX} titulo="No se pudieron cargar los eventos" subtitulo={errorLectura} />
    }
    if (!evento) {
      return (
        <EstadoVacioSistema
          icono={CalendarClock}
          titulo="Este campus no tiene eventos"
          subtitulo={puedeEditar ? 'Crea el primero y luego agrégale sus horarios.' : 'Quien configura Niños en el campus puede crearlos.'}
          accion={
            puedeEditar ? (
              <BotonSistema type="button" icono={Plus} aria-haspopup="dialog" onClick={nuevo}>
                Nuevo evento
              </BotonSistema>
            ) : undefined
          }
        />
      )
    }
    return (
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <ListaEventos eventos={eventos} hoy={hoy} actualId={evento.id} onElegir={elegir} />
        <DetalleEvento
          evento={evento}
          campus={nombreCampus}
          hoy={hoy}
          editable={puedeEditar}
          guardado={guardado}
          onEditar={() => setFormulario('editar')}
          onArchivar={() => {
            setErrorDialogo(null)
            setPendiente({ tipo: 'archivar', evento })
          }}
          onRestaurar={() => void restaurar()}
          onAgregarHorario={() => setAgregando(true)}
          onQuitarHorario={(horario) => {
            setErrorDialogo(null)
            setPendiente({ tipo: 'quitar', horario })
          }}
          onVentana={ventana}
          onOpcion={opcion}
          onAnuncio={anuncio}
        />
      </div>
    )
  }

  return (
    <PaginaSistema
      breadcrumbs={<MigasEventos />}
      acciones={
        puedeEditar && campusId ? (
          <BotonSistema type="button" tamaño="sm" icono={Plus} aria-haspopup="dialog" onClick={nuevo}>
            Nuevo evento
          </BotonSistema>
        ) : undefined
      }
      className="pb-28 md:pb-0"
    >
      <div className="grid min-w-0 gap-4 md:flex md:items-end md:justify-between">
        <EncabezadoEventos resumen={resumen} />
        {campus.length > 1 && (
          <div className="md:w-[min(100%,280px)]">
            <SelectSistema
              label="Campus"
              opciones={campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
              value={campusId ?? ''}
              onValueChange={(id) => router.push(`/ninos/eventos?campus=${encodeURIComponent(id)}`)}
            />
          </div>
        )}
      </div>

      <PestanasAdmin actual="eventos" campusId={campusId} />

      {!puedeEditar && campus.length > 0 && !errorLectura && (
        <AvisoFormulario tono="info">
          Puedes ver los eventos de este campus. Solo quien configura todas las áreas de Niños del campus puede crearlos o cambiarlos.
        </AvisoFormulario>
      )}

      {cuerpo()}

      <p className="sr-only" role="status" aria-live="polite">
        {guardado.aviso}
      </p>

      {puedeEditar && campusId && (
        <>
          <BotonFlotante onClick={nuevo} icono={Plus} label="Nuevo evento" />
          <FormularioEvento
            abierto={formulario !== null}
            evento={formulario === 'editar' ? evento : null}
            onCerrar={() => setFormulario(null)}
            onGuardar={async (datos) => {
              const esNuevo = formulario !== 'editar' || !evento
              const r = await guardado.guardar(
                () => guardarEvento({ ...datos, campusId, eventoId: esNuevo ? null : evento.id }),
                () => (esNuevo ? `Creaste ${datos.nombre.trim()}. Ahora agrégale sus horarios.` : `Guardaste ${datos.nombre.trim()}.`),
              )
              if (r.ok && esNuevo) setElegido(r.data.id)
              return r
            }}
          />
          {evento && (
            <AgregarHorario
              abierto={agregando}
              evento={evento}
              disponibles={disponibles}
              onCerrar={() => setAgregando(false)}
              onGuardar={(datos) =>
                guardado.guardar(
                  () => agregarHorario({ eventoId: evento.id, ...datos }),
                  () => 'Agregaste un horario al evento.',
                )
              }
            />
          )}
          <DialogoConfirmar
            confirmacion={pendiente ? confirmacionDe(pendiente) : null}
            enviando={enviando}
            error={errorDialogo}
            onCerrar={() => setPendiente(null)}
            onConfirmar={() => void confirmar()}
          />
        </>
      )}
    </PaginaSistema>
  )
}
