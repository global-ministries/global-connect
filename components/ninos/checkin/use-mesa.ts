'use client'

/**
 * Niños › Check-in — state of the mesa: the family being checked in (found by
 * search, opened from "Llegando" or from a confirmed pre-registration), its
 * children already marked with their salón (checkin-vista), the check-in
 * through /api/ninos/checkin, and the pickup code. "Llegaron" checks a family
 * in with one tap; a child without a salón opens the family here instead.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { alertasDeHijo, armarCheckin, avisosDeCapacidad, mensajeDeErrorCheckin, preferidosAGuardar, type Servicio } from '@/lib/platform/ninos/checkin'
import { hijosMarcados, quienesRetiran, salonDeHijo, type Ingresados, type SalonDeHijo } from '@/lib/platform/ninos/checkin-vista'
import type { FamiliaEncontrada, HijoEncontrado, PadreDeFamilia, SalonFila } from '@/lib/platform/ninos/familias-vista'
import { llegandoAFamilia, type FamiliaLlegando } from '@/lib/platform/ninos/precheck'
import { createClient } from '@/lib/supabase/client'

import { registrarIngresoApi, type FilaIngreso } from '../api-visita'
import { useBuscarFamilias } from '../use-buscar-familias'
import type { ResultadoIngreso } from './codigo-retiro'

const conAgregado = (s: ReadonlySet<string>, id: string, agregar: boolean): Set<string> => {
  const siguiente = new Set(s)
  if (agregar) siguiente.add(id)
  else siguiente.delete(id)
  return siguiente
}

/** `alIngresar` runs after every saved check-in (occupancy and queue reload). */
export function useMesa(salones: readonly SalonFila[], servicio: Servicio, alIngresar: () => void) {
  const busqueda = useBuscarFamilias()
  const { buscar, limpiar } = busqueda
  const [familia, setFamilia] = useState<FamiliaEncontrada | null>(null)
  const [ingresados, setIngresados] = useState<Ingresados>({})
  const [desmarcados, setDesmarcados] = useState<ReadonlySet<string>>(new Set())
  const [salonManual, setSalonManual] = useState<Record<string, string>>({})
  const [selectores, setSelectores] = useState<ReadonlySet<string>>(new Set())
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
    (f: FamiliaEncontrada | null, selectorAbierto?: string) => {
      setFamilia(f)
      setDesmarcados(new Set())
      setSalonManual({})
      setSelectores(new Set(selectorAbierto ? [selectorAbierto] : []))
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
    void cargarIngresados(familia)
    // Re-read who came in when the service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicio])

  const salonDe = useCallback(
    (h: HijoEncontrado): SalonDeHijo => salonDeHijo(h, salones, servicio.fecha, salonManual[h.id]),
    [salones, servicio.fecha, salonManual],
  )

  const marcados = useMemo(
    () => new Set(familia ? hijosMarcados(familia.hijos, ingresados, desmarcados).map((h) => h.id) : []),
    [familia, ingresados, desmarcados],
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
    alIngresar()
  }

  /** Remembers a hand-picked salón on the ficha so it is preselected next Sunday (same path as Familias). */
  async function guardarPreferidos(f: FamiliaEncontrada, ninoIds: string[], salonIds: string[]) {
    const cambios = preferidosAGuardar(
      ninoIds.map((ninoId, i) => {
        const h = f.hijos.find((x) => x.id === ninoId)
        const r = h ? salonDeHijo(h, salones, servicio.fecha) : null
        return { ninoId, salonId: salonIds[i], sugeridoId: r?.salonId ?? null }
      }),
    )
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
    const { data, error: err } = await registrarIngresoApi({ ninoIds: armado.ninoIds, salonIds: armado.salonIds, turnoId: servicio.turnoId, fecha: servicio.fecha })
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
    const armado = armarCheckin(f.hijos.map((h) => ({ ninoId: h.id, salonId: salonDeHijo(h, salones, servicio.fecha).salonId, nombre: h.nombre })))
    if (!armado.ok) {
      elegirFamilia(llegandoAFamilia(f))
      setError(armado.error)
      return null
    }
    const { data, error: err } = await registrarIngresoApi({ ninoIds: armado.ninoIds, salonIds: armado.salonIds, turnoId: servicio.turnoId, fecha: servicio.fecha })
    if (err || !data || data.length === 0) return mensajeDeErrorCheckin(err ?? null)
    mostrarCodigo(f.hijos, llegandoAFamilia(f).padres, data)
    return null
  }

  function siguienteFamilia() {
    setResultado(null)
    limpiar()
    elegirFamilia(null)
  }

  return {
    busqueda,
    familia,
    ingresados,
    marcados,
    selectores,
    error,
    guardando,
    resultado,
    salonDe,
    elegirFamilia,
    buscarYElegir,
    registrarIngreso,
    llegaron,
    siguienteFamilia,
    abrirLlegando: (f: FamiliaLlegando, hijoId: string) => elegirFamilia(llegandoAFamilia(f), hijoId),
    marcar: (id: string, v: boolean) => setDesmarcados((s) => conAgregado(s, id, !v)),
    abrirSelector: (id: string) => setSelectores((s) => conAgregado(s, id, !s.has(id))),
    elegirSalon: (id: string, salonId: string) => setSalonManual((x) => ({ ...x, [id]: salonId })),
  }
}
