'use client'

/**
 * Estudiantes — the church-wide person search behind "Agregar visitante" and
 * the representante picker: `buscarPersonas({ grupoId, consulta })` once the
 * typing stops for 300 ms and the text passes `argumentosBusqueda` (3+
 * characters; digits are a cédula or teléfono, anything else the full name).
 * The answer keeps its `consulta`, so a caller shows it only while it matches
 * what is typed (a shorter text keeps the last answer but hides it).
 */
import { useEffect, useState } from 'react'

import { buscarPersonas, type PersonaEncontrada } from '@/lib/actions/estudiantes-grupos.actions'
import { argumentosBusqueda } from '@/lib/platform/estudiantes/gestion-grupo'

export const RETRASO_BUSQUEDA_MS = 300
const SIN_CONEXION = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'

export type Busqueda =
  | { readonly tipo: 'cargando'; readonly consulta: string }
  | { readonly tipo: 'listo'; readonly consulta: string; readonly filas: readonly PersonaEncontrada[] }
  | { readonly tipo: 'error'; readonly consulta: string; readonly mensaje: string }

export function useBusquedaPersonas(grupoId: string, consulta: string): Busqueda | null {
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null)

  useEffect(() => {
    const texto = consulta.trim()
    if (argumentosBusqueda(texto) === null) return
    let vigente = true
    const temporizador = setTimeout(() => {
      setBusqueda({ tipo: 'cargando', consulta: texto })
      buscarPersonas({ grupoId, consulta: texto }).then(
        (r) => {
          if (!vigente) return
          setBusqueda(r.ok ? { tipo: 'listo', consulta: texto, filas: r.data } : { tipo: 'error', consulta: texto, mensaje: r.message })
        },
        () => vigente && setBusqueda({ tipo: 'error', consulta: texto, mensaje: SIN_CONEXION }),
      )
    }, RETRASO_BUSQUEDA_MS)
    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [consulta, grupoId])

  return busqueda
}
