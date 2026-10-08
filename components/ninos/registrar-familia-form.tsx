'use client'

import { useState } from 'react'

import { Plus, X } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import {
  hijoVacio,
  mensajeDeErrorFamilia,
  parseCoincidencias,
  validarFamilia,
  type FamiliaForm,
  type FamiliaPayload,
  type HijoForm,
  type PadreCoincidencia,
} from '@/lib/platform/ninos/familia'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import type { Json } from '@/lib/supabase/database.types'

import { CamposAutorizados, CamposNino, OPCIONES_GENERO } from './campos-nino'

type Props = {
  /** When set, the form only adds children to this parent. */
  padreExistente?: { id: string; nombre: string }
  /** consulta: "Nombre Apellido" of the first child, to find the family again. */
  onRegistrada: (padreId: string, consulta: string) => void
  onCancelar: () => void
  /** Prefilled form (a pre-registration under review). */
  inicial?: FamiliaForm
  /** Replaces the direct RPC (e.g. confirming a pre-registration through its route). */
  guardar?: (payload: FamiliaPayload) => Promise<{ padreId: string } | { error: string }>
  textoGuardar?: string
  /** The rooms that define the child's level and its suggestion. */
  salones?: readonly SalonNivel[]
}

/** Registers a new family (or adds children to a known parent) in one RPC call. */
export function RegistrarFamiliaForm({ padreExistente, onRegistrada, onCancelar, inicial, guardar, textoGuardar, salones }: Props) {
  const [form, setForm] = useState<FamiliaForm>(inicial ?? {
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
    if (guardar) {
      const r = await guardar(payload)
      setGuardando(false)
      if ('error' in r) setErrores([r.error])
      else onRegistrada(r.padreId, payload.hijos[0] ? `${payload.hijos[0].nombre} ${payload.hijos[0].apellido}` : '')
      return
    }
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

  const textoBoton = textoGuardar ?? (padreExistente ? 'Agregar niño' : 'Registrar familia')

  return (
    <form onSubmit={enviar} className="space-y-6" noValidate>
      {padreExistente ? (
        <TextoSistema variante="sutil" tamaño="sm">
          Representante: <span className="font-medium text-foreground">{padreExistente.nombre}</span>
        </TextoSistema>
      ) : (
        <TarjetaSistema className="space-y-4 p-4 md:p-6">
          <TituloSistema nivel={3}>Representante</TituloSistema>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputSistema
              id="padre-nombre"
              label="Nombre"
              aria-label="Nombre del representante"
              value={form.padre.nombre}
              onChange={(e) => setPadre('nombre', e.target.value)}
            />
            <InputSistema
              id="padre-apellido"
              label="Apellido"
              aria-label="Apellido del representante"
              value={form.padre.apellido}
              onChange={(e) => setPadre('apellido', e.target.value)}
            />
            <InputSistema
              id="padre-telefono"
              label="Teléfono"
              type="tel"
              inputMode="tel"
              value={form.padre.telefono}
              onChange={(e) => setPadre('telefono', e.target.value)}
            />
            <InputSistema
              id="padre-cedula"
              label="Cédula (opcional)"
              inputMode="numeric"
              value={form.padre.cedula}
              onChange={(e) => setPadre('cedula', e.target.value)}
            />
            <SelectSistema
              id="padre-genero"
              label="Género"
              aria-label="Género del representante"
              opciones={OPCIONES_GENERO}
              value={form.padre.genero}
              onValueChange={(v) => setPadre('genero', v)}
            />
          </div>
          <TextoSistema variante="sutil" className="text-xs">
            Si el teléfono o la cédula ya existen, te pediremos confirmar a esa persona.
          </TextoSistema>
          {coincidencias.length > 0 && (
            <div role="alert" className="space-y-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                Ya existe una persona con estos datos. ¿Es el representante?
              </p>
              <ul className="space-y-2">
                {coincidencias.map((c) => (
                  <li key={c.id} className="space-y-3 rounded-xl border border-border bg-card p-3 text-foreground">
                    <p className="text-sm">
                      <span className="font-medium">
                        {c.nombre} {c.apellido}
                      </span>
                      {c.telefono && <> · Tel. {c.telefono}</>}
                      {c.cedula && <> · Cédula {c.cedula}</>}
                    </p>
                    <BotonSistema type="button" className="w-full" disabled={guardando} onClick={() => void confirmar(c.id)}>
                      Sí, es esta persona
                    </BotonSistema>
                  </li>
                ))}
              </ul>
              <BotonSistema type="button" variante="outline" className="w-full" onClick={() => setCoincidencias([])}>
                No, corregir datos
              </BotonSistema>
            </div>
          )}
        </TarjetaSistema>
      )}

      <div className={form.hijos.length > 1 ? 'grid gap-4 xl:grid-cols-2' : 'grid gap-4'}>
        {form.hijos.map((h, i) => (
          <TarjetaSistema key={i} className="min-w-0 space-y-4 p-4 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <TituloSistema nivel={3}>Niño {i + 1}</TituloSistema>
              {form.hijos.length > 1 && (
                <BotonSistema
                  type="button"
                  variante="ghost"
                  tamaño="sm"
                  icono={X}
                  onClick={() => setForm((f) => ({ ...f, hijos: f.hijos.filter((_, j) => j !== i) }))}
                >
                  Quitar
                </BotonSistema>
              )}
            </div>
            <CamposNino indice={i} hijo={h} onChange={(x) => setHijo(i, x)} salones={salones} />
          </TarjetaSistema>
        ))}
      </div>
      <BotonSistema
        type="button"
        variante="outline"
        tamaño="sm"
        icono={Plus}
        onClick={() => setForm((f) => ({ ...f, hijos: [...f.hijos, { ...hijoVacio(), apellido: f.hijos[0]?.apellido ?? '' }] }))}
      >
        Agregar otro niño
      </BotonSistema>

      <TarjetaSistema className="space-y-4 p-4 md:p-6">
        <TituloSistema nivel={3}>Personas autorizadas para retirar</TituloSistema>
        <CamposAutorizados autorizados={form.autorizados} onChange={(a) => setForm((f) => ({ ...f, autorizados: a }))} />
      </TarjetaSistema>

      {errores.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-border bg-[var(--surface-primary)] py-4">
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
