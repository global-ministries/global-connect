'use client'

/**
 * DPS › Configuración — client island of /dps/configuracion (T9
 * of odd/tasks/dps-asistencia-pco.md; S6.2, S6.3): four sections, each saved
 * on its own.
 *
 * 1. Horarios de los planes nuevos: 1 to 4 times and the arrival, not after
 *    the first (as a plan's own, T13c), with "Guardar horarios" (only plans
 *    created afterwards take them).
 * 2. Quién arma el plan: the added planners ("Quitar a …") and a person
 *    search to add one; the DPS direction, pastors and admins plan anyway.
 * 3. Quién pasa asistencia: per team "Heredar | Sí | No"; inheriting teams
 *    follow their parent at once.
 * 4. Listas de la programación (S12.2, listas-configuracion.tsx): who may
 *    be picked in Productor, Host, Comunicador and Cantantes; each list
 *    says itself whether the caller edits it, so its refusals never turn
 *    the rest read-only.
 * 5. Recordatorio por correo (T16c, S14.3, recordatorio-configuracion.tsx):
 *    on/off, days before and the preview; the database says whether the
 *    caller edits it (puede_editar), and a 'sin_autoridad' turns the screen
 *    read-only as the other writes do.
 *
 * Every page visitor plans (dps_config_leer requires it), but only a
 * configurator writes (L17). Nobody can tell in advance without a new RPC,
 * so the screen starts editable and the first 'sin_autoridad' turns it
 * read-only, undoing that change. Planner and team changes are applied at
 * once and rolled back on failure. The page column is `relative` so `sr-only`
 * text cannot stretch the document under the shell (L34, see plan-client.tsx).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Plus, Search, Settings2, X } from 'lucide-react'

import {
  BotonSistema,
  InputSistema,
  PaginaSistema,
  SeccionesSistema,
  TarjetaSistema,
} from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import {
  agregarPlanificadorDps,
  buscarPersonasDps,
  guardarHorariosDps,
  guardarPasanAsistenciaDps,
  quitarPlanificadorDps,
  type PersonaEncontradaDps,
} from '@/lib/actions/dps-configuracion.actions'
import {
  MAX_HORARIOS_CONFIG,
  normalizarHorarios,
  recalcularPasanAsistencia,
  validarLlegada,
  type ConfigDps,
  type PasanAsistenciaEquipo,
} from '@/lib/platform/dps/configuracion'
import { listasVacias, type ListasDps } from '@/lib/platform/dps/listas'
import { horariosTexto } from '@/lib/platform/dps/planilla'

import { EstadoGuardado, type EstadoGuardadoValor } from './estado-guardado'
import { ListasConfiguracion } from './listas-configuracion'
import { MigasDps } from './migas-dps'
import { RecordatorioConfiguracion } from './recordatorio-configuracion'

export interface ConfiguracionClientProps {
  readonly config: ConfigDps | null
  /** The lists by position (dps_lista_leer), each with whether the caller edits it. */
  readonly listas?: ListasDps
  /** Why `config` is missing. */
  readonly error: string | null
}

type ValorPasan = 'heredar' | 'si' | 'no'

const SIN_LISTAS = listasVacias()
const ESPERA_BUSQUEDA_MS = 250
const OPCIONES_PASAN = [
  { valor: 'heredar', etiqueta: 'Heredar' },
  { valor: 'si', etiqueta: 'Sí' },
  { valor: 'no', etiqueta: 'No' },
] as const

const aValor = (explicito: boolean | null): ValorPasan => (explicito === null ? 'heredar' : explicito ? 'si' : 'no')
const deValor = (valor: ValorPasan): boolean | null => (valor === 'heredar' ? null : valor === 'si')
const horaCorta = (hora: string): string => hora.replace(/^0(\d)/, '$1')

/** "Sí pasan", "No pasan · como Audio" (inherits from the parent), "Sí pasan · por defecto" (the top). */
function textoPasan(equipo: PasanAsistenciaEquipo, todos: readonly PasanAsistenciaEquipo[]): string {
  const base = equipo.habilitado ? 'Sí pasan' : 'No pasan'
  if (equipo.explicito !== null) return base
  const rutaPadre = equipo.ruta.split(' › ').slice(0, -1).join(' › ')
  const padre = todos.find((e) => e.ruta === rutaPadre)
  return `${base} · ${padre ? `como ${padre.equipo}` : 'por defecto'}`
}

const CLASE_TITULO_SECCION = 'text-base font-[650] text-foreground'
const CLASE_FILA = 'flex min-h-11 items-center gap-3 border-b border-border/60 py-1.5 last:border-b-0'

export function ConfiguracionClient({ config: configInicial, listas = SIN_LISTAS, error }: ConfiguracionClientProps): ReactElement {
  const toast = useNotificaciones()
  const [config, setConfig] = useState<ConfigDps | null>(configInicial)
  const [soloLectura, setSoloLectura] = useState(false)
  const [guardado, setGuardado] = useState<EstadoGuardadoValor>('inactivo')
  const [horarios, setHorarios] = useState<string[]>(() => [...(configInicial?.horarios ?? [])])
  const [llegada, setLlegada] = useState(configInicial?.llegada ?? '')
  const [errorHorarios, setErrorHorarios] = useState<string | null>(null)
  const [guardandoHorarios, setGuardandoHorarios] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<readonly PersonaEncontradaDps[]>([])
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const busquedaRef = useRef(0)
  const enVueloRef = useRef(0)

  useEffect(() => {
    const q = busqueda.trim()
    const pedido = ++busquedaRef.current
    // Under two letters the results are hidden (see the render), not cleared.
    if (q.length < 2 || soloLectura) return
    const temporizador = setTimeout(() => {
      void buscarPersonasDps({ q }).then((r) => {
        if (pedido !== busquedaRef.current) return
        setResultados(r.ok ? r.data : [])
        setErrorBusqueda(r.ok ? null : r.message)
      })
    }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(temporizador)
  }, [busqueda, soloLectura])

  const yaPlanifican = useMemo(() => new Set(config?.planificadores.map((p) => p.personaId)), [config])
  const candidatos = resultados.filter((r) => !yaPlanifican.has(r.personaId))

  function empezar(): void {
    enVueloRef.current += 1
    setGuardado('guardando')
  }

  /** true when it saved; a 'sin_autoridad' turns the screen read-only. */
  function terminar(r: { ok: true } | { ok: false; message: string; codigo: string | null }): boolean {
    enVueloRef.current -= 1
    if (r.ok) {
      if (enVueloRef.current === 0) setGuardado((g) => (g === 'error' ? g : 'guardado'))
      return true
    }
    setGuardado('error')
    if (r.codigo === 'sin_autoridad') setSoloLectura(true)
    else toast.error(r.message)
    return false
  }

  /** A list says itself who edits it: a refusal is explained, the rest stays editable. */
  function terminarLista(ok: boolean, mensaje?: string): void {
    enVueloRef.current -= 1
    if (ok) {
      if (enVueloRef.current === 0) setGuardado((g) => (g === 'error' ? g : 'guardado'))
      return
    }
    setGuardado('error')
    if (mensaje) toast.error(mensaje)
  }

  async function guardarHorarios(): Promise<void> {
    if (!config) return
    const h = normalizarHorarios(horarios)
    if (!h.ok) return setErrorHorarios(h.mensaje)
    const l = validarLlegada(llegada, h.horarios[0])
    if (!l.ok) return setErrorHorarios(l.mensaje)
    setErrorHorarios(null)
    setGuardandoHorarios(true)
    empezar()
    const r = await guardarHorariosDps({ horarios: h.horarios, llegada: l.llegada })
    setGuardandoHorarios(false)
    if (terminar(r) && r.ok) {
      setConfig((c) => c && { ...c, horarios: r.data.horarios, llegada: r.data.llegada })
      setHorarios(r.data.horarios)
      setLlegada(r.data.llegada)
    } else {
      setHorarios([...config.horarios])
      setLlegada(config.llegada)
    }
  }

  async function agregar(persona: PersonaEncontradaDps): Promise<void> {
    empezar()
    const r = await agregarPlanificadorDps({ personaId: persona.personaId })
    if (terminar(r) && r.ok) {
      setConfig(r.data)
      setBusqueda('')
    }
  }

  async function quitar(personaId: string): Promise<void> {
    if (!config) return
    const antes = config.planificadores
    setConfig((c) => c && { ...c, planificadores: c.planificadores.filter((p) => p.personaId !== personaId) })
    empezar()
    const r = await quitarPlanificadorDps({ personaId })
    if (!terminar(r)) setConfig((c) => c && { ...c, planificadores: antes })
  }

  async function cambiarPasan(equipoId: string, valor: ValorPasan): Promise<void> {
    if (!config) return
    const antes = config.pasanAsistencia
    setConfig((c) => c && { ...c, pasanAsistencia: recalcularPasanAsistencia(c.pasanAsistencia, equipoId, deValor(valor)) })
    empezar()
    const r = await guardarPasanAsistenciaDps({ equipoId, habilitado: deValor(valor) })
    if (!terminar(r)) setConfig((c) => c && { ...c, pasanAsistencia: antes })
  }

  const migas = <MigasDps actual="Configuración" />
  const encabezado = (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-2xl md:font-[650] md:tracking-[-0.02em]">Configuración de DPS</h1>
        <EstadoGuardado estado={guardado} />
      </div>
      <p className="text-[15px] text-muted-foreground">
        Horarios de los planes, quién arma el plan, quién pasa asistencia, el recordatorio por correo y las listas de la programación.
      </p>
    </div>
  )

  if (!config) {
    return (
      <PaginaSistema breadcrumbs={migas} className="relative">
        {encabezado}
        <EstadoVacioSistema icono={Settings2} titulo="No se pudo cargar la configuración" subtitulo={error ?? 'Actualiza la página.'} />
      </PaginaSistema>
    )
  }

  return (
    <PaginaSistema breadcrumbs={migas} className="relative pb-28 md:pb-0">
      {encabezado}

      {soloLectura && (
        <AvisoFormulario>
          Puedes ver la configuración, pero solo la dirección de DPS, un pastor o un administrador puede cambiarla.
        </AvisoFormulario>
      )}

      <SeccionesSistema>
        <TarjetaSistema>
          <section aria-labelledby="dps-config-horarios" className="space-y-4">
            <div className="space-y-1">
              <h2 id="dps-config-horarios" className={CLASE_TITULO_SECCION}>
                Horarios de los planes nuevos
              </h2>
              <p className="text-[13px] text-muted-foreground">Los planes que se creen desde ahora toman estos horarios y la llegada. Los que ya existen no cambian.</p>
            </div>

            {soloLectura ? (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Horarios</dt>
                <dd className="font-mono tabular-nums">{horariosTexto(config.horarios)}</dd>
                <dt className="text-muted-foreground">Llegada</dt>
                <dd className="font-mono tabular-nums">{horaCorta(config.llegada)}</dd>
              </dl>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void guardarHorarios()
                }}
              >
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3">
                  {horarios.map((h, i) => (
                    <div key={i} className="flex items-end gap-1">
                      <div className="min-w-0 flex-1">
                        <InputSistema
                          type="time"
                          label={`Horario ${i + 1}`}
                          value={h}
                          onChange={(e) => setHorarios((actual) => actual.map((x, j) => (j === i ? e.target.value : x)))}
                          className="font-mono tabular-nums"
                        />
                      </div>
                      {horarios.length > 1 && (
                        <BotonSistema
                          type="button"
                          variante="ghost"
                          soloIcono
                          icono={X}
                          aria-label={`Quitar el horario ${i + 1}`}
                          onClick={() => setHorarios((actual) => actual.filter((_, j) => j !== i))}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {horarios.length < MAX_HORARIOS_CONFIG && (
                  <BotonSistema type="button" variante="outline" tamaño="sm" icono={Plus} onClick={() => setHorarios((actual) => [...actual, ''])}>
                    Agregar horario
                  </BotonSistema>
                )}
                <div className="max-w-[10rem]">
                  <InputSistema type="time" label="Llegada" value={llegada} onChange={(e) => setLlegada(e.target.value)} className="font-mono tabular-nums" />
                </div>
                {errorHorarios && <AvisoFormulario tono="error">{errorHorarios}</AvisoFormulario>}
                <BotonSistema type="submit" tamaño="sm" cargando={guardandoHorarios} disabled={guardandoHorarios}>
                  Guardar horarios
                </BotonSistema>
              </form>
            )}
          </section>
        </TarjetaSistema>

        <TarjetaSistema>
          <section aria-labelledby="dps-config-planificadores" className="space-y-4">
            <div className="space-y-1">
              <h2 id="dps-config-planificadores" className={CLASE_TITULO_SECCION}>
                Quién arma el plan
              </h2>
              <p className="text-[13px] text-muted-foreground">
                La dirección de DPS, los pastores y los administradores lo arman siempre. Agrega aquí a alguien más, como la dirección de Producción
                Técnica o Creativa.
              </p>
            </div>

            {config.planificadores.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nadie más arma el plan todavía.</p>
            ) : (
              <ul aria-label="Planificadores">
                {config.planificadores.map((p) => (
                  <li key={p.personaId} className={CLASE_FILA}>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nombre}</span>
                    {!soloLectura && (
                      <BotonSistema type="button" variante="ghost" tamaño="sm" aria-label={`Quitar a ${p.nombre}`} onClick={() => void quitar(p.personaId)}>
                        Quitar
                      </BotonSistema>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!soloLectura && (
              <div className="space-y-2">
                <InputSistema
                  type="search"
                  label="Agregar planificador"
                  placeholder="Buscar por nombre"
                  icono={Search}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                {busqueda.trim().length >= 2 && errorBusqueda && <p className="text-[13px] text-danger-text">{errorBusqueda}</p>}
                {busqueda.trim().length >= 2 && !errorBusqueda && candidatos.length > 0 && (
                  <ul aria-label="Resultados de la búsqueda">
                    {candidatos.map((c) => (
                      <li key={c.personaId} className={CLASE_FILA}>
                        <span className="min-w-0 flex-1 truncate text-sm">{c.nombre}</span>
                        <BotonSistema type="button" variante="outline" tamaño="sm" aria-label={`Agregar a ${c.nombre}`} onClick={() => void agregar(c)}>
                          Agregar
                        </BotonSistema>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </TarjetaSistema>
      </SeccionesSistema>

      <TarjetaSistema>
        <section aria-labelledby="dps-config-asistencia" className="space-y-4">
          <div className="space-y-1">
            <h2 id="dps-config-asistencia" className={CLASE_TITULO_SECCION}>
              Quién pasa asistencia
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Los coordinadores de cada equipo pasan la asistencia de su equipo; quien arma el plan la pasa en todos. «Heredar» toma lo del equipo de
              arriba.
            </p>
          </div>
          {config.pasanAsistencia.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No hay equipos de DPS activos.</p>
          ) : (
            <ul aria-label="Equipos de DPS">
              {config.pasanAsistencia.map((e) => (
                <li key={e.equipoId} className={`${CLASE_FILA} flex-wrap justify-between`} style={{ paddingLeft: `${Math.min(e.profundidad, 6) * 16}px` }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.equipo}</p>
                    <p data-testid={`pasa-${e.equipoId}`} className="truncate text-[13px] text-muted-foreground">
                      {textoPasan(e, config.pasanAsistencia)}
                    </p>
                  </div>
                  {!soloLectura && (
                    <ControlSegmentado
                      etiqueta={`Quién pasa asistencia en ${e.equipo}`}
                      opciones={OPCIONES_PASAN}
                      valor={aValor(e.explicito)}
                      onCambio={(valor) => void cambiarPasan(e.equipoId, valor)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </TarjetaSistema>

      {config.recordatorio && (
        <RecordatorioConfiguracion recordatorio={config.recordatorio} soloLectura={soloLectura} onEmpezar={empezar} onTerminar={terminar} />
      )}

      <ListasConfiguracion listas={listas} onEmpezar={empezar} onTerminar={terminarLista} />
    </PaginaSistema>
  )
}
