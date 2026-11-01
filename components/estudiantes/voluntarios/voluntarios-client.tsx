'use client'

/**
 * Estudiantes › Voluntarios — client island of /estudiantes/voluntarios, the
 * volunteer attendance of Transit, Inside Out and The Living Room (C5 of
 * odd/tasks/estudiantes-fase-b.md; list anatomy of
 * docs/design-system/patterns.md#list-screen-anatomy).
 *
 * Top to bottom: header (breadcrumbs "Estudiantes / Voluntarios"), hero
 * (title and "Domingo 25 oct · Domingo 9:00 · 12 esperados · 3 sin marcar"),
 * the Servicio / Fecha pickers (a dated service offers only its planned
 * dates) and the Ámbito one when there is more than one, the read-only
 * notice, the search, the metrics that filter, the equipo cards and the rows:
 * the expected volunteers by equipo (with "Marcar el resto como Faltó"),
 * "Otros voluntarios" and "Sin turno asignado".
 *
 * A mark is saved on tap through a server action and applied at once; a
 * failure rolls back only the rows it still owns and explains why. Another
 * service or date is a `router.replace` (the page loads its roster); the
 * ámbito, equipo, metric and search stay local (the ámbito mirrored into the
 * URL with `history.replaceState`). The roster reloads when the tab comes
 * back and after "Marcar el resto". Every rule lives in
 * lib/platform/estudiantes/voluntarios.ts; the server decides who may mark.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Search, UserCheck, UsersRound } from 'lucide-react'

import { BotonSistema, InputSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'
import { TarjetasFiltro, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cargarPlanillaVoluntarios, marcarVoluntarios } from '@/lib/actions/estudiantes-voluntarios.actions'
import { MAX_EQUIPOS_EN_TARJETAS } from '@/lib/platform/dream-team/mi-equipo-vista'
import { fechaLarga } from '@/lib/platform/estudiantes/lista-vista'
import {
  FILTROS_VOLUNTARIOS_INICIALES,
  calcularVistaVoluntarios,
  opcionesFechaVoluntarios,
  resolverServicioVoluntariosEstudiantes,
  urlVoluntariosEstudiantes,
  type FiltrosVoluntarios,
  type GrupoVistaVoluntarios,
  type MetricaVoluntarios,
  type ServicioVoluntarios,
  type TurnoVoluntariosEstudiantes,
  type VistaVoluntarios,
} from '@/lib/platform/estudiantes/voluntarios'
import {
  aplicarCambios,
  siguienteEstado,
  TODOS_LOS_EQUIPOS,
  type EstadoAsistencia,
  type FilaVoluntario,
  type Planilla,
} from '@/lib/platform/ninos/voluntarios'

import { TituloSeccion, ListaInset } from '../filas-inset'
import { FilaVoluntarioEstudiantes } from './fila-voluntario'

export interface VoluntariosClientProps {
  readonly turnos: readonly TurnoVoluntariosEstudiantes[]
  readonly servicio: ServicioVoluntarios
  /** The roster loaded by the page; null when there is none or it failed. */
  readonly planilla: Planilla | null
  /** Why `planilla` is missing. */
  readonly error: string | null
  readonly ambitoInicial: string | null
  /** Today in Caracas (YYYY-MM-DD). */
  readonly hoy: string
}

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)
const VOLUNTARIOS = { singular: 'voluntario', plural: 'voluntarios' } as const

function Migas(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="flex min-w-0 items-center gap-0.5">
          <Link
            href="/estudiantes"
            className="focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11"
          >
            Estudiantes
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            /
          </span>
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            Voluntarios
          </span>
        </li>
      </ol>
    </nav>
  )
}

function Resumen({ turno, fecha, vista }: { readonly turno: TurnoVoluntariosEstudiantes | undefined; readonly fecha: string | null; readonly vista: VistaVoluntarios | null }): ReactElement | null {
  const linea = [fecha ? fechaLarga(fecha) : null, turno?.nombre].filter(Boolean).join(' · ')
  if (!vista) return linea ? <>{linea}</> : null
  const { esperados, sinMarcar } = vista.contadores
  return (
    <>
      {linea} · <strong className="font-mono tabular-nums">{esperados}</strong> {palabra(esperados, 'esperado', 'esperados')} ·{' '}
      <strong className="font-mono tabular-nums">{sinMarcar}</strong> sin marcar
    </>
  )
}

function Encabezado({ resumen }: { readonly resumen: ReactElement | null }): ReactElement {
  return (
    <>
      <div data-slot="cabecera-movil" className="md:hidden">
        <div className="-mx-2 -mt-2 mb-1">
          <BotonAtrasMovil atras={{ etiqueta: 'Estudiantes', href: '/estudiantes' }} className="max-w-[75%]" />
        </div>
        <TituloGrande titulo="Voluntarios" nivel={2} resumen={resumen} />
      </div>
      <div className="hidden min-w-0 md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Voluntarios</h1>
        {resumen && <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{resumen}</p>}
      </div>
    </>
  )
}

function aTarjeta(id: string, label: string, total: number, sinMarcar: number): TarjetaFiltro {
  return { id, label, subtitulo: null, total, badge: sinMarcar > 0 ? `${sinMarcar} sin marcar` : null }
}

export function VoluntariosClient({ turnos, servicio, planilla: planillaInicial, error, ambitoInicial, hoy }: VoluntariosClientProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const [planilla, setPlanilla] = useState<Planilla | null>(planillaInicial)
  const [filtros, setFiltros] = useState<FiltrosVoluntarios>({ ...FILTROS_VOLUNTARIOS_INICIALES, ambito: ambitoInicial })
  const [confirmando, setConfirmando] = useState<string | null>(null)

  // A reload answers only if it is the latest one and no mark started after
  // it or is in flight, so it never undoes an optimistic mark. `dueno` keeps,
  // per servicio, the last mark that touched it: a failed mark only rolls
  // back the rows it still owns.
  const cargaRef = useRef(0)
  const versionRef = useRef(0)
  const enVueloRef = useRef(0)
  const duenoRef = useRef(new Map<string, number>())

  const recargar = useCallback(async () => {
    if (!servicio.turnoId || !servicio.fecha) return
    const carga = ++cargaRef.current
    const version = versionRef.current
    const r = await cargarPlanillaVoluntarios({ turnoId: servicio.turnoId, fecha: servicio.fecha })
    if (carga !== cargaRef.current || version !== versionRef.current || enVueloRef.current > 0) return
    if (r.ok) setPlanilla(r.data)
  }, [servicio.turnoId, servicio.fecha])

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') void recargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [recargar])

  const turno = turnos.find((t) => t.id === servicio.turnoId)
  const vista = useMemo(() => (planilla ? calcularVistaVoluntarios(planilla, filtros) : null), [planilla, filtros])
  const fechas = opcionesFechaVoluntarios(turno, servicio.fecha, hoy)
  const editable = planilla?.editable === true

  function irA(siguiente: ServicioVoluntarios): void {
    router.replace(urlVoluntariosEstudiantes(siguiente, filtros.ambito), { scroll: false })
  }

  function cambiar(parche: Partial<FiltrosVoluntarios>): void {
    const siguiente = { ...filtros, ...parche }
    setFiltros(siguiente)
    setConfirmando(null)
    if ('ambito' in parche) {
      window.history.replaceState(window.history.state, '', urlVoluntariosEstudiantes(servicio, siguiente.ambito))
    }
  }

  async function marcar(filas: readonly FilaVoluntario[], estado: EstadoAsistencia | null, soloSinMarcar = false): Promise<void> {
    if (!servicio.turnoId || !servicio.fecha || filas.length === 0) return
    const version = ++versionRef.current
    const ids = filas.map((f) => f.servicio_id)
    const previos = new Map(filas.map((f) => [f.servicio_id, f.estado] as const))
    for (const id of ids) duenoRef.current.set(id, version)
    setPlanilla((p) => p && { ...p, voluntarios: aplicarCambios(p.voluntarios, new Map(ids.map((id) => [id, estado] as const))) })

    enVueloRef.current += 1
    const r = await marcarVoluntarios({ turnoId: servicio.turnoId, fecha: servicio.fecha, servicioIds: ids, estado, soloSinMarcar })
    enVueloRef.current -= 1

    if (!r.ok) {
      const deshacer = new Map([...previos].filter(([id]) => duenoRef.current.get(id) === version))
      setPlanilla((p) => p && { ...p, voluntarios: aplicarCambios(p.voluntarios, deshacer) })
      toast.error(r.message)
      return
    }
    // Someone else may have marked part of "the rest" meanwhile: show what was stored.
    if (soloSinMarcar) void recargar()
  }

  function marcarResto(grupo: GrupoVistaVoluntarios): void {
    const pendientes = new Set(grupo.pendientes)
    setConfirmando(null)
    void marcar((planilla?.voluntarios ?? []).filter((f) => pendientes.has(f.servicio_id)), 'ausente', true)
  }

  const onMarcar = (f: FilaVoluntario, e: EstadoAsistencia) => void marcar([f], siguienteEstado(f.estado, e))
  const resumen = <Resumen turno={turno} fecha={servicio.fecha} vista={vista} />

  if (turnos.length === 0) {
    return (
      <PaginaSistema breadcrumbs={<Migas />}>
        <Encabezado resumen={null} />
        <EstadoVacioSistema
          icono={UserCheck}
          titulo="No hay servicios con voluntarios para marcar"
          subtitulo="Aparecen aquí cuando un voluntario de tu equipo tiene turno asignado en Mi equipo."
        />
      </PaginaSistema>
    )
  }

  const filas = (lista: readonly FilaVoluntario[], mostrarEquipo = false) =>
    lista.map((f) => <FilaVoluntarioEstudiantes key={f.servicio_id} fila={f} editable={editable} mostrarEquipo={mostrarEquipo} onMarcar={onMarcar} />)

  return (
    <PaginaSistema breadcrumbs={<Migas />} className="pb-28 md:pb-0">
      <Encabezado resumen={resumen} />

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-[720px]">
        <SelectSistema
          label="Servicio"
          opciones={turnos.map((t) => ({ valor: t.id, etiqueta: t.nombre }))}
          value={servicio.turnoId ?? ''}
          onValueChange={(id) => irA(resolverServicioVoluntariosEstudiantes({ turno: id }, turnos, hoy))}
        />
        {fechas.length > 0 && (
          <SelectSistema label="Fecha" opciones={fechas} value={servicio.fecha ?? ''} onValueChange={(fecha) => irA({ turnoId: servicio.turnoId, fecha })} />
        )}
        {vista && vista.ambitos.length > 1 && (
          <SelectSistema
            label="Ámbito"
            opciones={vista.ambitos.map((a) => ({ valor: a.id, etiqueta: a.nombre }))}
            value={vista.ambitoId ?? ''}
            onValueChange={(ambito) => cambiar({ ambito, equipo: TODOS_LOS_EQUIPOS })}
          />
        )}
      </div>

      {!servicio.fecha && (
        <EstadoVacioSistema
          icono={CalendarDays}
          titulo="Todavía no hay fechas de servicio"
          subtitulo="La coordinación las agrega en el Calendario de Mi equipo."
        />
      )}

      {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}

      {vista && (
        <>
          {!editable && <AvisoFormulario>Solo se puede marcar hoy o hasta 14 días atrás. Esta lista es de solo lectura.</AvisoFormulario>}

          <InputSistema
            type="search"
            label="Buscar voluntario"
            placeholder="Nombre o apellido"
            icono={Search}
            value={filtros.q}
            onChange={(e) => cambiar({ q: e.target.value })}
          />

          <MetricasAtencion
            etiqueta="Asistencia del servicio"
            metricas={vista.metricas}
            onAlternar={(id) => cambiar({ metrica: filtros.metrica === id ? null : (id as MetricaVoluntarios) })}
          />

          {vista.equipos.length > 1 && (
            <TarjetasFiltro
              todas={aTarjeta(TODOS_LOS_EQUIPOS, 'Todos los equipos', vista.totalAmbito, vista.contadores.sinMarcar)}
              items={vista.equipos.map((e) => aTarjeta(e.equipoId, e.equipo, e.total, e.sinMarcar))}
              modoCompacto={vista.equipos.length > MAX_EQUIPOS_EN_TARJETAS}
              seleccionadoId={vista.equipoId}
              onSeleccionar={(equipo) => cambiar({ equipo })}
              unidad={VOLUNTARIOS}
              etiqueta="Equipos"
              buscarEtiqueta="Buscar equipo"
            />
          )}

          {vista.totalAmbito === 0 ? (
            <EstadoVacioSistema icono={UsersRound} titulo="No hay voluntarios en este servicio" subtitulo="Asigna el turno a tus voluntarios en Mi equipo." />
          ) : vista.visibles === 0 ? (
            <EstadoVacioSistema
              icono={UsersRound}
              titulo="Ningún voluntario coincide"
              subtitulo="Quita el filtro o cambia la búsqueda."
              accion={
                <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => cambiar({ metrica: null, q: '' })}>
                  Limpiar todo
                </BotonSistema>
              }
            />
          ) : (
            <div className="space-y-6">
              {vista.esperados.length === 0 && !filtros.metrica && !filtros.q.trim() && (
                <AvisoFormulario>
                  A nadie le toca este servicio ese día. La coordinación asigna los turnos en Mi equipo; mientras tanto, puedes marcar abajo a quien sirvió.
                </AvisoFormulario>
              )}

              {vista.esperados.map((g) => {
                const pendientes = g.pendientes.length
                return (
                  <section key={g.equipoId} aria-labelledby={`voluntarios-${g.equipoId}`} className="space-y-2">
                    <TituloSeccion id={`voluntarios-${g.equipoId}`} texto={g.equipo} pista={`${g.marcados} de ${g.total} marcados`} />
                    <ListaInset etiqueta={`Voluntarios de ${g.equipo}`}>{filas(g.filas)}</ListaInset>
                    {editable && pendientes > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {confirmando === g.equipoId ? (
                          <>
                            <span className="text-sm text-foreground">
                              ¿Marcar a {pendientes} {palabra(pendientes, 'voluntario', 'voluntarios')} como Faltó?
                            </span>
                            <BotonSistema type="button" tamaño="sm" onClick={() => marcarResto(g)}>
                              Sí, marcar
                            </BotonSistema>
                            <BotonSistema type="button" tamaño="sm" variante="ghost" onClick={() => setConfirmando(null)}>
                              Cancelar
                            </BotonSistema>
                          </>
                        ) : (
                          <BotonSistema type="button" tamaño="sm" variante="outline" onClick={() => setConfirmando(g.equipoId)}>
                            Marcar el resto como Faltó ({pendientes})
                          </BotonSistema>
                        )}
                      </div>
                    )}
                  </section>
                )
              })}

              {vista.otros.length > 0 && (
                <section aria-labelledby="voluntarios-otros" className="space-y-2">
                  <TituloSeccion id="voluntarios-otros" texto="Otros voluntarios" cantidad={vista.otros.length} pista="Otro turno o no les toca" />
                  <ListaInset etiqueta="Otros voluntarios">{filas(vista.otros, true)}</ListaInset>
                </section>
              )}

              {vista.sinTurno.length > 0 && (
                <section aria-labelledby="voluntarios-sin-turno" className="space-y-2">
                  <TituloSeccion id="voluntarios-sin-turno" texto="Sin turno asignado" cantidad={vista.sinTurno.length} pista="No cuentan como esperados" />
                  <ListaInset etiqueta="Sin turno asignado">{filas(vista.sinTurno, true)}</ListaInset>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </PaginaSistema>
  )
}
