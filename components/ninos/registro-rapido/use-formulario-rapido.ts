'use client'

/**
 * State of the one-screen registration, shared by the public QR page and the
 * desk panel: the data, what is missing (lib/platform/ninos/registro-rapido),
 * the inline errors after a send attempt, the sections that fold once left
 * (public page only, prototype 01), the "Para después" fold, and the focus on
 * the first missing field.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import type { AutorizadoForm } from '@/lib/platform/ninos/familia'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import {
  conFechaNacimiento,
  debePlegarse,
  estadoBarra,
  faltantes,
  hijoRapidoVacio,
  seccionCompleta,
  type ContextoRegistro,
  type DatosRapido,
  type HijoRapido,
  type PadreRapido,
  type SeccionRegistro,
} from '@/lib/platform/ninos/registro-rapido'

import { enfocar } from './piezas'

const NINGUNA: Record<SeccionRegistro, boolean> = { tu: false, ninos: false, retiran: false, despues: false }

export function useFormularioRapido(inicial: () => DatosRapido, ctx: ContextoRegistro, salones: readonly SalonNivel[] = []) {
  const [datos, setDatos] = useState<DatosRapido>(inicial)
  const [salio, setSalio] = useState(NINGUNA)
  const [intentado, setIntentado] = useState(false)
  const [despuesAbierto, setDespuesAbierto] = useState(false)
  const foco = useRef<string | null>(null)
  const [pedido, setPedido] = useState(0)

  const { modo, hoy, campusIds, padreConocido, padreNombre } = ctx
  const contexto = useMemo<ContextoRegistro>(
    () => ({ modo, hoy, campusIds, padreConocido, padreNombre }),
    [modo, hoy, campusIds, padreConocido, padreNombre],
  )
  const faltan = useMemo(() => faltantes(datos, contexto), [datos, contexto])
  const errores = useMemo<Record<string, string>>(
    () => (intentado ? Object.fromEntries(faltan.map((f) => [f.id, f.mensaje])) : {}),
    [intentado, faltan],
  )

  // Focus after the render that unfolded the section of the field.
  useEffect(() => {
    enfocar(foco.current)
    foco.current = null
  }, [pedido])
  const enfocarLuego = (id: string) => {
    foco.current = id
    setPedido((n) => n + 1)
  }

  const setPadre = (campo: keyof PadreRapido, valor: string) =>
    setDatos((d) => {
      // The children's surname follows the parent's until it is edited by hand.
      const hijos = campo === 'apellido' ? d.hijos.map((h) => (h.apellido === d.padre.apellido ? { ...h, apellido: valor } : h)) : d.hijos
      return { ...d, padre: { ...d.padre, [campo]: valor }, hijos }
    })
  const setHijo = (i: number, cambios: Partial<HijoRapido>) =>
    setDatos((d) => ({ ...d, hijos: d.hijos.map((h, j) => (j === i ? { ...h, ...cambios } : h)) }))
  const setFecha = (i: number, fecha: string) =>
    setDatos((d) => ({
      ...d,
      // The desk preselects the suggested level (as the old desk form); the public page never stores one.
      hijos: d.hijos.map((h, j) => (j !== i ? h : modo === 'mesa' ? conFechaNacimiento(h, fecha, salones, hoy) : { ...h, fechaNacimiento: fecha })),
    }))
  const agregarHijo = () =>
    setDatos((d) => ({ ...d, hijos: [...d.hijos, hijoRapidoVacio(d.padre.apellido.trim() || d.hijos[0]?.apellido || '')] }))
  const quitarHijo = (i: number) => setDatos((d) => ({ ...d, hijos: d.hijos.filter((_, j) => j !== i) }))
  const setAutorizados = (f: (a: AutorizadoForm[]) => AutorizadoForm[]) => setDatos((d) => ({ ...d, autorizados: f(d.autorizados) }))

  /** True when nothing is missing; otherwise shows the errors and focuses the first missing field. */
  function intentar(): boolean {
    setIntentado(true)
    if (faltan.length === 0) return true
    setSalio((s) => ({ ...s, ...Object.fromEntries(faltan.map((f) => [f.seccion, false])) }))
    if (faltan.some((f) => f.seccion === 'despues')) setDespuesAbierto(true)
    enfocarLuego(faltan[0].id)
    return false
  }

  const plegada = (s: SeccionRegistro) => modo === 'publico' && s !== 'despues' && debePlegarse(seccionCompleta(faltan, s), salio[s])

  return {
    datos,
    setDatos,
    contexto,
    faltan,
    errores,
    intentado,
    estado: estadoBarra(faltan, datos, contexto),
    completa: (s: SeccionRegistro) => seccionCompleta(faltan, s),
    plegada,
    salir: (s: SeccionRegistro) => setSalio((x) => (x[s] ? x : { ...x, [s]: true })),
    /** "Editar" on a folded section: opens it and focuses its first field. */
    editar: (s: SeccionRegistro, primerCampo: string) => {
      setSalio((x) => ({ ...x, [s]: false }))
      enfocarLuego(primerCampo)
    },
    despuesAbierto,
    setDespuesAbierto,
    setPadre,
    setHijo,
    setFecha,
    agregarHijo,
    quitarHijo,
    setAutorizados,
    intentar,
    enfocarLuego,
  }
}

export type FormularioRapido = ReturnType<typeof useFormularioRapido>
