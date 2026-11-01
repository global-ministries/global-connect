'use client'

/**
 * State of the Editar persona form (S14 of odd/tasks/sistema-diseno-v2.md):
 * loaded values, current values, touched fields, the save attempt and the
 * server's field errors. Errors show once a field was touched, after a save
 * attempt, or when the server answered for that field (decision 4).
 */
import { useMemo, useState } from 'react'

import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { validarEdicion, type CampoEdicion, type ValoresEdicion } from '@/lib/platform/usuarios/editar-validacion'
import { camposCambiados, resumenErrores } from '@/lib/platform/usuarios/editar-vista'
import { normalizarCedula } from '@/lib/utils/cedula'
import { formatearTelefono } from '@/lib/utils/telefono'

type Errores = Partial<Record<CampoEdicion, string>>

/** How a saved value reads back (canonical cédula, formatted phone). */
export function comoGuardado(v: ValoresEdicion): ValoresEdicion {
  const cedula = v.cedula.trim()
  return { ...v, cedula: cedula ? (normalizarCedula(cedula) ?? cedula) : '', telefono: formatearTelefono(v.telefono.trim()) }
}

export function useFormularioEditar(inicial: ValoresEdicion) {
  const [base, setBase] = useState(inicial)
  const [valores, setValores] = useState(inicial)
  const [tocados, setTocados] = useState<ReadonlySet<CampoEdicion>>(new Set())
  const [intento, setIntento] = useState(false)
  const [servidor, setServidor] = useState<Errores>({})

  const { errores: propios, avisos } = useMemo(() => validarEdicion(valores, hoyEnCaracas()), [valores])
  const errores: Errores = useMemo(() => ({ ...propios, ...servidor }), [propios, servidor])
  const cambios = useMemo(() => camposCambiados(base, valores), [base, valores])
  const visibles: Errores = useMemo(
    () => Object.fromEntries(Object.entries(errores).filter(([k]) => intento || tocados.has(k as CampoEdicion) || servidor[k as CampoEdicion])),
    [errores, intento, tocados, servidor],
  )
  const resumen = useMemo(
    () => resumenErrores(Object.fromEntries(Object.entries(errores).filter(([k]) => intento || servidor[k as CampoEdicion]))),
    [errores, intento, servidor],
  )

  const cambiar = (parcial: Partial<ValoresEdicion>) => {
    setValores((v) => ({ ...v, ...parcial }))
    // Editing the field clears the server's answer for it.
    if ('cedula' in parcial || 'calle' in parcial) {
      setServidor((s) => {
        const resto = { ...s }
        if ('cedula' in parcial) delete resto.cedula
        if ('calle' in parcial) delete resto.calle
        return resto
      })
    }
  }

  const tocar = (campo: CampoEdicion) => setTocados((t) => (t.has(campo) ? t : new Set(t).add(campo)))

  /** After a successful save: the saved values become the new base. */
  const confirmarGuardado = () => {
    const guardado = comoGuardado(valores)
    setBase(guardado)
    setValores(guardado)
    setTocados(new Set())
    setIntento(false)
    setServidor({})
  }

  const descartar = () => {
    setValores(base)
    setTocados(new Set())
    setIntento(false)
    setServidor({})
  }

  return {
    valores,
    avisos,
    errores,
    visibles,
    resumen,
    cambios,
    cambiar,
    tocar,
    intentar: () => setIntento(true),
    errorDelServidor: (campo: CampoEdicion, mensaje: string) => setServidor((s) => ({ ...s, [campo]: mensaje })),
    confirmarGuardado,
    descartar,
  }
}
