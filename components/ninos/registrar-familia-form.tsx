'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import {
  GENEROS,
  hijoVacio,
  mensajeDeErrorFamilia,
  validarFamilia,
  type FamiliaForm,
  type HijoForm,
} from '@/lib/platform/ninos/familia'
import type { Json } from '@/lib/supabase/database.types'

import { CamposAutorizados, CamposNino, SELECT_CLASS } from './campos-nino'

type Props = {
  /** When set, the form only adds children to this parent. */
  padreExistente?: { id: string; nombre: string }
  onRegistrada: (padreId: string) => void
  onCancelar: () => void
}

/** Registers a new family (or adds children to a known parent) in one RPC call. */
export function RegistrarFamiliaForm({ padreExistente, onRegistrada, onCancelar }: Props) {
  const [form, setForm] = useState<FamiliaForm>({
    padre: { id: padreExistente?.id, nombre: '', apellido: '', telefono: '', cedula: '', genero: '' },
    hijos: [hijoVacio()],
    autorizados: [],
  })
  const [errores, setErrores] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  const setPadre = (campo: keyof FamiliaForm['padre'], v: string) => setForm((f) => ({ ...f, padre: { ...f.padre, [campo]: v } }))
  const setHijo = (i: number, h: HijoForm) => setForm((f) => ({ ...f, hijos: f.hijos.map((x, j) => (j === i ? h : x)) }))

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const r = validarFamilia(form)
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    setErrores([])
    setGuardando(true)
    const { data, error } = await createClient().rpc('ninos_registrar_familia', { p: r.payload as unknown as Json })
    setGuardando(false)
    if (error) {
      setErrores([mensajeDeErrorFamilia(error)])
      return
    }
    const padreId = (data as { padre_id?: string } | null)?.padre_id
    if (padreId) onRegistrada(padreId)
  }

  const textoBoton = padreExistente ? 'Agregar niño' : 'Registrar familia'

  return (
    <form onSubmit={enviar} className="space-y-6" noValidate>
      {padreExistente ? (
        <p className="text-sm text-muted-foreground">
          Representante: <span className="font-medium text-foreground">{padreExistente.nombre}</span>
        </p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Representante</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="padre-nombre">Nombre</Label>
              <Input id="padre-nombre" aria-label="Nombre del representante" value={form.padre.nombre} onChange={(e) => setPadre('nombre', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="padre-apellido">Apellido</Label>
              <Input id="padre-apellido" aria-label="Apellido del representante" value={form.padre.apellido} onChange={(e) => setPadre('apellido', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="padre-telefono">Teléfono</Label>
              <Input id="padre-telefono" type="tel" inputMode="tel" value={form.padre.telefono} onChange={(e) => setPadre('telefono', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="padre-cedula">Cédula (opcional)</Label>
              <Input id="padre-cedula" inputMode="numeric" value={form.padre.cedula} onChange={(e) => setPadre('cedula', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="padre-genero">Género</Label>
              <select
                id="padre-genero"
                aria-label="Género del representante"
                className={SELECT_CLASS}
                value={form.padre.genero}
                onChange={(e) => setPadre('genero', e.target.value)}
              >
                <option value="">Elige…</option>
                {GENEROS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Si el teléfono o la cédula ya existen, se usa esa persona.</p>
        </section>
      )}

      {form.hijos.map((h, i) => (
        <section key={i} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Niño {i + 1}</h2>
            {form.hijos.length > 1 && (
              <button
                type="button"
                className="text-sm text-muted-foreground underline"
                onClick={() => setForm((f) => ({ ...f, hijos: f.hijos.filter((_, j) => j !== i) }))}
              >
                Quitar
              </button>
            )}
          </div>
          <CamposNino indice={i} hijo={h} onChange={(x) => setHijo(i, x)} />
        </section>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-primary underline"
        onClick={() => setForm((f) => ({ ...f, hijos: [...f.hijos, { ...hijoVacio(), apellido: f.hijos[0]?.apellido ?? '' }] }))}
      >
        + Agregar otro niño
      </button>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Personas autorizadas para retirar</h2>
        <CamposAutorizados autorizados={form.autorizados} onChange={(a) => setForm((f) => ({ ...f, autorizados: a }))} />
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
          {guardando ? 'Guardando…' : textoBoton}
        </Button>
      </div>
    </form>
  )
}
