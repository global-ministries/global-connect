'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Search, UserCheck } from 'lucide-react'

import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { BotonSistema, InputSistema, SkeletonSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cn } from '@/lib/utils'
import type { Servicio } from '@/lib/platform/ninos/checkin'
import {
  agruparPorEquipo,
  ajustarFecha,
  aplicarCambios,
  contarPlanilla,
  filtrarPorEquipo,
  filtrarPorNombre,
  leerPlanilla,
  mensajeErrorMarcar,
  mensajeErrorPlanilla,
  pendientesDeEquipo,
  resumirEquipos,
  separarPlanilla,
  siguienteEstado,
  TODOS_LOS_EQUIPOS,
  urlVoluntarios,
  type EstadoAsistencia,
  type FilaVoluntario,
  type GrupoEquipo,
  type Planilla,
  type TurnoVoluntarios,
} from '@/lib/platform/ninos/voluntarios'
import { createClient } from '@/lib/supabase/client'

import { EncabezadoNinos } from './encabezado-ninos'
import { EstadoVacio } from './estado-vacio'
import { SelectorServicio } from './selector-servicio'
import { useRefrescoVisible } from './use-refresco'
import { ContadoresVoluntarios } from './voluntarios-contadores'
import { TarjetasEquiposVoluntarios } from './voluntarios-equipos'
import { FilaVoluntarioItem } from './voluntarios-fila'

type Props = {
  turnos: TurnoVoluntarios[]
  servicio: Servicio
  areaId: string | null
  /** Today in Caracas (YYYY-MM-DD): a service on another weekday moves the date to its last day. */
  hoy: string
}

function Desplegable({
  titulo,
  cantidad,
  abierto,
  onAlternar,
  children,
}: {
  titulo: string
  cantidad: number
  abierto: boolean
  onAlternar: () => void
  children: ReactNode
}) {
  return (
    <section className="space-y-2" aria-label={titulo}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={onAlternar}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-border px-4 py-2 text-left text-sm font-medium text-foreground hover:bg-accent"
      >
        <span>
          {titulo} ({cantidad})
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', abierto && 'rotate-180')} aria-hidden />
      </button>
      {abierto && children}
    </section>
  )
}

/** Marks who served in a Niños service (Presente / Avisó / Faltó), per equipo. */
export function VoluntariosClient({ turnos, servicio: servicioInicial, areaId: areaInicial, hoy }: Props) {
  const router = useRouter()
  const toast = useNotificaciones()
  const [servicio, setServicio] = useState<Servicio>(servicioInicial)
  const [planilla, setPlanilla] = useState<Planilla | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [areaElegida, setAreaElegida] = useState<string | null>(areaInicial)
  const [equipoElegido, setEquipoElegido] = useState<string>(TODOS_LOS_EQUIPOS)
  const [busqueda, setBusqueda] = useState('')
  // null = automatic: "Sin turno asignado" opens on its own when nobody is expected.
  const [abiertos, setAbiertos] = useState<{ otros: boolean; sinTurno: boolean | null }>({ otros: false, sinTurno: null })
  const [confirmando, setConfirmando] = useState<string | null>(null)

  // A load answers only if it is the latest one. A background refresh is
  // dropped while marks are in flight or were made after it started, so it
  // never undoes an optimistic mark. `dueno` keeps, per servicio, the last
  // mark that touched it: a failed mark only rolls back the rows it still owns.
  const cargaRef = useRef(0)
  const versionRef = useRef(0)
  const enVueloRef = useRef(0)
  const duenoRef = useRef(new Map<string, number>())

  const cargar = useCallback(
    async (refresco: boolean) => {
      if (!servicio.turnoId) return
      const carga = ++cargaRef.current
      const version = versionRef.current
      const { data, error: err } = await createClient().rpc('ninos_voluntarios_planilla', {
        p_turno_id: servicio.turnoId,
        p_fecha: servicio.fecha,
      })
      if (carga !== cargaRef.current) return
      if (refresco && (version !== versionRef.current || enVueloRef.current > 0)) return
      if (err) {
        setError(mensajeErrorPlanilla(err))
        setPlanilla(null)
        return
      }
      setError(null)
      setPlanilla(leerPlanilla(data))
    },
    [servicio],
  )

  useEffect(() => {
    // Fetch on mount and on service change; state is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar(false)
  }, [cargar])
  useRefrescoVisible(() => void cargar(true))

  const areas = useMemo(() => planilla?.areas ?? [], [planilla])
  const areaId = areas.some((a) => a.id === areaElegida) ? areaElegida : (areas[0]?.id ?? null)
  const filasArea = useMemo(() => (planilla?.voluntarios ?? []).filter((f) => f.area_id === areaId), [planilla, areaId])
  const contadores = useMemo(() => contarPlanilla(filasArea), [filasArea])
  const equipos = useMemo(() => resumirEquipos(filasArea), [filasArea])
  // A card that left the roster (a refresh) falls back to every equipo.
  const equipoId = equipos.some((e) => e.equipoId === equipoElegido) ? equipoElegido : TODOS_LOS_EQUIPOS
  const filasEquipo = useMemo(() => filtrarPorEquipo(filasArea, equipoId), [filasArea, equipoId])
  const buscando = busqueda.trim() !== ''
  const { esperados, otros, sinTurno } = useMemo(() => separarPlanilla(filtrarPorNombre(filasEquipo, busqueda)), [filasEquipo, busqueda])
  const grupos = useMemo(() => agruparPorEquipo(esperados), [esperados])
  const editable = planilla?.editable === true
  const sinTurnoAbierto = buscando || (abiertos.sinTurno ?? grupos.length === 0)

  function cambiarServicio(s: Servicio) {
    const ajustado = ajustarFecha(s, turnos, hoy)
    setServicio(ajustado)
    setPlanilla(null)
    setError(null)
    setConfirmando(null)
    setEquipoElegido(TODOS_LOS_EQUIPOS)
    router.replace(urlVoluntarios(ajustado, areaId))
  }

  function cambiarArea(id: string) {
    setAreaElegida(id)
    setEquipoElegido(TODOS_LOS_EQUIPOS)
    setConfirmando(null)
    router.replace(urlVoluntarios(servicio, id))
  }

  async function marcar(filas: readonly FilaVoluntario[], estado: EstadoAsistencia | null, soloSinMarcar = false) {
    if (!servicio.turnoId || filas.length === 0) return
    const version = ++versionRef.current
    const ids = filas.map((f) => f.servicio_id)
    const previos = new Map(filas.map((f) => [f.servicio_id, f.estado] as const))
    for (const id of ids) duenoRef.current.set(id, version)
    setPlanilla((p) => p && { ...p, voluntarios: aplicarCambios(p.voluntarios, new Map(ids.map((id) => [id, estado] as const))) })

    enVueloRef.current += 1
    const { error: err } = await createClient().rpc('ninos_voluntarios_marcar', {
      p_turno_id: servicio.turnoId,
      p_fecha: servicio.fecha,
      p_servicio_ids: ids,
      // NULL clears the marks; the generated types cannot express a nullable argument.
      p_estado: estado as string,
      p_solo_sin_marcar: soloSinMarcar,
    })
    enVueloRef.current -= 1

    if (err) {
      const deshacer = new Map([...previos].filter(([id]) => duenoRef.current.get(id) === version))
      setPlanilla((p) => p && { ...p, voluntarios: aplicarCambios(p.voluntarios, deshacer) })
      toast.error(mensajeErrorMarcar(err))
      return
    }
    // Someone else may have marked part of "the rest" meanwhile: show what was stored.
    if (soloSinMarcar) void cargar(true)
  }

  function marcarResto(grupo: GrupoEquipo) {
    const pendientes = new Set(pendientesDeEquipo(filasArea.filter((f) => f.equipo_id === grupo.equipoId)))
    setConfirmando(null)
    void marcar(
      filasArea.filter((f) => pendientes.has(f.servicio_id)),
      'ausente',
      true,
    )
  }

  const onMarcar = (f: FilaVoluntario, e: EstadoAsistencia) => void marcar([f], siguienteEstado(f.estado, e))

  return (
    <>
      <EncabezadoNinos titulo="Voluntarios" subtitulo="Marca quién sirvió en cada servicio: Presente, Avisó o Faltó." />

      <div className="space-y-4 md:max-w-2xl">
        <SelectorServicio idPrefijo="voluntarios" turnos={turnos} servicio={servicio} onCambiar={cambiarServicio} />
        {areas.length > 1 && (
          <GrupoPastillas etiqueta="Área">
            {areas.map((a) => (
              <PastillaFiltro key={a.id} etiqueta={a.nombre} activa={a.id === areaId} onClick={() => cambiarArea(a.id)} />
            ))}
          </GrupoPastillas>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {servicio.turnoId && !planilla && !error && (
        <TarjetaSistema className="space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonSistema key={i} alto="44px" />
          ))}
        </TarjetaSistema>
      )}

      {planilla && (
        <>
          <ContadoresVoluntarios contadores={contadores} />

          {!editable && (
            <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Solo se puede marcar hoy o hasta 14 días atrás. Esta lista es de solo lectura.
            </p>
          )}

          {filasArea.length === 0 ? (
            <EstadoVacio icono={UserCheck} titulo="No hay voluntarios en esta área." />
          ) : (
            <div className="space-y-4">
              {equipos.length > 1 && (
                <TarjetasEquiposVoluntarios
                  equipos={equipos}
                  total={filasArea.length}
                  sinMarcar={contadores.sinMarcar}
                  seleccionadoId={equipoId}
                  onSeleccionar={(id) => {
                    setEquipoElegido(id)
                    setConfirmando(null)
                  }}
                />
              )}
              <InputSistema
                id="voluntarios-buscar"
                type="search"
                label="Buscar voluntario"
                placeholder="Nombre o apellido"
                icono={Search}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />

              {buscando && grupos.length + otros.length + sinTurno.length === 0 && (
                <p className="text-sm text-muted-foreground">Nadie coincide con «{busqueda.trim()}».</p>
              )}
              {!buscando && grupos.length === 0 && (
                <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  {sinTurno.length === filasEquipo.length
                    ? `${equipoId === TODOS_LOS_EQUIPOS ? 'Esta área' : 'Este equipo'} todavía no tiene turno asignado a sus voluntarios, así que nadie cuenta como esperado. `
                    : 'A nadie le toca este servicio ese día. '}
                  La dirección o la coordinación de Atención al Voluntario asignan los turnos en Mi equipo. Mientras tanto, puedes marcar a quien sirvió en la lista de abajo.
                </p>
              )}

              {grupos.map((g) => {
                const delEquipo = filasArea.filter((f) => f.equipo_id === g.equipoId && f.esperado)
                const marcados = delEquipo.filter((f) => f.estado !== null).length
                const pendientes = delEquipo.length - marcados
                return (
                  <TarjetaSistema key={g.equipoId} data-testid={`equipo-${g.equipoId}`} className="space-y-1 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <TituloSistema nivel={3}>{g.equipo}</TituloSistema>
                      <span className="text-sm text-muted-foreground">
                        {marcados} de {delEquipo.length} marcados
                      </span>
                    </div>
                    <ul className="divide-y divide-border">
                      {g.filas.map((f) => (
                        <FilaVoluntarioItem key={f.servicio_id} fila={f} editable={editable} onMarcar={onMarcar} />
                      ))}
                    </ul>
                    {editable && pendientes > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {confirmando === g.equipoId ? (
                          <>
                            <span className="text-sm text-foreground">
                              ¿Marcar a {pendientes} {pendientes === 1 ? 'voluntario' : 'voluntarios'} como Faltó?
                            </span>
                            <BotonSistema tamaño="sm" onClick={() => marcarResto(g)}>
                              Sí, marcar
                            </BotonSistema>
                            <BotonSistema tamaño="sm" variante="ghost" onClick={() => setConfirmando(null)}>
                              Cancelar
                            </BotonSistema>
                          </>
                        ) : (
                          <BotonSistema tamaño="sm" variante="outline" onClick={() => setConfirmando(g.equipoId)}>
                            Marcar el resto como Faltó ({pendientes})
                          </BotonSistema>
                        )}
                      </div>
                    )}
                  </TarjetaSistema>
                )
              })}

              {otros.length > 0 && (
                <Desplegable
                  titulo="Otros voluntarios"
                  cantidad={otros.length}
                  abierto={abiertos.otros || buscando}
                  onAlternar={() => setAbiertos((a) => ({ ...a, otros: !a.otros }))}
                >
                  <TarjetaSistema className="p-4">
                    <p className="text-sm text-muted-foreground">Tienen otro turno o no les toca este día. Márcalos si sirvieron.</p>
                    <ul className="divide-y divide-border">
                      {agruparPorEquipo(otros).flatMap((g) =>
                        g.filas.map((f) => (
                          <FilaVoluntarioItem key={f.servicio_id} fila={f} editable={editable} mostrarEquipo onMarcar={onMarcar} />
                        )),
                      )}
                    </ul>
                  </TarjetaSistema>
                </Desplegable>
              )}

              {sinTurno.length > 0 && (
                <Desplegable
                  titulo="Sin turno asignado"
                  cantidad={sinTurno.length}
                  abierto={sinTurnoAbierto}
                  onAlternar={() => setAbiertos((a) => ({ ...a, sinTurno: !sinTurnoAbierto }))}
                >
                  <TarjetaSistema className="p-4">
                    <p className="text-sm text-muted-foreground">Aún no tienen turno. No cuentan como esperados.</p>
                    <ul className="divide-y divide-border">
                      {agruparPorEquipo(sinTurno).flatMap((g) =>
                        g.filas.map((f) => (
                          <FilaVoluntarioItem key={f.servicio_id} fila={f} editable={editable} mostrarEquipo onMarcar={onMarcar} />
                        )),
                      )}
                    </ul>
                  </TarjetaSistema>
                </Desplegable>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
