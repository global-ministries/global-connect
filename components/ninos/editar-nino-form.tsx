'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
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

/** Edits a child's name, birth date, gender and ficha, and replaces its pickup list (ninos_actualizar_nino). */
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
    const { error } = await createClient().rpc('ninos_actualizar_nino', {
      p_nino_id: hijo.id,
      p: { ...ficha.payload, autorizados: aut.payload } as unknown as Json,
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
        <h2 className="text-base font-semibold">Personas autorizadas para retirar</h2>
        <CamposAutorizados autorizados={autorizados} onChange={setAutorizados} />
      </section>
      {errores.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="sticky bottom-0 flex gap-2 bg-background py-3">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" className="h-11 flex-1" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar ficha'}
        </Button>
      </div>
    </form>
  )
}
