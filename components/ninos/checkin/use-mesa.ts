'use client'

/**
 * Niños › Check-in — state of the mesa: the family being checked in (found by
 * search, opened from "Llegando" or from a confirmed pre-registration), its
 * children already marked with their salón (checkin-vista), the check-in
 * through /api/ninos/checkin, and the pickup code. "Llegaron" checks a family
 * in with one tap; a child without a salón opens the family here instead.
 * `foco` asks the mesa to move the keyboard focus (desktop flow, prototype
 * 05): the family opens → "Registrar ingreso", the code → "Siguiente
 * familia", the next family → the search.
 *
 * Desk rules (odd/tasks/ninos-checkin-pco.md, T2d, S9.1, S9.3): each child is
 * placed with the salón rules, its prior visits and the room occupancy; a
 * room full for the child warns with «Usar {otro}» (a room used that way is
 * not remembered on the ficha) and may still be forced: the forced children
 * travel as forzadoIds, never blocked.
 *
 * No salón (T2g, S9.6): a child the rules place nowhere is not marked (the
 * row asks for the missing data), so the rest of the family can go in;
 * «Llegaron» with such a child opens the family here.
 *
 * Print station (T3b, S10): with `estacionId` the check-in body carries it and
 * the server queues the labels there; without it the body is unchanged.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { alertasDeHijo, armarCheckin, avisosDeCapacidad, mensajeDeErrorCheckin, preferidosAGuardar, type Servicio } from '@/lib/platform/ninos/checkin'
import { hijosMarcados, quienesRetiran, type Ingresados, type OcupacionSalon, type SalonDeHijo } from '@/lib/platform/ninos/checkin-vista'
import type { FamiliaEncontrada, HijoEncontrado, PadreDeFamilia, SalonFila } from '@/lib/platform/ninos/familias-vista'
import {
  estadoHijo,
  faltaDeHijo,
  forzadosDe,
  mensajeSinSalon,
  salonDeHijoConReglas,
  type EstadoHijoMesa,
  type VisitasPrevias,
} from '@/lib/platform/ninos/mesa-reglas'
import { llegandoAFamilia, type FamiliaLlegando } from '@/lib/platform/ninos/precheck'
import { createClient } from '@/lib/supabase/client'

import { registrarIngresoApi, type FilaIngreso } from '../api-visita'
import { useBuscarFamilias } from '../use-buscar-familias'
import type { ResultadoIngreso } from './codigo-retiro'

export type ObjetivoFoco = 'registrar' | 'siguiente' | 'buscar'

const conAgregado = (s: ReadonlySet<string>, id: string, agregar: boolean): Set<string> => {
  const siguiente = new Set(s)
  if (agregar) siguiente.add(id)
  else siguiente.delete(id)
  return siguiente
}

/** What the desk knows to place a child (T2d): prior visits (loaded by `cargarVisitas`) and occupancy. */
export type ReglasDeMesa = {
  readonly visitas: VisitasPrevias
  readonly ocupacion: ReadonlyMap<string, OcupacionSalon>
  readonly cargarVisitas: (ninoIds: readonly string[]) => void
}

const SIN_REGLAS: ReglasDeMesa = { visitas: {}, ocupacion: new Map(), cargarVisitas: () => {} }

/** `alIngresar` runs after every saved check-in (occupancy and queue reload). */
export function useMesa(
  salones: readonly SalonFila[],
  servicio: Servicio,
  alIngresar: () => void,
  reglas: ReglasDeMesa = SIN_REGLAS,
  estacionId: string | null = null,
) {
  const { visitas, ocupacion, cargarVisitas } = reglas
  const busqueda = useBuscarFamilias()
  const { buscar, limpiar } = busqueda
  const [familia, setFamilia] = useState<FamiliaEncontrada | null>(null)
  const [ingresados, setIngresados] = useState<Ingresados>({})
  const [desmarcados, setDesmarcados] = useState<ReadonlySet<string>>(new Set())
  const [salonManual, setSalonManual] = useState<Record<string, string>>({})
  /** Children moved with «Usar {otro}» because theirs was full: not remembered on the ficha. */
  const [porLleno, setPorLleno] = useState<ReadonlySet<string>>(new Set())
  const [foco, setFoco] = useState<{ objetivo: ObjetivoFoco; n: number } | null>(null)
  const pedirFoco = useCallback((objetivo: ObjetivoFoco) => setFoco((x) => ({ objetivo, n: (x?.n ?? 0) + 1 })), [])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoIngreso | null>(null)

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
      setDesmarcados(new Set())
      setSalonManual({})
      setPorLleno(new Set())
      setError(null)
      void cargarIngresados(f)
      if (f && f.hijos.length > 0) cargarVisitas(f.hijos.map((h) => h.id))
    },
    [cargarIngresados, cargarVisitas],
  )

  const buscarYElegir = useCallback(
    async (texto: string, padreId?: string): Promise<FamiliaEncontrada | null> => {
      const encontradas = await buscar(texto)
      if (!encontradas) return null
      const f =
        encontradas.find((x) => x.id === padreId || x.padres.some((p) => p.id === padreId)) ??
        (encontradas.length === 1 ? encontradas[0] : null)
      elegirFamilia(f ?? null)
      if (f && !f.sin_hijos) pedirFoco('registrar')
      return f ?? null
    },
    [buscar, elegirFamilia, pedirFoco],
  )

  useEffect(() => {
    void cargarIngresados(familia)
    // Re-read who came in when the service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicio])

  const reglasHijo = useMemo(() => ({ visitas, ocupacion }), [visitas, ocupacion])

  const salonDe = useCallback(
    (h: HijoEncontrado): SalonDeHijo => salonDeHijoConReglas(h, salones, servicio.fecha, salonManual[h.id], reglasHijo),
    [salones, servicio.fecha, salonManual, reglasHijo],
  )

  /** The salón the rules suggest for the child, ignoring a hand pick. */
  const sugeridoDe = useCallback(
    (h: HijoEncontrado): SalonDeHijo => salonDeHijoConReglas(h, salones, servicio.fecha, undefined, reglasHijo),
    [salones, servicio.fecha, reglasHijo],
  )

  /** Visit badge, full room and the other room to offer (S9.1, S9.3). */
  const estadoDe = useCallback(
    (h: HijoEncontrado): EstadoHijoMesa => estadoHijo(h, salonDe(h).salonId, salones, servicio.fecha, reglasHijo),
    [salonDe, salones, servicio.fecha, reglasHijo],
  )

  /** The child fits no salón until its missing data is completed (S9.6). */
  const sinSalon = useCallback(
    (h: HijoEncontrado): boolean => !salonManual[h.id] && faltaDeHijo(h, salones, servicio.fecha) !== null,
    [salonManual, salones, servicio.fecha],
  )

  const marcados = useMemo(
    () => new Set(familia ? hijosMarcados(familia.hijos, ingresados, desmarcados).filter((h) => !sinSalon(h)).map((h) => h.id) : []),
    [familia, ingresados, desmarcados, sinSalon],
  )

  /** The code to write on the tags, one line per child, the full-salón warnings and who may pick up. */
  function mostrarCodigo(hijos: readonly HijoEncontrado[], padres: readonly PadreDeFamilia[], data: FilaIngreso[]) {
    const nombres = Object.fromEntries(salones.map((s) => [s.id, s.nombre]))
    const registrados = hijos.filter((h) => data.some((fila) => fila.nino_id === h.id))
    setResultado({
      codigo: data[0].codigo,
      lineas: data.map((fila) => {
        const h = hijos.find((x) => x.id === fila.nino_id)
        return {
          ninoId: fila.nino_id,
          nombre: h ? `${h.nombre} ${h.apellido}` : 'Niño',
          detalle: [nombres[fila.salon_id] ?? 'salón', ...(h ? alertasDeHijo(h) : [])].join(' · '),
        }
      }),
      avisos: avisosDeCapacidad(data, nombres),
      retiran: quienesRetiran(padres, registrados),
    })
    pedirFoco('siguiente')
    alIngresar()
  }

  /** Remembers a hand-picked salón on the ficha so it is preselected next Sunday (same path as Familias). */
  async function guardarPreferidos(f: FamiliaEncontrada, ninoIds: string[], salonIds: string[]) {
    const cambios = preferidosAGuardar(
      ninoIds.map((ninoId, i) => {
        const h = f.hijos.find((x) => x.id === ninoId)
        const r = h ? sugeridoDe(h) : null
        return { ninoId, salonId: salonIds[i], sugeridoId: r?.salonId ?? null }
      }),
    ).filter((c) => !porLleno.has(c.ninoId))
    if (cambios.length === 0) return
    const supabase = createClient()
    try {
      await Promise.all(cambios.map((c) => supabase.from('ninos_fichas').update({ salon_preferido_id: c.salonId }).eq('usuario_id', c.ninoId)))
    } catch {
      // Best effort: the check-in is already saved; the salón is just not remembered.
    }
  }

  async function registrarIngreso() {
    if (!familia || !servicio.turnoId) return
    const seleccion = familia.hijos.filter((h) => marcados.has(h.id)).map((h) => ({ ninoId: h.id, salonId: salonDe(h).salonId, nombre: h.nombre }))
    const armado = armarCheckin(seleccion)
    if (!armado.ok) {
      setError(armado.error)
      return
    }
    setError(null)
    setGuardando(true)
    const { data, error: err } = await registrarIngresoApi(cuerpoIngreso(armado, familia.hijos, servicio.turnoId))
    setGuardando(false)
    if (err || !data || data.length === 0) {
      setError(mensajeDeErrorCheckin(err ?? null))
      return
    }
    void guardarPreferidos(familia, armado.ninoIds, armado.salonIds)
    mostrarCodigo(familia.hijos, familia.padres, data)
  }

  /** "Llegaron" (P3): the notified children go in with their salón; one without a salón opens the family here. */
  async function llegaron(f: FamiliaLlegando): Promise<string | null> {
    if (!servicio.turnoId) return null
    const sinDato = f.hijos.find((h) => faltaDeHijo(h, salones, servicio.fecha) !== null)
    if (sinDato) {
      elegirFamilia(llegandoAFamilia(f))
      setError(mensajeSinSalon(sinDato.nombre))
      return null
    }
    const armado = armarCheckin(
      f.hijos.map((h) => ({ ninoId: h.id, salonId: salonDeHijoConReglas(h, salones, servicio.fecha, undefined, reglasHijo).salonId, nombre: h.nombre })),
    )
    if (!armado.ok) {
      elegirFamilia(llegandoAFamilia(f))
      setError(armado.error)
      return null
    }
    // A full room warns in the queue row and does not block «Llegaron»: it goes in as forced.
    const { data, error: err } = await registrarIngresoApi(cuerpoIngreso(armado, f.hijos, servicio.turnoId))
    if (err || !data || data.length === 0) return mensajeDeErrorCheckin(err ?? null)
    mostrarCodigo(f.hijos, llegandoAFamilia(f).padres, data)
    return null
  }

  /** The body of /api/ninos/checkin; forzadoIds only when a room is full for a child, estacionId only with a station (else as before). */
  function cuerpoIngreso(armado: { ninoIds: string[]; salonIds: string[] }, hijos: readonly HijoEncontrado[], turnoId: string) {
    const forzadoIds = forzadosDe(
      armado.ninoIds.map((ninoId, i) => ({ ninoId, salonId: armado.salonIds[i] })),
      hijos,
      salones,
      reglasHijo,
    )
    return {
      ninoIds: armado.ninoIds,
      salonIds: armado.salonIds,
      turnoId,
      fecha: servicio.fecha,
      ...(forzadoIds.length > 0 && { forzadoIds }),
      ...(estacionId && { estacionId }),
    }
  }

  function siguienteFamilia() {
    setResultado(null)
    limpiar()
    elegirFamilia(null)
    pedirFoco('buscar')
  }

  return {
    busqueda,
    familia,
    ingresados,
    marcados,
    foco,
    error,
    guardando,
    resultado,
    salonDe,
    sugeridoDe,
    estadoDe,
    elegirFamilia: (f: FamiliaEncontrada | null) => {
      elegirFamilia(f)
      if (f && !f.sin_hijos) pedirFoco('registrar')
    },
    buscarYElegir,
    registrarIngreso,
    llegaron,
    siguienteFamilia,
    /** Opens a family of "Llegando" at the mesa (to change a child's salón). */
    abrirLlegando: (f: FamiliaLlegando) => elegirFamilia(llegandoAFamilia(f)),
    marcar: (id: string, v: boolean) => setDesmarcados((s) => conAgregado(s, id, !v)),
    elegirSalon: (id: string, salonId: string) => {
      setSalonManual((x) => ({ ...x, [id]: salonId }))
      setPorLleno((s) => conAgregado(s, id, false))
    },
    /** «Usar {otro}» (S9.1): today only, the ficha keeps its room. */
    usarOtro: (id: string, salonId: string) => {
      setSalonManual((x) => ({ ...x, [id]: salonId }))
      setPorLleno((s) => conAgregado(s, id, true))
    },
  }
}
