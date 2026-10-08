'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Search, UserPlus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  alertasDeHijo,
  armarCheckin,
  avisosDeCapacidad,
  mensajeDeErrorCheckin,
  preferidosAGuardar,
  type Servicio,
  type TurnoFila,
} from '@/lib/platform/ninos/checkin'
import { salonParaHijo, type FamiliaEncontrada, type SalonFila } from '@/lib/platform/ninos/familias-vista'
import { createClient } from '@/lib/supabase/client'

import { SELECT_CLASS } from './campos-nino'
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
      const f = encontradas.find((x) => x.id === padreId) ?? (encontradas.length === 1 ? encontradas[0] : null)
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
      .filter((h) => elegidos[h.id] && !ingresados[h.id])
      .map((h) => ({ ninoId: h.id, salonId: salonDe(h.id), nombre: h.nombre }))
    const armado = armarCheckin(seleccion)
    if (!armado.ok) {
      setError(armado.error)
      return
    }
    setError(null)
    setGuardando(true)
    const { data, error: err } = await createClient().rpc('ninos_checkin', {
      p_nino_ids: armado.ninoIds,
      p_salon_ids: armado.salonIds,
      p_turno_id: servicio.turnoId,
      p_fecha: servicio.fecha,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Check-in</h1>
        <Button asChild variant="outline" className="h-11">
          <Link href={`/ninos/familias?nueva=1&volver=checkin&turno=${encodeURIComponent(servicio.turnoId ?? '')}&fecha=${servicio.fecha}`}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden />
            Nueva familia
          </Link>
        </Button>
      </div>

      <SelectorServicio idPrefijo="checkin" turnos={turnos} servicio={servicio} onCambiar={cambiarServicio} />

      <div role="tablist" aria-label="Ingreso o retiro" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(['ingreso', 'retiro'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pestana === p}
            className={`h-10 rounded-md text-sm font-medium ${pestana === p ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setPestana(p)}
          >
            {p === 'ingreso' ? 'Ingreso' : 'Retiro'}
          </button>
        ))}
      </div>

      {pestana === 'retiro' ? (
        <RetiroPanel servicio={servicio} onRetirado={() => void cargarOcupacion()} />
      ) : resultado ? (
        <section className="space-y-4 rounded-lg border-2 border-primary p-4 text-center" aria-live="polite">
          <p className="text-lg font-medium">Código</p>
          <p className="font-mono text-7xl font-black tracking-widest">{resultado.codigo}</p>
          <p className="text-lg font-medium">escríbelo en ambas etiquetas</p>
          <ul className="space-y-1 text-left">
            {resultado.lineas.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {resultado.avisos.map((a) => (
            <p key={a} role="alert" className="flex items-center justify-center gap-2 font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {a}
            </p>
          ))}
          <Button className="h-12 w-full text-base" onClick={siguienteFamilia}>
            Siguiente familia
          </Button>
        </section>
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void buscarYElegir(q)
            }}
          >
            <Input
              aria-label="Buscar familia"
              placeholder="Teléfono, nombre del representante o del niño"
              className="h-11"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" className="h-11" disabled={buscando} aria-label="Buscar">
              <Search className="h-4 w-4" aria-hidden />
            </Button>
          </form>

          {errorBusqueda && (
            <p role="alert" className="text-sm text-destructive">
              {errorBusqueda}
            </p>
          )}
          {familias && familias.length === 0 && <p className="text-sm text-muted-foreground">No se encontraron familias.</p>}

          {!familia && familias && familias.length > 1 && (
            <ul className="space-y-2">
              {familias.map((f) => (
                <li key={f.id}>
                  <button type="button" className="w-full rounded-lg border p-3 text-left" onClick={() => elegirFamilia(f)}>
                    <span className="font-semibold">
                      {f.nombre} {f.apellido}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {f.hijos.map((h) => h.nombre).join(', ') || 'Sin niños registrados'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {familia && (
            <section className="space-y-3 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">
                  {familia.nombre} {familia.apellido}
                </p>
                {familias && familias.length > 1 && (
                  <button type="button" className="text-sm text-muted-foreground underline" onClick={() => elegirFamilia(null)}>
                    Otra familia
                  </button>
                )}
              </div>
              {familia.hijos.length === 0 && <p className="text-sm text-muted-foreground">Esta familia no tiene niños registrados.</p>}
              <ul className="space-y-2">
                {familia.hijos.map((h) => {
                  const codigo = ingresados[h.id]
                  const sugerencia = salonParaHijo(h, salones, servicio.fecha)
                  const salonId = salonDe(h.id)
                  const nombre = `${h.nombre} ${h.apellido}`
                  return (
                    <li key={h.id} data-testid={`nino-${h.id}`} className="space-y-2 rounded-md bg-muted/50 p-2">
                      {codigo ? (
                        <p className="font-medium">
                          {nombre}{' '}
                          <span className="text-sm font-normal text-muted-foreground">Ya ingresó (código {codigo})</span>
                        </p>
                      ) : (
                        <label className="flex min-h-11 items-center gap-3 font-medium">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            aria-label={nombre}
                            checked={Boolean(elegidos[h.id])}
                            onChange={(e) => setElegidos((x) => ({ ...x, [h.id]: e.target.checked }))}
                          />
                          {nombre}
                          {h.es_vip_desde && <Badge variant="outline">VIP</Badge>}
                        </label>
                      )}
                      {alertasDeHijo(h).map((a) => (
                        <p key={a} className="text-sm text-destructive">
                          {a}
                        </p>
                      ))}
                      {!codigo && (
                        <div className="space-y-1">
                          {sugerencia.tipo === 'ninguno' && !salonManual[h.id] && (
                            <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                              Sin salón sugerido: asígnalo manualmente
                            </p>
                          )}
                          <select
                            aria-label={`Salón de ${h.nombre}`}
                            className={SELECT_CLASS}
                            value={salonId ?? ''}
                            onChange={(e) => setSalonManual((x) => ({ ...x, [h.id]: e.target.value }))}
                          >
                            <option value="">Elige un salón…</option>
                            {salones.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                className="h-12 w-full text-base"
                disabled={guardando || !servicio.turnoId}
                onClick={() => void registrarIngreso()}
              >
                {guardando ? 'Registrando…' : 'Registrar ingreso'}
              </Button>
            </section>
          )}
        </>
      )}

      <section className="space-y-2 rounded-lg border p-3" aria-label="Ocupación de salones">
        <h2 className="text-sm font-semibold">
          Ocupación{turnoActual ? ` — ${turnoActual.nombre}` : ''}
        </h2>
        {ocupacion === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : ocupacion.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin salones para este servicio.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {ocupacion.map((o) => (
              <li key={o.salon_id} className="flex justify-between gap-2">
                <span className="truncate">{o.nombre}</span>
                <span className={o.presentes > o.capacidad ? 'font-semibold text-destructive' : 'tabular-nums'}>
                  {o.presentes}/{o.capacidad}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
