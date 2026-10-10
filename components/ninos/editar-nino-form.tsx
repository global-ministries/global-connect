'use client'

import { useState } from 'react'

import { BotonSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import {
  enRangoNinos,
  mensajeDeErrorFamilia,
  validarAutorizados,
  validarEdicionNino,
  type AutorizadoForm,
  type AutorizadoPayload,
  type EdicionNinoPayload,
  type HijoForm,
} from '@/lib/platform/ninos/familia'
import { hijoAForm, type HijoEncontrado } from '@/lib/platform/ninos/familias-vista'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { LIMITES_MIS_HIJOS, validarEdicionMisHijos } from '@/lib/platform/ninos/mis-hijos'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import type { Json } from '@/lib/supabase/database.types'

import { CamposAutorizados, CamposNino, type ModoCamposNino } from './campos-nino'

/** What the form saves: the ficha (identity included unless hidden) and the pickup list. */
export type PayloadEdicionNino = Partial<EdicionNinoPayload> & { autorizados: AutorizadoPayload[] }

type Validacion = { ok: true; payload: PayloadEdicionNino } | { ok: false; errores: string[] }

type Props = {
  hijo: HijoEncontrado
  onGuardado: () => void
  onCancelar: () => void
  /** The rooms that define the child's level and its suggestion. */
  salones?: readonly SalonNivel[]
  /** 'padre' (Mi Perfil → Mis hijos): the parent's fields and limits, never the room. Default 'equipo'. */
  modo?: ModoCamposNino
  /** Parent mode: false hides and never sends the name, birth date and gender (the child has an own account). */
  identidadEditable?: boolean
  /**
   * Saves instead of the team RPCs (ninos_actualizar_nino / ninos_crear_ficha), e.g. a parent through
   * ninos_mis_hijos_guardar. Resolves to { error } with a Spanish message, or null when saved.
   */
  guardar?: (payload: PayloadEdicionNino) => Promise<{ error: string } | null>
}

/** The team's validation: the child's name, birth date, gender, ficha and pickup list. */
function validarEdicionEquipo(form: HijoForm, autorizados: readonly AutorizadoForm[]): Validacion {
  const aut = validarAutorizados(autorizados)
  const ficha = validarEdicionNino(form)
  const errores = [...(ficha.ok ? [] : ficha.errores), ...aut.errores]
  if (!ficha.ok || errores.length > 0) return { ok: false, errores }
  return { ok: true, payload: { ...ficha.payload, autorizados: aut.payload } }
}

/**
 * Edits a child's name, birth date, gender and ficha, and replaces its pickup list (ninos_actualizar_nino).
 * For a linked child without a ficha the same form creates it (ninos_crear_ficha).
 * In parent mode it shows only what a parent may change and saves through `guardar`.
 */
export function EditarNinoForm({ hijo, onGuardado, onCancelar, salones, modo = 'equipo', identidadEditable = true, guardar }: Props) {
  const esPadre = modo === 'padre'
  const [form, setForm] = useState<HijoForm>(() => hijoAForm(hijo))
  const [autorizados, setAutorizados] = useState<AutorizadoForm[]>(() =>
    hijo.autorizados.map((a) => ({ nombre: a.nombre, telefono: a.telefono ?? '', relacion: a.relacion ?? '' })),
  )
  const [errores, setErrores] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  function validar(): Validacion {
    const r = esPadre ? validarEdicionMisHijos(form, autorizados, { identidadEditable }) : validarEdicionEquipo(form, autorizados)
    if (!r.ok) return r
    // A new ficha is only for children in the Niños age range (the RPCs check it too).
    const nacimiento = r.payload.fecha_nacimiento ?? hijo.fecha_nacimiento ?? ''
    if (hijo.tiene_ficha === false && !enRangoNinos(nacimiento, hoyEnCaracas())) {
      return { ok: false, errores: [mensajeDeErrorFamilia({ message: 'fuera_de_rango' })] }
    }
    return r
  }

  /** The team's save. A child linked from the profile has no ficha yet: saving creates it. */
  async function guardarComoEquipo(payload: PayloadEdicionNino): Promise<string | null> {
    const { autorizados: aut, ...ficha } = payload
    const { error } = hijo.tiene_ficha !== false
      ? await createClient().rpc('ninos_actualizar_nino', {
          p_nino_id: hijo.id,
          p: payload as unknown as Json,
        })
      : await createClient().rpc('ninos_crear_ficha', {
          p_nino_id: hijo.id,
          p_ficha: ficha as unknown as Json,
          p_autorizados: aut as unknown as Json,
        })
    return error ? mensajeDeErrorFamilia(error) : null
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const r = validar()
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    setErrores([])
    setGuardando(true)
    const error = guardar ? ((await guardar(r.payload))?.error ?? null) : await guardarComoEquipo(r.payload)
    setGuardando(false)
    if (error) {
      setErrores([error])
      return
    }
    onGuardado()
  }

  const textoBoton = esPadre ? 'Guardar cambios' : hijo.tiene_ficha !== false ? 'Guardar ficha' : 'Crear ficha'

  return (
    <form onSubmit={enviar} className="space-y-6" noValidate>
      <CamposNino indice={0} hijo={form} onChange={setForm} salones={salones} modo={modo} identidadEditable={identidadEditable} />
      <section className="space-y-3">
        <TituloSistema nivel={3}>Personas autorizadas para retirar</TituloSistema>
        {esPadre && (
          <TextoSistema variante="sutil" tamaño="sm">
            El equipo de Niños ve esta lista al entregar a {form.nombre || 'tu hijo'} después del servicio.
          </TextoSistema>
        )}
        <CamposAutorizados
          autorizados={autorizados}
          onChange={setAutorizados}
          maximo={esPadre ? LIMITES_MIS_HIJOS.autorizados : undefined}
        />
      </section>
      {errores.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background py-4">
        <BotonSistema type="button" variante="outline" className="flex-1 sm:flex-none" onClick={onCancelar}>
          Cancelar
        </BotonSistema>
        <BotonSistema type="submit" className="flex-1 sm:flex-none" disabled={guardando}>
          {guardando ? 'Guardando…' : textoBoton}
        </BotonSistema>
      </div>
    </form>
  )
}
