'use client'

import { useState } from 'react'

import { BotonSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import { mensajeDeErrorFamilia, validarAutorizados, validarEdicionNino, type AutorizadoForm, type HijoForm } from '@/lib/platform/ninos/familia'
import { hijoAForm, type HijoEncontrado } from '@/lib/platform/ninos/familias-vista'
import type { Json } from '@/lib/supabase/database.types'

import { CamposAutorizados, CamposNino } from './campos-nino'

type Props = {
  hijo: HijoEncontrado
  onGuardado: () => void
  onCancelar: () => void
}

/**
 * Edits a child's name, birth date, gender and ficha, and replaces its pickup list (ninos_actualizar_nino).
 * For a linked child without a ficha the same form creates it (ninos_crear_ficha).
 */
export function EditarNinoForm({ hijo, onGuardado, onCancelar }: Props) {
  const [form, setForm] = useState<HijoForm>(() => hijoAForm(hijo))
  const [autorizados, setAutorizados] = useState<AutorizadoForm[]>(() =>
    hijo.autorizados.map((a) => ({ nombre: a.nombre, telefono: a.telefono ?? '', relacion: a.relacion ?? '' })),
  )
  const [errores, setErrores] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const aut = validarAutorizados(autorizados)
    const ficha = validarEdicionNino(form)
    const errs = [...(ficha.ok ? [] : ficha.errores), ...aut.errores]
    if (!ficha.ok || errs.length > 0) {
      setErrores(errs)
      return
    }
    setErrores([])
    setGuardando(true)
    // A child linked from the profile has no ficha yet: saving creates it.
    const { error } = hijo.tiene_ficha !== false
      ? await createClient().rpc('ninos_actualizar_nino', {
          p_nino_id: hijo.id,
          p: { ...ficha.payload, autorizados: aut.payload } as unknown as Json,
        })
      : await createClient().rpc('ninos_crear_ficha', {
          p_nino_id: hijo.id,
          p_ficha: ficha.payload as unknown as Json,
          p_autorizados: aut.payload as unknown as Json,
        })
    setGuardando(false)
    if (error) {
      setErrores([mensajeDeErrorFamilia(error)])
      return
    }
    onGuardado()
  }

  return (
    <form onSubmit={enviar} className="space-y-6" noValidate>
      <CamposNino indice={0} hijo={form} onChange={setForm} />
      <section className="space-y-3">
        <TituloSistema nivel={3}>Personas autorizadas para retirar</TituloSistema>
        <CamposAutorizados autorizados={autorizados} onChange={setAutorizados} />
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
          {guardando ? 'Guardando…' : hijo.tiene_ficha !== false ? 'Guardar ficha' : 'Crear ficha'}
        </BotonSistema>
      </div>
    </form>
  )
}
