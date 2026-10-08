'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, ClipboardPlus, Search, UserPlus, Users } from 'lucide-react'

import { TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { BadgeSistema, BotonSistema, InputSistema, SelectSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import {
  alertasDeHijo,
  armarCheckin,
  avisosDeCapacidad,
  mensajeDeErrorCheckin,
  preferidosAGuardar,
  type Servicio,
  type TurnoFila,
} from '@/lib/platform/ninos/checkin'
import { salonParaHijo, type FamiliaEncontrada, type HijoEncontrado, type SalonFila } from '@/lib/platform/ninos/familias-vista'
import { createClient } from '@/lib/supabase/client'

import { registrarIngresoApi } from './api-visita'
import { EditarNinoForm } from './editar-nino-form'
import { EncabezadoNinos } from './encabezado-ninos'
import { EstadoVacio } from './estado-vacio'
import { PanelLateralNinos } from './panel-lateral'
import { PreregistrosPendientes } from './preregistros-pendientes'
import { RetiroPanel } from './retiro-panel'
import { SelectorServicio } from './selector-servicio'
import { useBuscarFamilias } from './use-buscar-familias'
import { useRefrescoVisible } from './use-refresco'

type Props = {
  salones: SalonFila[]
  turnos: TurnoFila[]
  servicio: Servicio
  /** Search to run on load (a family just registered from here). */
  consultaInicial?: string
  /** Family to select after consultaInicial. */
  padreInicial?: string
}

type Ocupacion = { salon_id: string; nombre: string; presentes: number; capacidad: number }

type Resultado = { codigo: string; lineas: string[]; avisos: string[] }

function urlCheckin(s: Servicio): string {
  return `/ninos/checkin?turno=${encodeURIComponent(s.turnoId ?? '')}&fecha=${s.fecha}`
}

/** Mobile-first check-in: pick the service, find a family, choose children and rooms, issue the code. */
export function CheckinClient({ salones, turnos, servicio: servicioInicial, consultaInicial, padreInicial }: Props) {
  const router = useRouter()
  const [servicio, setServicio] = useState<Servicio>(servicioInicial)
  const { q, setQ, familias, error: errorBusqueda, buscando, buscar, limpiar } = useBuscarFamilias()
  const [familia, setFamilia] = useState<FamiliaEncontrada | null>(null)
  const [ingresados, setIngresados] = useState<Record<string, string>>({})
  const [elegidos, setElegidos] = useState<Record<string, boolean>>({})
  const [salonManual, setSalonManual] = useState<Record<string, string>>({})
  const [ocupacion, setOcupacion] = useState<Ocupacion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [pestana, setPestana] = useState<'ingreso' | 'retiro'>('ingreso')
  const [completando, setCompletando] = useState<HijoEncontrado | null>(null)

  const nombreSalon = useCallback((id: string) => salones.find((s) => s.id === id)?.nombre ?? 'salón', [salones])

  const cargarOcupacion = useCallback(async () => {
    if (!servicio.turnoId) return
    const { data } = await createClient().rpc('ninos_ocupacion', { p_turno_id: servicio.turnoId, p_fecha: servicio.fecha })
    setOcupacion((data ?? []) as Ocupacion[])
  }, [servicio])

  useEffect(() => {
    void cargarOcupacion()
  }, [cargarOcupacion])
  useRefrescoVisible(() => void cargarOcupacion())

  const cargarIngresados = useCallback(
    async (f: FamiliaEncontrada | null) => {
      if (!f || !servicio.turnoId || f.hijos.length === 0) {
        setIngresados({})
        return
      }
      const { data } = await createClient()
        .from('ninos_checkins')
        .select('nino_id, codigo')
        .eq('turno_id', servicio.turnoId)
        .eq('fecha', servicio.fecha)
        .in(
          'nino_id',
          f.hijos.map((h) => h.id),
        )
      setIngresados(Object.fromEntries(((data ?? []) as { nino_id: string; codigo: string }[]).map((c) => [c.nino_id, c.codigo])))
    },
    [servicio],
  )

  const elegirFamilia = useCallback(
    (f: FamiliaEncontrada | null) => {
      setFamilia(f)
      setElegidos({})
      setSalonManual({})
      setError(null)
      void cargarIngresados(f)
    },
    [cargarIngresados],
  )

  const buscarYElegir = useCallback(
    async (texto: string, padreId?: string) => {
      const encontradas = await buscar(texto)
      if (!encontradas) return
      const f =
        encontradas.find((x) => x.id === padreId || x.padres.some((p) => p.id === padreId)) ??
        (encontradas.length === 1 ? encontradas[0] : null)
      elegirFamilia(f ?? null)
    },
    [buscar, elegirFamilia],
  )

  useEffect(() => {
    if (consultaInicial) {
      setQ(consultaInicial)
      void buscarYElegir(consultaInicial, padreInicial)
    }
    // Only on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cambiarServicio(s: Servicio) {
    setServicio(s)
    router.replace(urlCheckin(s))
    if (familia) setIngresados({})
  }

  useEffect(() => {
    void cargarIngresados(familia)
    // Re-read who came in when the service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicio])

  function salonDe(hijoId: string): string | null {
    if (salonManual[hijoId]) return salonManual[hijoId]
    const h = familia?.hijos.find((x) => x.id === hijoId)
    if (!h) return null
    const r = salonParaHijo(h, salones, servicio.fecha)
    return r.tipo === 'ninguno' ? null : r.salon.id
  }

  async function registrarIngreso() {
    if (!familia || !servicio.turnoId) return
    const seleccion = familia.hijos
      .filter((h) => h.tiene_ficha && elegidos[h.id] && !ingresados[h.id])
      .map((h) => ({ ninoId: h.id, salonId: salonDe(h.id), nombre: h.nombre }))
    const armado = armarCheckin(seleccion)
    if (!armado.ok) {
      setError(armado.error)
      return
    }
    setError(null)
    setGuardando(true)
    const { data, error: err } = await registrarIngresoApi({
      ninoIds: armado.ninoIds,
      salonIds: armado.salonIds,
      turnoId: servicio.turnoId,
      fecha: servicio.fecha,
    })
    setGuardando(false)
    if (err || !data || data.length === 0) {
      setError(err ? mensajeDeErrorCheckin(err) : mensajeDeErrorCheckin(null))
      return
    }
    void guardarPreferidos(armado.ninoIds, armado.salonIds)
    const nombres = Object.fromEntries(salones.map((s) => [s.id, s.nombre]))
    setResultado({
      codigo: data[0].codigo,
      lineas: data.map((fila) => {
        const h = familia.hijos.find((x) => x.id === fila.nino_id)
        return `${h ? `${h.nombre} ${h.apellido}` : 'Niño'} → ${nombreSalon(fila.salon_id)}`
      }),
      avisos: avisosDeCapacidad(data, nombres),
    })
    void cargarOcupacion()
  }

  /** Remembers a hand-picked room on the ficha so it is preselected next Sunday (same path as Familias). */
  async function guardarPreferidos(ninoIds: string[], salonIds: string[]) {
    if (!familia) return
    const cambios = preferidosAGuardar(
      ninoIds.map((ninoId, i) => {
        const h = familia.hijos.find((x) => x.id === ninoId)
        const r = h ? salonParaHijo(h, salones, servicio.fecha) : null
        return { ninoId, salonId: salonIds[i], sugeridoId: r && r.tipo !== 'ninguno' ? r.salon.id : null }
      }),
    )
    if (cambios.length === 0) return
    const supabase = createClient()
    try {
      await Promise.all(
        cambios.map((c) => supabase.from('ninos_fichas').update({ salon_preferido_id: c.salonId }).eq('usuario_id', c.ninoId)),
      )
    } catch {
      // Best effort: the check-in is already saved; the room is just not remembered.
    }
  }

  function siguienteFamilia() {
    setResultado(null)
    limpiar()
    elegirFamilia(null)
  }

  const turnoActual = turnos.find((t) => t.id === servicio.turnoId)

  const urlNuevaFamilia = `/ninos/familias?nueva=1&volver=checkin&turno=${encodeURIComponent(servicio.turnoId ?? '')}&fecha=${servicio.fecha}`

  return (
    <>
      <EncabezadoNinos
        titulo="Check-in"
        subtitulo="Ingreso y retiro de niños del servicio."
        acciones={
          <Link
            href={urlNuevaFamilia}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-border px-4 py-3 font-medium text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            <UserPlus className="h-5 w-5" aria-hidden />
            Nueva familia
          </Link>
        }
      />

      <div className="space-y-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start md:gap-6 md:space-y-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="min-w-0 space-y-4">
          <SelectorServicio idPrefijo="checkin" turnos={turnos} servicio={servicio} onCambiar={cambiarServicio} />

          <TabsSistema value={pestana} onValueChange={(v) => setPestana(v as 'ingreso' | 'retiro')}>
            <TabsList aria-label="Ingreso o retiro" className="grid w-full grid-cols-2 sm:inline-grid sm:w-auto">
              {(['ingreso', 'retiro'] as const).map((p) => (
                <TabsTrigger key={p} value={p} className="min-h-[44px] px-6" onClick={() => setPestana(p)}>
                  {p === 'ingreso' ? 'Ingreso' : 'Retiro'}
                </TabsTrigger>
              ))}
            </TabsList>
          </TabsSistema>

          {pestana === 'retiro' ? (
            <TarjetaSistema className="p-4 md:p-6">
              <RetiroPanel servicio={servicio} onRetirado={() => void cargarOcupacion()} />
            </TarjetaSistema>
          ) : resultado ? null : (
            <>
              <PreregistrosPendientes
                onConfirmado={(padreId, consulta) => {
                  setQ(consulta)
                  void buscarYElegir(consulta, padreId)
                }}
              />
              <form
                className="flex items-start gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void buscarYElegir(q)
                }}
              >
                <div className="min-w-0 flex-1">
                  <InputSistema
                    type="search"
                    icono={Search}
                    aria-label="Buscar familia"
                    placeholder="Teléfono, nombre del representante o del niño"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <BotonSistema type="submit" icono={Search} disabled={buscando} aria-label="Buscar" />
              </form>

              {errorBusqueda && (
                <p role="alert" className="text-sm text-red-500 dark:text-red-400">
                  {errorBusqueda}
                </p>
              )}
              {familias && familias.length === 0 && (
                <EstadoVacio icono={Users} titulo="No se encontraron familias." subtitulo="Prueba con otro teléfono o nombre, o registra una nueva familia." />
              )}

              {!familia && familias && familias.length > 1 && (
                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {familias.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className="glass-panel flex h-full min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/40"
                        onClick={() => elegirFamilia(f)}
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-foreground">
                            {f.padres.map((p) => `${p.nombre} ${p.apellido}`).join(' · ')}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {f.hijos.map((h) => h.nombre).join(', ') || 'Sin niños registrados'}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {familia && (
                <TarjetaSistema className="space-y-4 p-4 md:p-6">
                  <div className="flex items-start justify-between gap-2">
                    <TituloSistema nivel={3}>{familia.padres.map((p) => `${p.nombre} ${p.apellido}`).join(' · ')}</TituloSistema>
                    {familias && familias.length > 1 && (
                      <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => elegirFamilia(null)}>
                        Otra familia
                      </BotonSistema>
                    )}
                  </div>
                  {familia.hijos.length === 0 && (
                    <TextoSistema variante="sutil" tamaño="sm">
                      Esta familia no tiene niños registrados.
                    </TextoSistema>
                  )}
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {familia.hijos.map((h) => {
                      const codigo = ingresados[h.id]
                      const sugerencia = salonParaHijo(h, salones, servicio.fecha)
                      const salonId = salonDe(h.id)
                      const nombre = `${h.nombre} ${h.apellido}`
                      return (
                        <li key={h.id} data-testid={`nino-${h.id}`} className="space-y-2 p-3">
                          {!h.tiene_ficha ? (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                                {nombre}
                                <BadgeSistema variante="info" tamaño="sm">
                                  Sin ficha de niños
                                </BadgeSistema>
                              </span>
                              <BotonSistema type="button" variante="outline" tamaño="sm" icono={ClipboardPlus} onClick={() => setCompletando(h)}>
                                Completar ficha
                              </BotonSistema>
                            </div>
                          ) : codigo ? (
                            <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                              {nombre}
                              <BadgeSistema variante="success" tamaño="sm">
                                Ya ingresó (código {codigo})
                              </BadgeSistema>
                            </div>
                          ) : (
                            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 font-medium text-foreground">
                              <input
                                type="checkbox"
                                className="h-5 w-5 shrink-0 rounded accent-[var(--brand-primary)]"
                                aria-label={nombre}
                                checked={Boolean(elegidos[h.id])}
                                onChange={(e) => setElegidos((x) => ({ ...x, [h.id]: e.target.checked }))}
                              />
                              {nombre}
                              {h.es_vip_desde && (
                                <BadgeSistema variante="warning" tamaño="sm">
                                  VIP
                                </BadgeSistema>
                              )}
                            </label>
                          )}
                          {alertasDeHijo(h).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {alertasDeHijo(h).map((a) => (
                                <BadgeSistema key={a} variante="error" tamaño="sm">
                                  {a}
                                </BadgeSistema>
                              ))}
                            </div>
                          )}
                          {!codigo && h.tiene_ficha && (
                            <div className="space-y-2">
                              {sugerencia.tipo === 'ninguno' && !salonManual[h.id] && (
                                <p className="flex items-center gap-2 text-sm font-medium text-yellow-700 dark:text-yellow-400">
                                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                                  Sin salón sugerido: asígnalo manualmente
                                </p>
                              )}
                              <SelectSistema
                                aria-label={`Salón de ${h.nombre}`}
                                opciones={[{ valor: '', etiqueta: 'Elige un salón…' }, ...salones.map((s) => ({ valor: s.id, etiqueta: s.nombre }))]}
                                value={salonId ?? ''}
                                onValueChange={(v) => setSalonManual((x) => ({ ...x, [h.id]: v }))}
                              />
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {error && (
                    <p role="alert" className="text-sm text-red-500 dark:text-red-400">
                      {error}
                    </p>
                  )}
                  <BotonSistema
                    type="button"
                    tamaño="lg"
                    className="w-full"
                    disabled={guardando || !servicio.turnoId}
                    onClick={() => void registrarIngreso()}
                  >
                    {guardando ? 'Registrando…' : 'Registrar ingreso'}
                  </BotonSistema>
                </TarjetaSistema>
              )}
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-4 md:sticky md:top-20">
          {pestana === 'ingreso' && resultado && (
            <TarjetaSistema variante="elevated" className="space-y-4 border-2 border-[var(--brand-primary)] p-4 text-center md:p-6" aria-live="polite">
              <p className="text-lg font-medium text-foreground">Código</p>
              <p className="break-all font-mono text-7xl font-black tracking-widest text-[var(--brand-primary)]">{resultado.codigo}</p>
              <p className="text-lg font-medium text-foreground">escríbelo en ambas etiquetas</p>
              <ul className="divide-y divide-border rounded-xl border border-border text-left">
                {resultado.lineas.map((l) => (
                  <li key={l} className="px-3 py-2 text-foreground">
                    {l}
                  </li>
                ))}
              </ul>
              {resultado.avisos.map((a) => (
                <p
                  key={a}
                  role="alert"
                  className="flex items-center justify-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-2 font-medium text-yellow-700 dark:text-yellow-400"
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  {a}
                </p>
              ))}
              <BotonSistema type="button" tamaño="lg" className="w-full" onClick={siguienteFamilia}>
                Siguiente familia
              </BotonSistema>
            </TarjetaSistema>
          )}
          <TarjetaSistema className="overflow-hidden p-0" aria-label="Ocupación de salones" role="region">
            <div className="border-b border-border px-4 py-3">
              <TituloSistema nivel={4}>Ocupación{turnoActual ? ` — ${turnoActual.nombre}` : ''}</TituloSistema>
            </div>
            {ocupacion === null ? (
              <TextoSistema variante="sutil" tamaño="sm" className="px-4 py-3">
                Cargando…
              </TextoSistema>
            ) : ocupacion.length === 0 ? (
              <TextoSistema variante="sutil" tamaño="sm" className="px-4 py-3">
                Sin salones para este servicio.
              </TextoSistema>
            ) : (
              <ul className="grid grid-cols-2 gap-x-4 px-4 py-2 text-sm md:grid-cols-1 lg:grid-cols-2">
                {ocupacion.map((o) => (
                  <li key={o.salon_id} className="flex min-h-9 items-center justify-between gap-2 border-b border-border/50 last:border-0">
                    <span className="truncate text-foreground">{o.nombre}</span>
                    <span
                      className={cn(
                        'tabular-nums',
                        o.presentes > o.capacidad ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground',
                      )}
                    >
                      {o.presentes}/{o.capacidad}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TarjetaSistema>
        </aside>
      </div>

      <PanelLateralNinos
        abierto={completando !== null}
        titulo="Completar ficha"
        descripcion={completando ? `Datos de ${completando.nombre} ${completando.apellido}.` : ''}
        onCerrar={() => setCompletando(null)}
      >
        {completando && (
          <EditarNinoForm
            key={completando.id}
            hijo={completando}
            onCancelar={() => setCompletando(null)}
            onGuardado={() => {
              setCompletando(null)
              // Reload the family so the child can be checked in right away.
              if (familia) void buscarYElegir(q, familia.id)
            }}
          />
        )}
      </PanelLateralNinos>
    </>
  )
}
