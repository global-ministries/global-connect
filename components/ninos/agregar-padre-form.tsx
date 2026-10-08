'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import {
  mensajeDeErrorFamilia,
  padreNuevoVacio,
  parseCoincidencias,
  validarPadreNuevo,
  type PadreCoincidencia,
  type PadreNuevoForm,
} from '@/lib/platform/ninos/familia'
import type { FamiliaEncontrada } from '@/lib/platform/ninos/familias-vista'
import type { Json } from '@/lib/supabase/database.types'

import { OPCIONES_GENERO } from './campos-nino'

type Props = {
  familia: FamiliaEncontrada
  onVinculado: () => void
  onCancelar: () => void
}

type Modo = 'existente' | 'nueva'

/**
 * "Agregar padre o madre": links an existing person (found with the masked
 * ninos_buscar_padre lookup and explicitly confirmed) or a new adult as the
 * parent of the checked children (ninos_vincular_padre).
 */
export function AgregarPadreForm({ familia, onVinculado, onCancelar }: Props) {
  const [elegidos, setElegidos] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(familia.hijos.map((h) => [h.id, true])),
  )
  const [modo, setModo] = useState<Modo>('existente')
  const [cedula, setCedula] = useState('')
  const [telefono, setTelefono] = useState('')
  const [coincidencias, setCoincidencias] = useState<PadreCoincidencia[] | null>(null)
  const [nuevo, setNuevo] = useState<PadreNuevoForm>(padreNuevoVacio)
  const [errores, setErrores] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  const ninoIds = familia.hijos.filter((h) => elegidos[h.id]).map((h) => h.id)
  const setCampo = (k: keyof PadreNuevoForm, v: string) => setNuevo((p) => ({ ...p, [k]: v }))

  async function vincular(padre: { id: string } | { nuevo: Json }) {
    if (ninoIds.length === 0) {
      setErrores(['Elige al menos un niño.'])
      return
    }
    setErrores([])
    setGuardando(true)
    const { error } = await createClient().rpc('ninos_vincular_padre', {
      p_nino_ids: ninoIds,
      p_padre_id: 'id' in padre ? padre.id : null,
      p_padre_nuevo: 'nuevo' in padre ? padre.nuevo : null,
    })
    setGuardando(false)
    if (error) {
      setErrores([mensajeDeErrorFamilia(error)])
      return
    }
    onVinculado()
  }

  async function buscar() {
    if (!cedula.trim() && telefono.replace(/\D/g, '').length < 7) {
      setErrores(['Escribe la cédula o un teléfono válido.'])
      return
    }
    setErrores([])
    setGuardando(true)
    const { data, error } = await createClient().rpc('ninos_buscar_padre', {
      p_cedula: cedula.trim(),
      p_telefono: telefono.trim(),
    })
    setGuardando(false)
    if (error) {
      setErrores([mensajeDeErrorFamilia(error)])
      return
    }
    setCoincidencias(parseCoincidencias(data))
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (ninoIds.length === 0) {
      setErrores(['Elige al menos un niño.'])
      return
    }
    const r = validarPadreNuevo(nuevo)
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    await vincular({ nuevo: r.payload as unknown as Json })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <TituloSistema nivel={3}>¿De qué niños?</TituloSistema>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {familia.hijos.map((h) => {
            const nombre = `${h.nombre} ${h.apellido}`
            return (
              <li key={h.id} className="p-3">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 rounded accent-[var(--brand-primary)]"
                    aria-label={nombre}
                    checked={Boolean(elegidos[h.id])}
                    onChange={(e) => setElegidos((x) => ({ ...x, [h.id]: e.target.checked }))}
                  />
                  {nombre}
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de persona">
        {(['existente', 'nueva'] as const).map((m) => (
          <BotonSistema
            key={m}
            type="button"
            variante={modo === m ? 'primario' : 'outline'}
            aria-pressed={modo === m}
            onClick={() => {
              setModo(m)
              setErrores([])
            }}
          >
            {m === 'existente' ? 'Persona existente' : 'Persona nueva'}
          </BotonSistema>
        ))}
      </div>

      {modo === 'existente' ? (
        <section className="space-y-4">
          <TextoSistema variante="sutil" tamaño="sm">
            Búscala por cédula o teléfono y confirma que es la persona correcta.
          </TextoSistema>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputSistema
              id="vinculo-cedula"
              label="Cédula"
              aria-label="Cédula de la persona"
              inputMode="numeric"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
            />
            <InputSistema
              id="vinculo-telefono"
              label="Teléfono"
              aria-label="Teléfono de la persona"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
          <BotonSistema type="button" variante="outline" icono={Search} disabled={guardando} onClick={() => void buscar()}>
            Buscar persona
          </BotonSistema>
          {coincidencias && coincidencias.length === 0 && (
            <TextoSistema variante="sutil" tamaño="sm">
              No encontramos a nadie con esos datos. Puedes registrarla como persona nueva.
            </TextoSistema>
          )}
          {coincidencias && coincidencias.length > 0 && (
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
                  <BotonSistema type="button" className="w-full" disabled={guardando} onClick={() => void vincular({ id: c.id })}>
                    Sí, es esta persona
                  </BotonSistema>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <form id="form-padre-nuevo" onSubmit={crear} className="grid gap-4 sm:grid-cols-2" noValidate>
          <InputSistema id="nuevo-nombre" label="Nombre" value={nuevo.nombre} onChange={(e) => setCampo('nombre', e.target.value)} />
          <InputSistema id="nuevo-apellido" label="Apellido" value={nuevo.apellido} onChange={(e) => setCampo('apellido', e.target.value)} />
          <InputSistema
            id="nuevo-telefono"
            label="Teléfono"
            type="tel"
            inputMode="tel"
            value={nuevo.telefono}
            onChange={(e) => setCampo('telefono', e.target.value)}
          />
          <SelectSistema
            id="nuevo-genero"
            label="Género"
            opciones={OPCIONES_GENERO}
            value={nuevo.genero}
            onValueChange={(v) => setCampo('genero', v)}
          />
          <InputSistema
            id="nuevo-cedula"
            label="Cédula (opcional)"
            inputMode="numeric"
            value={nuevo.cedula}
            onChange={(e) => setCampo('cedula', e.target.value)}
          />
          <InputSistema
            id="nuevo-email"
            label="Correo (opcional)"
            type="email"
            inputMode="email"
            value={nuevo.email}
            onChange={(e) => setCampo('email', e.target.value)}
          />
        </form>
      )}

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
        {modo === 'nueva' && (
          <BotonSistema type="submit" form="form-padre-nuevo" className="flex-1 sm:flex-none" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Agregar a la familia'}
          </BotonSistema>
        )}
      </div>
    </div>
  )
}
