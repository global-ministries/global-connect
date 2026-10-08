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
  parseCoincidencias,
  validarFamilia,
  type FamiliaForm,
  type FamiliaPayload,
  type HijoForm,
  type PadreCoincidencia,
} from '@/lib/platform/ninos/familia'
import type { Json } from '@/lib/supabase/database.types'

import { CamposAutorizados, CamposNino, SELECT_CLASS } from './campos-nino'

type Props = {
  /** When set, the form only adds children to this parent. */
  padreExistente?: { id: string; nombre: string }
  /** consulta: "Nombre Apellido" of the first child, to find the family again. */
  onRegistrada: (padreId: string, consulta: string) => void
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
  const [coincidencias, setCoincidencias] = useState<PadreCoincidencia[]>([])

  const setPadre = (campo: keyof FamiliaForm['padre'], v: string) => setForm((f) => ({ ...f, padre: { ...f.padre, [campo]: v } }))
  const setHijo = (i: number, h: HijoForm) => setForm((f) => ({ ...f, hijos: f.hijos.map((x, j) => (j === i ? h : x)) }))

  async function registrar(payload: FamiliaPayload) {
    setGuardando(true)
    const { data, error } = await createClient().rpc('ninos_registrar_familia', { p: payload as unknown as Json })
    setGuardando(false)
    if (error) {
      setErrores([mensajeDeErrorFamilia(error)])
      return
    }
    const padreId = (data as { padre_id?: string } | null)?.padre_id
    const primero = payload.hijos[0]
    if (padreId) onRegistrada(padreId, primero ? `${primero.nombre} ${primero.apellido}` : '')
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const r = validarFamilia(form)
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    setErrores([])
    if ('id' in r.payload.padre) {
      await registrar(r.payload)
      return
    }
    // A known phone or cédula is never reused silently: the anfitrión confirms it first.
    setGuardando(true)
    const { data, error } = await createClient().rpc('ninos_buscar_padre', {
      p_cedula: form.padre.cedula.trim(),
      p_telefono: form.padre.telefono.trim(),
    })
    setGuardando(false)
    if (error) {
      setErrores([mensajeDeErrorFamilia(error)])
      return
    }
    const encontrados = parseCoincidencias(data)
    if (encontrados.length > 0) {
      setCoincidencias(encontrados)
      return
    }
    await registrar(r.payload)
  }

  async function confirmar(padreId: string) {
    const r = validarFamilia({ ...form, padre: { ...form.padre, id: padreId } })
    setCoincidencias([])
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    await registrar(r.payload)
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
          <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
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
          <p className="text-xs text-muted-foreground">Si el teléfono o la cédula ya existen, te pediremos confirmar a esa persona.</p>
          {coincidencias.length > 0 && (
            <div role="alert" className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <p className="text-sm font-medium">Ya existe una persona con estos datos. ¿Es el representante?</p>
              <ul className="space-y-2">
                {coincidencias.map((c) => (
                  <li key={c.id} className="space-y-2 rounded-md bg-background p-2 text-foreground">
                    <p className="text-sm">
                      <span className="font-medium">
                        {c.nombre} {c.apellido}
                      </span>
                      {c.telefono && <> · Tel. {c.telefono}</>}
                      {c.cedula && <> · Cédula {c.cedula}</>}
                    </p>
                    <Button type="button" className="h-11 w-full" disabled={guardando} onClick={() => void confirmar(c.id)}>
                      Sí, es esta persona
                    </Button>
                  </li>
                ))}
              </ul>
              <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setCoincidencias([])}>
                No, corregir datos
              </Button>
            </div>
          )}
        </section>
      )}

      <div className={form.hijos.length > 1 ? 'grid gap-4 xl:grid-cols-2' : 'grid gap-4'}>
        {form.hijos.map((h, i) => (
          <section key={i} className="min-w-0 space-y-3 rounded-lg border p-3 md:p-4">
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
      </div>
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
