'use client'

/**
 * Estudiantes › Voluntarios — client island of /estudiantes/voluntarios, the
 * volunteer attendance of Transit, Inside Out and The Living Room (C5 of
 * odd/tasks/estudiantes-fase-b.md) in the planning style (E4a of
 * odd/tasks/estudiantes-estilo-dps.md, S6; artboards 06 / 07 of
 * design/estudiantes-dps, B29–B38).
 *
 * Top to bottom: the header band (crumbs "Estudiantes › Voluntarios" in the
 * desktop header; phone "‹ Estudiantes" and Filtros; the Servicio picker
 * and the date pill stepping between the dates of the service — a dated
 * service only its planned dates —; "N esperados sin marcar · K de M
 * marcados" with its bar; the Ámbito switch from md when there is more than
 * one), then the Equipos bar at the left from lg (an "Equipo" select in the
 * toolbar between md and lg, the phone filters sheet below), the toolbar
 * (Todos · Sin marcar · Presentes · Avisó · Faltó, each count the rows it
 * shows; the search; the autosave status), the read-only notice, and one
 * data region: a sticky band per equipo with its expected volunteers ("n/m"
 * and "Marcar el resto como Faltó (N)" with the confirmation under it), then
 * "Otros voluntarios" and "Sin turno asignado".
 *
 * A mark is saved on tap through a server action and applied at once; a
 * failure rolls back only the rows it still owns and explains why. Another
 * service or date is a `router.replace` (the page loads its roster); the
 * ámbito, equipo, filter and search stay local (the ámbito mirrored into the
 * URL with `history.replaceState`). The roster reloads when the tab comes
 * back and after "Marcar el resto". Every rule lives in
 * lib/platform/estudiantes/voluntarios.ts; the server decides who may mark.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Search, UserCheck, UsersRound } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BotonFiltrosMovil } from '@/components/ui/barra-herramientas'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { GrupoFiltro, HojaFiltros } from '@/components/ui/hoja-filtros'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { EstadoGuardado } from '@/components/dps/estado-guardado'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cargarPlanillaVoluntarios, marcarVoluntarios } from '@/lib/actions/estudiantes-voluntarios.actions'
import {
  FILTROS_VOLUNTARIOS_INICIALES,
  calcularVistaVoluntarios,
  opcionesFechaVoluntarios,
  resolverServicioVoluntariosEstudiantes,
  urlVoluntariosEstudiantes,
  type EquipoBarra,
  type FiltrosVoluntarios,
  type GrupoVistaVoluntarios,
  type MetricaVoluntarios,
  type ServicioVoluntarios,
  type TurnoVoluntariosEstudiantes,
} from '@/lib/platform/estudiantes/voluntarios'
import {
  aplicarCambios,
  ETIQUETA_ESTADO,
  nombreCompleto,
  siguienteEstado,
  TODOS_LOS_EQUIPOS,
  type EstadoAsistencia,
  type FilaVoluntario,
  type Planilla,
} from '@/lib/platform/ninos/voluntarios'
import { cn } from '@/lib/utils'

import { FiltroSegmentado } from '../planificacion/filtro-segmentado'
import {
  BarraHerramientasPlanificacion,
  BarraProgreso,
  EncabezadoPlanificacion,
  LineaFecha,
  MarcoPlanificacion,
  ResumenPlanificacion,
} from '../planificacion/marco-planificacion'
import { MigasEstudiantes } from '../planificacion/migas-estudiantes'
import { PastillaFecha } from '../planificacion/pastilla-fecha'
import { BandaSeccion, CLASE_ACCION_TEXTO, CabeceraColumnas, PieRegion, RegionDatos, TablaPlanificacion } from '../planificacion/region-datos'
import { useEstadoGuardado } from '../planificacion/use-estado-guardado'
import { COLUMNAS_VOLUNTARIOS, FilaVoluntarioEstudiantes } from './fila-voluntario'

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

type FiltroMostrar = 'todos' | MetricaVoluntarios

const FILTROS: readonly { readonly valor: FiltroMostrar; readonly etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'sin-marcar', etiqueta: 'Sin marcar' },
  { valor: 'presentes', etiqueta: 'Presentes' },
  { valor: 'avisos', etiqueta: 'Avisó' },
  { valor: 'faltas', etiqueta: 'Faltó' },
]

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)
const minuscula = (texto: string): string => texto.charAt(0).toLocaleLowerCase('es') + texto.slice(1)
const VOLUNTARIOS = { singular: 'voluntario', plural: 'voluntarios' } as const

const migas = <MigasEstudiantes migas={[{ texto: 'Estudiantes', href: '/estudiantes' }, { texto: 'Voluntarios' }]} />
const ATRAS = { etiqueta: 'Estudiantes', href: '/estudiantes' } as const

function BotonEquipo({ equipo, pulsado, onClick }: { readonly equipo: EquipoBarra; readonly pulsado: boolean; readonly onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={pulsado}
      onClick={onClick}
      className={cn(
        'focus-ring grid min-h-10 w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 rounded-md border px-2 py-1.5 text-left transition-colors',
        pulsado ? 'border-brand/40 bg-brand-tint' : 'border-transparent hover:bg-accent',
      )}
    >
      <span className="truncate text-[13px] font-semibold text-foreground">{equipo.equipo}</span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {equipo.marcados}/{equipo.esperados}
      </span>
      <span className="col-span-2 text-xs">
        {equipo.sinMarcar > 0 ? (
          <span className="font-medium text-warning-text">
            <span className="font-mono tabular-nums">{equipo.sinMarcar}</span> sin marcar
          </span>
        ) : (
          <span className="text-muted-foreground">Todos marcados</span>
        )}
      </span>
    </button>
  )
}

export function VoluntariosClient({ turnos, servicio, planilla: planillaInicial, error, ambitoInicial, hoy }: VoluntariosClientProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const guardado = useEstadoGuardado()
  const [planilla, setPlanilla] = useState<Planilla | null>(planillaInicial)
  const [filtros, setFiltros] = useState<FiltrosVoluntarios>({ ...FILTROS_VOLUNTARIOS_INICIALES, ambito: ambitoInicial })
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [aviso, setAviso] = useState('')

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
  const fechas = [...opcionesFechaVoluntarios(turno, servicio.fecha, hoy)].sort((a, b) => b.valor.localeCompare(a.valor))
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

  async function marcar(filas: readonly FilaVoluntario[], estado: EstadoAsistencia | null, soloSinMarcar = false): Promise<boolean> {
    if (!servicio.turnoId || !servicio.fecha || filas.length === 0) return false
    const version = ++versionRef.current
    const ids = filas.map((f) => f.servicio_id)
    const previos = new Map(filas.map((f) => [f.servicio_id, f.estado] as const))
    for (const id of ids) duenoRef.current.set(id, version)
    setPlanilla((p) => p && { ...p, voluntarios: aplicarCambios(p.voluntarios, new Map(ids.map((id) => [id, estado] as const))) })

    enVueloRef.current += 1
    guardado.empezar()
    const r = await marcarVoluntarios({ turnoId: servicio.turnoId, fecha: servicio.fecha, servicioIds: ids, estado, soloSinMarcar })
    enVueloRef.current -= 1

    if (!r.ok) {
      const deshacer = new Map([...previos].filter(([id]) => duenoRef.current.get(id) === version))
      setPlanilla((p) => p && { ...p, voluntarios: aplicarCambios(p.voluntarios, deshacer) })
      guardado.terminar(false)
      toast.error(r.message)
      return false
    }
    guardado.terminar(true)
    // Someone else may have marked part of "the rest" meanwhile: show what was stored.
    if (soloSinMarcar) void recargar()
    return true
  }

  async function marcarResto(grupo: GrupoVistaVoluntarios): Promise<void> {
    const pendientes = new Set(grupo.pendientes)
    setConfirmando(null)
    if (await marcar((planilla?.voluntarios ?? []).filter((f) => pendientes.has(f.servicio_id)), 'ausente', true)) {
      setAviso(`Marcaste ${pendientes.size} como Faltó en ${grupo.equipo}.`)
    }
  }

  async function marcarUno(f: FilaVoluntario, toque: EstadoAsistencia): Promise<void> {
    const estado = siguienteEstado(f.estado, toque)
    setAviso('')
    if (await marcar([f], estado)) {
      setAviso(estado ? `${nombreCompleto(f)}: ${ETIQUETA_ESTADO[estado]}. Guardado.` : `Quitaste la marca de ${nombreCompleto(f)}.`)
    }
  }

  const onMarcar = (f: FilaVoluntario, e: EstadoAsistencia) => void marcarUno(f, e)
  const ambito = vista?.ambitos.find((a) => a.id === vista.ambitoId)
  const variosEquipos = (vista?.equipos.length ?? 0) > 1
  const variosAmbitos = (vista?.ambitos.length ?? 0) > 1
  const iFecha = fechas.findIndex((f) => f.valor === servicio.fecha)
  const pasoFecha = (i: number, cual: 'anterior' | 'siguiente') => {
    const f = iFecha >= 0 ? fechas[i] : undefined
    return f ? { etiqueta: `Fecha ${cual}, ${minuscula(f.etiqueta)}`, onIr: () => irA({ turnoId: servicio.turnoId, fecha: f.valor }) } : null
  }

  if (turnos.length === 0) {
    return (
      <MarcoPlanificacion migas={migas}>
        <EncabezadoPlanificacion titulo="Voluntarios" antetitulo="Estudiantes" atras={ATRAS} />
        <RegionDatos>
          <TablaPlanificacion>
            <EstadoVacioSistema
              icono={UserCheck}
              titulo="No hay servicios con voluntarios para marcar"
              subtitulo="Aparecen aquí cuando un voluntario de tu equipo tiene turno asignado en Mi equipo."
            />
          </TablaPlanificacion>
        </RegionDatos>
      </MarcoPlanificacion>
    )
  }

  const filas = (lista: readonly FilaVoluntario[], mostrarEquipo = false) =>
    lista.map((f) => <FilaVoluntarioEstudiantes key={f.servicio_id} fila={f} editable={editable} mostrarEquipo={mostrarEquipo} onMarcar={onMarcar} />)

  const selectorAmbito =
    vista && variosAmbitos ? (
      <ControlSegmentado
        etiqueta="Ámbito"
        opciones={vista.ambitos.map((a) => ({ valor: a.id, etiqueta: a.nombre }))}
        valor={vista.ambitoId ?? ''}
        onCambio={(id) => cambiar({ ambito: id, equipo: TODOS_LOS_EQUIPOS })}
      />
    ) : null

  return (
    <MarcoPlanificacion migas={migas}>
      <EncabezadoPlanificacion
        titulo="Voluntarios"
        antetitulo={[ambito?.nombre ?? 'Estudiantes', turno?.nombre].filter(Boolean).join(' · ')}
        atras={ATRAS}
        accionMovil={vista && (variosAmbitos || variosEquipos) ? <BotonFiltrosMovil filtrosActivos={vista.equipoId !== TODOS_LOS_EQUIPOS ? 1 : 0} onClick={() => setHojaAbierta(true)} /> : undefined}
        acciones={selectorAmbito ? <div className="max-md:hidden">{selectorAmbito}</div> : undefined}
      >
        <LineaFecha>
          <div className="w-full md:w-56">
            <SelectSistema
              aria-label="Servicio"
              opciones={turnos.map((t) => ({ valor: t.id, etiqueta: t.nombre }))}
              value={servicio.turnoId ?? ''}
              onValueChange={(id) => irA(resolverServicioVoluntariosEstudiantes({ turno: id }, turnos, hoy))}
            />
          </div>
          {servicio.fecha && fechas.length > 0 && (
            <PastillaFecha
              etiqueta="Fecha"
              anterior={pasoFecha(iFecha + 1, 'anterior')}
              siguiente={pasoFecha(iFecha - 1, 'siguiente')}
              sinAnterior="No hay fechas anteriores"
              sinSiguiente="Es la fecha más reciente"
            >
              {fechas[iFecha]?.etiqueta ?? servicio.fecha}
            </PastillaFecha>
          )}
        </LineaFecha>
        {vista && (
          <>
            <ResumenPlanificacion vivo>
              <strong className="font-mono tabular-nums">{vista.progreso.sinMarcar}</strong>{' '}
              {palabra(vista.progreso.sinMarcar, 'esperado sin marcar', 'esperados sin marcar')} ·{' '}
              <strong>
                <span className="font-mono tabular-nums">{vista.progreso.marcados}</span> de <span className="font-mono tabular-nums">{vista.progreso.esperados}</span>
              </strong>{' '}
              marcados
            </ResumenPlanificacion>
            <BarraProgreso valor={vista.progreso.marcados} total={vista.progreso.esperados} />
          </>
        )}
      </EncabezadoPlanificacion>

      {!vista ? (
        <RegionDatos>
          {error && <AvisoFormulario tono="error" className="mx-4 md:mx-0">{error}</AvisoFormulario>}
          {!servicio.fecha && (
            <TablaPlanificacion>
              <EstadoVacioSistema
                icono={CalendarDays}
                titulo="Todavía no hay fechas de servicio"
                subtitulo="La coordinación las agrega en el Calendario de Mi equipo."
              />
            </TablaPlanificacion>
          )}
        </RegionDatos>
      ) : (
        <div className={cn(variosEquipos && 'lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start')}>
          {variosEquipos && (
            <aside
              aria-label="Equipos"
              className="hidden lg:sticky lg:top-16 lg:block lg:max-h-[calc(100dvh-4rem)] lg:min-h-[calc(100dvh-9rem)] lg:overflow-auto lg:border-r lg:border-border lg:bg-card lg:pt-2.5 lg:pr-3 lg:pb-3 lg:pl-4"
            >
              <h2 className="flex min-h-[26px] items-center text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Equipos</h2>
              <div role="group" aria-label="Equipos" className="space-y-0.5">
                {vista.barraEquipos.map((e) => (
                  <BotonEquipo key={e.equipoId} equipo={e} pulsado={vista.equipoId === e.equipoId} onClick={() => cambiar({ equipo: e.equipoId })} />
                ))}
              </div>
            </aside>
          )}

          <div className="min-w-0">
            <BarraHerramientasPlanificacion>
              <FiltroSegmentado
                etiqueta="Mostrar"
                opciones={FILTROS.map((f) => ({ ...f, cuenta: vista.cuentas[f.valor] }))}
                valor={filtros.metrica ?? 'todos'}
                onCambio={(v) => cambiar({ metrica: v === 'todos' ? null : v })}
              />
              <div className="w-full md:w-60">
                <InputSistema
                  type="search"
                  aria-label="Buscar voluntario"
                  placeholder="Nombre o apellido"
                  icono={Search}
                  value={filtros.q}
                  onChange={(e) => cambiar({ q: e.target.value })}
                />
              </div>
              {variosEquipos && (
                <div className="hidden md:block md:w-56 lg:hidden">
                  <SelectSistema
                    aria-label="Equipo"
                    opciones={vista.barraEquipos.map((e) => ({ valor: e.equipoId, etiqueta: e.equipo }))}
                    value={vista.equipoId}
                    onValueChange={(equipo) => cambiar({ equipo })}
                  />
                </div>
              )}
              <EstadoGuardado estado={guardado.estado} className="md:ml-auto" />
            </BarraHerramientasPlanificacion>

            <RegionDatos>
              {(error || !editable || (vista.esperados.length === 0 && vista.totalAmbito > 0 && !filtros.metrica && !filtros.q.trim())) && (
                <div className="space-y-3 px-4 md:px-0">
                  {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
                  {!editable && <AvisoFormulario>Solo se puede marcar hoy o hasta 14 días atrás. Esta lista es de solo lectura.</AvisoFormulario>}
                  {vista.esperados.length === 0 && vista.totalAmbito > 0 && !filtros.metrica && !filtros.q.trim() && (
                    <AvisoFormulario>
                      A nadie le toca este servicio ese día. La coordinación asigna los turnos en Mi equipo; mientras tanto, puedes marcar abajo a quien sirvió.
                    </AvisoFormulario>
                  )}
                </div>
              )}

              <TablaPlanificacion>
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
                  <>
                    <CabeceraColumnas className={COLUMNAS_VOLUNTARIOS}>
                      <span>Voluntario</span>
                      <span>Rol</span>
                      <span className="hidden lg:block">Estado</span>
                      <span className="pr-2 text-right">Marcar</span>
                    </CabeceraColumnas>

                    {vista.esperados.map((g) => {
                      const pendientes = g.pendientes.length
                      const id = `voluntarios-${g.equipoId}`
                      return (
                        <section key={g.equipoId} aria-labelledby={id}>
                          <BandaSeccion
                            id={id}
                            titulo={g.equipo}
                            cuenta={
                              <>
                                {g.marcados}/{g.total}
                                <span className="sr-only"> marcados</span>
                              </>
                            }
                            accion={
                              editable && pendientes > 0 && confirmando !== g.equipoId ? (
                                <button type="button" onClick={() => setConfirmando(g.equipoId)} className={CLASE_ACCION_TEXTO}>
                                  Marcar el resto como Faltó ({pendientes})
                                </button>
                              ) : undefined
                            }
                          />
                          {editable && pendientes > 0 && confirmando === g.equipoId && (
                            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-danger/10 px-4 py-2.5 text-[13px] text-foreground md:px-3 md:py-2">
                              <span>
                                ¿Marcar a <span className="font-mono tabular-nums">{pendientes}</span> {palabra(pendientes, 'voluntario', 'voluntarios')} como Faltó?
                              </span>
                              <BotonSistema type="button" tamaño="sm" onClick={() => void marcarResto(g)}>
                                Sí, marcar
                              </BotonSistema>
                              <BotonSistema type="button" tamaño="sm" variante="ghost" onClick={() => setConfirmando(null)}>
                                Cancelar
                              </BotonSistema>
                            </div>
                          )}
                          <ul aria-label={`Voluntarios de ${g.equipo}`}>{filas(g.filas)}</ul>
                        </section>
                      )
                    })}

                    {vista.otros.length > 0 && (
                      <section aria-labelledby="voluntarios-otros">
                        <BandaSeccion id="voluntarios-otros" titulo="Otros voluntarios" cuenta={vista.otros.length} pista="· Otro turno o no les toca" />
                        <ul aria-label="Otros voluntarios">{filas(vista.otros, true)}</ul>
                      </section>
                    )}

                    {vista.sinTurno.length > 0 && (
                      <section aria-labelledby="voluntarios-sin-turno">
                        <BandaSeccion id="voluntarios-sin-turno" titulo="Sin turno asignado" cuenta={vista.sinTurno.length} pista="· No cuentan como esperados" />
                        <ul aria-label="Sin turno asignado">{filas(vista.sinTurno, true)}</ul>
                      </section>
                    )}
                  </>
                )}
              </TablaPlanificacion>

              {vista.visibles > 0 && editable && (
                <PieRegion>
                  <span>Se guarda al tocar. El círculo es Presente; «Avisó» y «Faltó» son las otras dos marcas. Toca otra vez la marca activa para quitarla.</span>
                </PieRegion>
              )}
            </RegionDatos>
          </div>

          <HojaFiltros
            abierta={hojaAbierta}
            onCambioAbierta={setHojaAbierta}
            resultados={vista.visibles}
            unidad={VOLUNTARIOS}
            onLimpiar={() => cambiar({ equipo: TODOS_LOS_EQUIPOS })}
          >
            {variosAmbitos && (
              <GrupoFiltro titulo="Ámbito">
                <GrupoPastillas etiqueta="Ámbito">
                  {vista.ambitos.map((a) => (
                    <PastillaFiltro key={a.id} etiqueta={a.nombre} activa={vista.ambitoId === a.id} onClick={() => cambiar({ ambito: a.id, equipo: TODOS_LOS_EQUIPOS })} />
                  ))}
                </GrupoPastillas>
              </GrupoFiltro>
            )}
            {variosEquipos && (
              <GrupoFiltro titulo="Equipo">
                <GrupoPastillas etiqueta="Equipo">
                  {vista.barraEquipos.map((e) => (
                    <PastillaFiltro key={e.equipoId} etiqueta={e.equipo} activa={vista.equipoId === e.equipoId} onClick={() => cambiar({ equipo: e.equipoId })} />
                  ))}
                </GrupoPastillas>
              </GrupoFiltro>
            )}
          </HojaFiltros>

          <p className="sr-only" role="status" aria-live="polite">
            {aviso}
          </p>
        </div>
      )}
    </MarcoPlanificacion>
  )
}
