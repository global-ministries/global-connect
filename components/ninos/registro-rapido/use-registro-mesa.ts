'use client'

/**
 * The desk side of the one-screen registration (prototype 04): the same
 * checks and RPCs as the former desk form — a known phone or cédula is never
 * reused silently (ninos_buscar_padre), the confirmed adult's spouse is
 * offered unchecked (ninos_conyuge_de), children already in another family
 * wait for the anfitrión (ninos_hijos_coincidencias), a new parent goes
 * through ninos_registrar_familia_mesa — plus "Registrar y dar ingreso": the
 * existing check-in (/api/ninos/checkin) chained right after. When the
 * check-in fails the family stays registered and the error says so.
 */
import { useEffect, useState } from 'react'

import { armarCheckin, mensajeDeErrorCheckin } from '@/lib/platform/ninos/checkin'
import {
  mensajeDeErrorFamilia,
  parseCoincidencias,
  parseConyuge,
  parseHijosCoincidencias,
  validarFamilia,
  type Conyuge,
  type FamiliaForm,
  type FamiliaPayload,
  type HijoCoincidencia,
  type PadreCoincidencia,
} from '@/lib/platform/ninos/familia'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import { seleccionIngreso } from '@/lib/platform/ninos/registro-rapido'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/client'

import { registrarIngresoApi, type FilaIngreso } from '../api-visita'

/** The service the new children go in to (check-in desk only). */
export type IngresoMesa = { turnoId: string; fecha: string }

export type Guardar = (payload: FamiliaPayload) => Promise<{ padreId: string } | { error: string }>

/** After the registration: the code, or the check-in error, or a new parent to invite. */
export type ResultadoMesa = {
  padreId: string
  consulta: string
  padreNuevo: boolean
  /** `ids`: the new children's ids, in payload order. */
  ingreso?: { payload: FamiliaPayload; ids: string[]; filas: FilaIngreso[] }
  errorIngreso?: string
}

/** The adult's recorded spouse, or null when there is none or the lookup fails. */
async function buscarConyuge(id: string): Promise<Conyuge | null> {
  try {
    const res = await createClient().rpc('ninos_conyuge_de', { p_usuario_id: id })
    return res?.error ? null : parseConyuge(res?.data)
  } catch {
    // Without the lookup the form still registers the children for the adult alone.
    return null
  }
}

/** Children already in another family of the caller's scope; a failed lookup never blocks. */
async function buscarHijosEnOtraFamilia(payload: FamiliaPayload): Promise<HijoCoincidencia[]> {
  try {
    // Not in database.types.ts yet (regenerated after the migration).
    const res = await createClient().rpc('ninos_hijos_coincidencias' as never, {
      p_hijos: payload.hijos,
      p_padre_id: 'id' in payload.padre ? payload.padre.id : null,
    } as never)
    return res?.error ? [] : parseHijosCoincidencias(res?.data)
  } catch {
    return []
  }
}

const consultaDe = (p: FamiliaPayload) => (p.hijos[0] ? `${p.hijos[0].nombre} ${p.hijos[0].apellido}` : '')

type Opciones = {
  padreExistente?: { id: string; nombre: string }
  guardar?: Guardar
  ingreso?: IngresoMesa
  salones: readonly SalonNivel[]
  onRegistrada: (padreId: string, consulta: string) => void
}

export function useRegistroMesa({ padreExistente, guardar, ingreso, salones, onRegistrada }: Opciones) {
  const [errores, setErrores] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [coincidencias, setCoincidencias] = useState<PadreCoincidencia[]>([])
  // An existing adult the anfitrión confirmed from the duplicate check of a new family.
  const [padreConfirmado, setPadreConfirmado] = useState<PadreCoincidencia | null>(null)
  // `de` is the adult it belongs to, so a spouse is never sent for a different adult.
  const [conyuge, setConyuge] = useState<{ de: string; persona: Conyuge } | null>(null)
  const [vincularConyuge, setVincularConyuge] = useState(false)
  const [repetidos, setRepetidos] = useState<{ payload: FamiliaPayload; lista: HijoCoincidencia[] } | null>(null)
  /** The action the anfitrión chose, kept while a duplicate check waits. */
  const [conIngreso, setConIngreso] = useState(false)
  const [resultado, setResultado] = useState<ResultadoMesa | null>(null)

  const padreExistenteId = padreExistente?.id
  useEffect(() => {
    if (!padreExistenteId || guardar) return
    let vigente = true
    void buscarConyuge(padreExistenteId).then((c) => {
      if (vigente && c) setConyuge({ de: padreExistenteId, persona: c })
    })
    return () => {
      vigente = false
    }
  }, [padreExistenteId, guardar])

  async function darIngreso(payload: FamiliaPayload, padreId: string, ids: string[], padreNuevo: boolean) {
    const base = { padreId, consulta: consultaDe(payload), padreNuevo }
    const armado = armarCheckin(seleccionIngreso(payload.hijos, ids, salones, ingreso!.fecha))
    const prefijo = 'La familia quedó registrada, pero no se pudo dar ingreso: '
    if (!armado.ok) return setResultado({ ...base, errorIngreso: prefijo + armado.error })
    const { data, error } = await registrarIngresoApi({ ninoIds: armado.ninoIds, salonIds: armado.salonIds, turnoId: ingreso!.turnoId, fecha: ingreso!.fecha })
    if (error || !data || data.length === 0) return setResultado({ ...base, errorIngreso: prefijo + mensajeDeErrorCheckin(error) })
    setResultado({ ...base, ingreso: { payload, ids, filas: data } })
  }

  async function registrar(payload: FamiliaPayload, ingresar: boolean) {
    setGuardando(true)
    if (guardar) {
      const r = await guardar(payload)
      setGuardando(false)
      if ('error' in r) setErrores([r.error])
      else onRegistrada(r.padreId, consultaDe(payload))
      return
    }
    const conConyuge: FamiliaPayload =
      conyuge && vincularConyuge && 'id' in payload.padre && payload.padre.id === conyuge.de ? { ...payload, conyuge_id: conyuge.persona.id } : payload
    // A new parent goes through the table's RPC, which records who created it (for the invitation).
    const nuevo = !('id' in payload.padre)
    const { data, error } = await createClient().rpc(nuevo ? 'ninos_registrar_familia_mesa' : 'ninos_registrar_familia', { p: conConyuge as unknown as Json })
    if (error) {
      setGuardando(false)
      setErrores([mensajeDeErrorFamilia(error)])
      return
    }
    const res = data as { padre_id?: string; padre_nuevo?: boolean; hijos?: string[] } | null
    if (!res?.padre_id) return setGuardando(false)
    if (ingresar && ingreso) await darIngreso(payload, res.padre_id, res.hijos ?? [], Boolean(res.padre_nuevo))
    else if (res.padre_nuevo) setResultado({ padreId: res.padre_id, consulta: consultaDe(payload), padreNuevo: true })
    else onRegistrada(res.padre_id, consultaDe(payload))
    setGuardando(false)
  }

  /** Registers unless a child already exists in another family; then waits for the anfitrión. */
  async function registrarRevisando(payload: FamiliaPayload, ingresar: boolean) {
    // A pre-registration confirmed through its route keeps its own review.
    if (!guardar) {
      setGuardando(true)
      const lista = await buscarHijosEnOtraFamilia(payload)
      setGuardando(false)
      if (lista.length > 0) return setRepetidos({ payload, lista })
    }
    await registrar(payload, ingresar)
  }

  /** `form` already passed the one-screen checks; `ingresar`: "Registrar y dar ingreso". */
  async function enviar(form: FamiliaForm, ingresar: boolean) {
    setConIngreso(ingresar)
    const r = validarFamilia(form)
    if (!r.ok) return setErrores(r.errores)
    setErrores([])
    setRepetidos(null)
    if ('id' in r.payload.padre) return registrarRevisando(r.payload, ingresar)
    // A known phone or cédula is never reused silently: the anfitrión confirms it first.
    setGuardando(true)
    const { data, error } = await createClient().rpc('ninos_buscar_padre', { p_cedula: form.padre.cedula.trim(), p_telefono: form.padre.telefono.trim() })
    setGuardando(false)
    if (error) return setErrores([mensajeDeErrorFamilia(error)])
    const encontrados = parseCoincidencias(data)
    if (encontrados.length > 0) return setCoincidencias(encontrados)
    await registrarRevisando(r.payload, ingresar)
  }

  async function confirmar(form: FamiliaForm, padre: PadreCoincidencia) {
    const r = validarFamilia({ ...form, padre: { ...form.padre, id: padre.id } })
    setCoincidencias([])
    if (!r.ok) return setErrores(r.errores)
    setPadreConfirmado(padre)
    if (!guardar) {
      setGuardando(true)
      const c = await buscarConyuge(padre.id)
      setGuardando(false)
      if (c) {
        // Stop so the anfitrión decides about the spouse before registering.
        setConyuge({ de: padre.id, persona: c })
        setVincularConyuge(false)
        return
      }
    }
    await registrarRevisando(r.payload, conIngreso)
  }

  function cambiarRepresentante() {
    setPadreConfirmado(null)
    setConyuge(null)
    setVincularConyuge(false)
  }

  async function registrarDeTodosModos() {
    if (!repetidos) return
    const { payload } = repetidos
    setRepetidos(null)
    await registrar(payload, conIngreso)
  }

  return {
    errores,
    guardando,
    coincidencias,
    descartarCoincidencias: () => setCoincidencias([]),
    padreConfirmado,
    conyuge,
    vincularConyuge,
    setVincularConyuge,
    repetidos,
    descartarRepetidos: () => setRepetidos(null),
    resultado,
    enviar,
    confirmar,
    cambiarRepresentante,
    registrarDeTodosModos,
  }
}
